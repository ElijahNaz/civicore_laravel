import sys
import json
import os
import re
import argparse
import time
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Literal, Optional
# import easyocr (Moved to get_reader for memory efficiency)
from PIL import Image
import fitz  # PyMuPDF

try:
    import docx
except ImportError:
    docx = None

try:
    import pytesseract
    # Common Windows path for Tesseract
    TESS_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
    if os.path.exists(TESS_PATH):
        pytesseract.pytesseract.tesseract_cmd = TESS_PATH
    
    # Verify it works
    pytesseract.get_tesseract_version()
    PYTESSERACT_AVAILABLE = True
except Exception:
    PYTESSERACT_AVAILABLE = False

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- Document-type detection -------------------------------------------------
BIRTH_KEYWORDS    = ['certificate of live birth', 'live birth', 'birth certificate', 'date of birth',
                     'place of birth', 'sex', 'father', 'mother', 'philsys', 'republic form no. 102']
DEATH_KEYWORDS    = ['certificate of death', 'death certificate', 'cause of death', 'date of death',
                     'place of death', 'deceased', 'attendant', 'republic form no. 103']
MARRIAGE_KEYWORDS = ['certificate of marriage', 'marriage license', 'marriage contract', 'husband',
                     'wife', 'spouse', 'date of marriage', 'place of marriage', 'republic form no. 97']

DEFAULT_QUICK_FILL_TEMPLATE_FAMILIES = {
    "birth": {
        "markers": [
            "certificate of live birth",
            "republic form no. 102",
            "municipal form no. 102",
        ],
        "roi_fields": {
            "full_name": (0.10, 0.20, 0.88, 0.30),
            "date_of_birth": (0.10, 0.30, 0.55, 0.38),
            "registry_number": (0.60, 0.14, 0.93, 0.22),
            "barangay": (0.07, 0.44, 0.46, 0.53),
        },
    },
    "death": {
        "markers": [
            "certificate of death",
            "republic form no. 103",
            "municipal form no. 103",
        ],
        "roi_fields": {
            "full_name": (0.10, 0.19, 0.88, 0.30),
            "date_of_death": (0.10, 0.30, 0.55, 0.38),
            "registry_number": (0.60, 0.14, 0.93, 0.22),
            "barangay": (0.07, 0.43, 0.46, 0.52),
        },
    },
    "marriage": {
        "markers": [
            "certificate of marriage",
            "republic form no. 97",
            "municipal form no. 97",
        ],
        "roi_fields": {
            "husbands_name": (0.10, 0.22, 0.88, 0.30),
            "wifes_name": (0.10, 0.30, 0.88, 0.38),
            "date_of_marriage": (0.10, 0.38, 0.55, 0.46),
            "registry_number": (0.60, 0.14, 0.93, 0.22),
            "barangay": (0.07, 0.46, 0.46, 0.55),
        },
    },
}

DEFAULT_QUICK_FILL_REQUIRED_FIELDS = {
    "birth": ["full_name", "date_of_birth", "registry_number", "barangay"],
    "death": ["full_name", "date_of_death", "registry_number", "barangay"],
    "marriage": ["husbands_name", "wifes_name", "date_of_marriage", "registry_number", "barangay"],
}

QUICK_FILL_MIN_CONFIDENCE = 0.62
QUICK_FILL_MIN_MARKER_HITS = 2
TEMPLATE_PROFILE_PATH = Path(__file__).resolve().parent / "Templates" / "roi_profiles.json"
QUICK_FILL_TEMPLATE_FAMILIES = DEFAULT_QUICK_FILL_TEMPLATE_FAMILIES
QUICK_FILL_REQUIRED_FIELDS = DEFAULT_QUICK_FILL_REQUIRED_FIELDS

DATE_PATTERNS = [
    r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',
    r'\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\b',
]

def load_template_profiles():
    global QUICK_FILL_TEMPLATE_FAMILIES, QUICK_FILL_REQUIRED_FIELDS
    if not TEMPLATE_PROFILE_PATH.exists():
        print(f"No external ROI profile found at {TEMPLATE_PROFILE_PATH}; using built-in defaults.")
        return

    try:
        with open(TEMPLATE_PROFILE_PATH, "r", encoding="utf-8") as f:
            payload = json.load(f)
        families = payload.get("families", {})
        required_fields = payload.get("required_fields", {})
        if isinstance(families, dict) and families:
            QUICK_FILL_TEMPLATE_FAMILIES = families
        if isinstance(required_fields, dict) and required_fields:
            QUICK_FILL_REQUIRED_FIELDS = required_fields
        print(f"Loaded external ROI profile from {TEMPLATE_PROFILE_PATH}")
    except Exception as exc:
        print(f"Failed to load ROI profile ({TEMPLATE_PROFILE_PATH}): {exc}. Using built-in defaults.")

def detect_document_type(text: str) -> str:
    lower = text.lower()
    birth_hits    = sum(1 for kw in BIRTH_KEYWORDS    if kw in lower)
    death_hits    = sum(1 for kw in DEATH_KEYWORDS    if kw in lower)
    marriage_hits = sum(1 for kw in MARRIAGE_KEYWORDS if kw in lower)
    scores = {'birth': birth_hits, 'death': death_hits, 'marriage': marriage_hits}
    best = max(scores, key=scores.get)
    # Default to 'unknown' if no clear indicators are found
    return best if scores[best] > 0 else 'unknown'

def _normalize_roi_text(value: str) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip())

def _field_expected_type(field_name: str) -> str:
    lower = (field_name or '').lower()
    if 'date' in lower:
        return 'date'
    if 'registry' in lower:
        return 'registry'
    if 'barangay' in lower or 'brgy' in lower:
        return 'barangay'
    if 'name' in lower:
        return 'name'
    return 'text'

def _extract_likely_date(value: str) -> str:
    for pattern in DATE_PATTERNS:
        m = re.search(pattern, value, re.IGNORECASE)
        if m:
            return m.group(0)
    return value

def _validate_field_value(field_name: str, value: str) -> bool:
    expected_type = _field_expected_type(field_name)
    text = _normalize_roi_text(value)
    if not text:
        return False

    if expected_type == 'date':
        return any(re.search(pat, text, re.IGNORECASE) for pat in DATE_PATTERNS)
    if expected_type == 'name':
        letter_count = len(re.findall(r'[A-Za-z]', text))
        digit_count = len(re.findall(r'\d', text))
        return letter_count >= 3 and digit_count <= 2
    if expected_type == 'registry':
        return bool(re.search(r'[A-Za-z0-9]', text)) and len(re.sub(r'[^A-Za-z0-9]', '', text)) >= 4
    if expected_type == 'barangay':
        return len(text) >= 3 and len(re.findall(r'[A-Za-z]', text)) >= 2
    return len(text) >= 2

def _validate_input_file(file_path: str, expected_extensions=None):
    if not file_path or not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise HTTPException(status_code=400, detail='File not found or inaccessible.')

    if os.path.getsize(file_path) == 0:
        raise HTTPException(status_code=400, detail='Uploaded file is empty.')

    if expected_extensions is None:
        expected_extensions = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp', '.docx', '.txt', '.rtf']

    ext = Path(file_path).suffix.lower()
    if ext not in expected_extensions:
        raise HTTPException(status_code=400, detail=f'Unsupported file type: {ext}')

    with open(file_path, 'rb') as fp:
        magic = fp.read(16)

    if ext == '.pdf' and not magic.startswith(b'%PDF-'):
        raise HTTPException(status_code=400, detail='Corrupt or invalid PDF file.')
    if ext in ['.jpg', '.jpeg'] and magic[:2] != b'\xFF\xD8':
        raise HTTPException(status_code=400, detail='Corrupt or invalid JPEG file.')
    if ext == '.png' and magic[:8] != b'\x89PNG\r\n\x1a\n':
        raise HTTPException(status_code=400, detail='Corrupt or invalid PNG file.')
    if ext == '.webp' and not (magic[:4] == b'RIFF' and magic[8:12] == b'WEBP'):
        raise HTTPException(status_code=400, detail='Corrupt or invalid WEBP file.')
    if ext == '.bmp' and magic[:2] != b'BM':
        raise HTTPException(status_code=400, detail='Corrupt or invalid BMP file.')
    if ext == '.tiff' and magic[:4] not in [b'II*\x00', b'MM\x00*']:
        raise HTTPException(status_code=400, detail='Corrupt or invalid TIFF file.')
    if ext == '.docx' and magic[:4] != b'PK\x03\x04':
        raise HTTPException(status_code=400, detail='Corrupt or invalid DOCX file.')

    return ext


def _roi_to_pixels(roi, width: int, height: int):
    x1, y1, x2, y2 = roi
    left = max(0, int(width * x1))
    top = max(0, int(height * y1))
    right = min(width, int(width * x2))
    bottom = min(height, int(height * y2))
    return left, top, right, bottom

def _run_tesseract_roi(crop: Image.Image):
    if not PYTESSERACT_AVAILABLE:
        return '', 0.0

    config = '--oem 1 --psm 6'
    try:
        data = pytesseract.image_to_data(
            crop,
            output_type=pytesseract.Output.DICT,
            config=config
        )
        words, confidences = [], []
        for txt, conf in zip(data.get('text', []), data.get('conf', [])):
            cleaned = (txt or '').strip()
            if not cleaned:
                continue
            words.append(cleaned)
            try:
                conf_float = float(conf)
            except (ValueError, TypeError):
                conf_float = -1
            if conf_float >= 0:
                confidences.append(conf_float / 100.0)

        merged_text = _normalize_roi_text(' '.join(words))
        avg_conf = round(sum(confidences) / len(confidences), 3) if confidences else (0.9 if merged_text else 0.0)
        return merged_text, avg_conf
    except Exception:
        return '', 0.0

def _run_easyocr_roi(crop: Image.Image):
    reader = get_reader()
    if not reader:
        return '', 0.0
    try:
        results = reader.readtext(crop)
        texts = [item[1].strip() for item in results if item[1].strip()]
        scores = [float(item[2]) for item in results if item[1].strip()]
        merged_text = _normalize_roi_text(' '.join(texts))
        avg_conf = round(sum(scores) / len(scores), 3) if scores else 0.0
        return merged_text, avg_conf
    except Exception:
        return '', 0.0

def detect_template_family(image_path: str):
    try:
        img = Image.open(image_path).convert('L')
    except Exception:
        return None, ''

    width, height = img.size
    header_crop = img.crop((0, 0, width, max(int(height * 0.22), 1)))
    header_text, _ = _run_tesseract_roi(header_crop)
    if not header_text:
        header_text, _ = _run_easyocr_roi(header_crop)

    lower_header = header_text.lower()
    best_family, best_hits = None, 0
    for family, cfg in QUICK_FILL_TEMPLATE_FAMILIES.items():
        hits = sum(1 for marker in cfg["markers"] if marker in lower_header)
        if hits > best_hits:
            best_hits = hits
            best_family = family

    selected_family = best_family if best_hits >= QUICK_FILL_MIN_MARKER_HITS else None
    return selected_family, header_text, best_hits

def quick_fill_extract_from_rois(image_path: str, template_family: str):
    cfg = QUICK_FILL_TEMPLATE_FAMILIES.get(template_family)
    if not cfg:
        return {}, {}

    try:
        img = Image.open(image_path).convert('L')
    except Exception:
        return {}, {}

    width, height = img.size
    fields = {}
    confidence_meta = {}
    for field_name, roi in cfg['roi_fields'].items():
        left, top, right, bottom = _roi_to_pixels(roi, width, height)
        if right <= left or bottom <= top:
            fields[field_name] = ''
            confidence_meta[field_name] = {"confidence": 0.0, "source": "roi", "roi": roi}
            continue

        crop = img.crop((left, top, right, bottom))
        text, conf = _run_tesseract_roi(crop)
        source = "roi_tesseract"
        if not text:
            text, conf = _run_easyocr_roi(crop)
            source = "roi_easyocr"

        cleaned_text = _normalize_roi_text(text)
        if _field_expected_type(field_name) == 'date':
            cleaned_text = _normalize_roi_text(_extract_likely_date(cleaned_text))

        validation_passed = _validate_field_value(field_name, cleaned_text)
        if not validation_passed and cleaned_text:
            conf = min(conf, 0.35)

        fields[field_name] = cleaned_text
        confidence_meta[field_name] = {
            "confidence": round(conf, 3),
            "source": source,
            "roi": roi,
            "expected_type": _field_expected_type(field_name),
            "validation_passed": validation_passed,
            "low_confidence": bool((not cleaned_text) or (not validation_passed) or conf < QUICK_FILL_MIN_CONFIDENCE),
        }

    return fields, confidence_meta

# -- Field extractors --------------------------------------------------------
def _first_match(patterns, text, flags=re.IGNORECASE):
    for pat in patterns:
        m = re.search(pat, text, flags)
        if m:
            return m.group(1).strip()
    return None

def extract_birth_fields(text: str, lines: list) -> dict:
    fields = {}
    name = _first_match([
        r'(?:name of child|name)[:\s]+([A-Z][A-Za-z\s,.\-]+)',
        r'(?:last name|surname)[:\s]+([A-Za-z\s]+)',
    ], text)
    if not name:
        for line in lines[:12]:
            if re.match(r'^[A-Z][A-Z\s,.\-]{5,}$', line.strip()):
                name = line.strip()
                break
    fields['full_name'] = name or ''
    fields['date_of_birth'] = _first_match([
        r'(?:date of birth|birth date|born)[:\s]+([A-Za-z0-9\s,/\-]+)',
        r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})',
    ], text) or ''
    fields['sex'] = _first_match([r'(?:sex|gender)[:\s]+(male|female)', r'\b(male|female)\b'], text) or ''
    fields['place_of_birth'] = _first_match([r'(?:place of birth|municipality|city)[:\s]+([A-Za-z\s,.\-]+)'], text) or ''
    fields['fathers_name'] = _first_match([r"(?:father'?s?\s*name|father)[:\s]+([A-Za-z\s,.\-]+)"], text) or ''
    fields['mothers_name'] = _first_match([r"(?:mother'?s?\s*name|mother)[:\s]+([A-Za-z\s,.\-]+)"], text) or ''
    fields['barangay'] = _first_match([r'(?:barangay|brgy\.?)[:\s]+([A-Za-z\s\d\-]+)'], text) or ''
    return fields

def extract_death_fields(text: str, lines: list) -> dict:
    fields = {}
    fields['full_name'] = _first_match([r'(?:name of deceased|name)[:\s]+([A-Za-z\s,.\-]+)'], text) or ''
    fields['date_of_death'] = _first_match([r'(?:date of death|died)[:\s]+([A-Za-z0-9\s,/\-]+)', r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'], text) or ''
    fields['age'] = _first_match([r'(?:age at death|age)[:\s]+(\d+)', r'\b(\d{1,3})\s*(?:years?|yr)'], text) or ''
    fields['sex'] = _first_match([r'(?:sex|gender)[:\s]+(male|female)', r'\b(male|female)\b'], text) or ''
    fields['place_of_death'] = _first_match([r'(?:place of death|died at|hospital|municipality)[:\s]+([A-Za-z\s,.\-]+)'], text) or ''
    fields['cause_of_death'] = _first_match([r'(?:cause of death|immediate cause)[:\s]+([A-Za-z\s,.\-]+)'], text) or ''
    fields['barangay'] = _first_match([r'(?:barangay|brgy\.?)[:\s]+([A-Za-z\s\d\-]+)'], text) or ''
    return fields

def extract_marriage_fields(text: str, lines: list) -> dict:
    fields = {}
    fields['husbands_name'] = _first_match([r"(?:husband'?s?\s*name|groom|husband)[:\s]+([A-Za-z\s,.\-]+)"], text) or ''
    fields['wifes_name'] = _first_match([r"(?:wife'?s?\s*name|bride|wife)[:\s]+([A-Za-z\s,.\-]+)"], text) or ''
    fields['date_of_marriage'] = _first_match([r'(?:date of marriage|married on|wedding date)[:\s]+([A-Za-z0-9\s,/\-]+)', r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'], text) or ''
    fields['place_of_marriage'] = _first_match([r'(?:place of marriage|married at|municipality)[:\s]+([A-Za-z\s,.\-]+)'], text) or ''
    fields['barangay'] = _first_match([r'(?:barangay|brgy\.?)[:\s]+([A-Za-z\s\d\-]+)'], text) or ''
    return fields

def smart_split_name(full_name: str) -> dict:
    """Break a full name string into structured components."""
    if not full_name:
        return {'last_name': '', 'first_name': '', 'middle_name': '', 'suffix': ''}
    
    name = full_name.strip()
    suffix = ''
    suffixes = r'\b(Jr|Sr|II|III|IV|V|VI|VII|M\.D\.|Esq|Ph\.D)\b\.?'
    
    # Extract suffix
    m_suffix = re.search(suffixes, name, re.IGNORECASE)
    if m_suffix:
        suffix = m_suffix.group(0).strip('.')
        name = re.sub(suffixes, '', name, flags=re.IGNORECASE).strip()

    # Handle "LAST, FIRST MIDDLE" format
    if ',' in name:
        parts = name.split(',', 1)
        last_name = parts[0].strip()
        remaining = parts[1].strip().split()
        first_name = remaining[0] if remaining else ''
        middle_name = ' '.join(remaining[1:]) if len(remaining) > 1 else ''
        return {'last_name': last_name, 'first_name': first_name, 'middle_name': middle_name, 'suffix': suffix}

    # Handle "FIRST MIDDLE LAST"
    parts = name.split()
    if len(parts) == 1:
        return {'last_name': parts[0], 'first_name': '', 'middle_name': '', 'suffix': suffix}
    elif len(parts) == 2:
        return {'last_name': parts[1], 'first_name': parts[0], 'middle_name': '', 'suffix': suffix}
    else:
        # Assume last word is last name, first is first, middle is everything else
        return {
            'last_name': parts[-1],
            'first_name': parts[0],
            'middle_name': ' '.join(parts[1:-1]),
            'suffix': suffix
        }

class SpatialExtractor:
    def __init__(self, raw_results):
        self.items = []
        for bbox, text, prob in raw_results:
            text = text.strip()
            if not text: continue
            xs = [pt[0] for pt in bbox]
            ys = [pt[1] for pt in bbox]
            left, right = min(xs), max(xs)
            top, bottom = min(ys), max(ys)
            self.items.append({
                'text': text, 'left': left, 'right': right,
                'top': top, 'bottom': bottom,
                'cx': (left + right) / 2, 'cy': (top + bottom) / 2,
                'width': right - left, 'height': bottom - top,
                'bbox': bbox, 'prob': prob
            })

    def find_anchor(self, anchor_text):
        anchor_text = anchor_text.lower()
        best_match = None
        for item in self.items:
            if anchor_text in item['text'].lower():
                if best_match is None or len(item['text']) < len(best_match['text']):
                    best_match = item
        return best_match

    def find_right(self, anchor_item, max_dist_x=800, max_dist_y=40):
        if not anchor_item: return ""
        best = None
        min_dist = float('inf')
        for item in self.items:
            if item == anchor_item: continue
            if item['cx'] <= anchor_item['cx']: continue
            dist_x = item['left'] - anchor_item['right']
            dist_y = abs(item['cy'] - anchor_item['cy'])
            if 0 <= dist_x < max_dist_x and dist_y < max_dist_y:
                if dist_x < min_dist:
                    min_dist, best = dist_x, item
        return best['text'] if best else ""

    def find_below(self, anchor_item, max_dist_y=200, max_dist_x=150):
        if not anchor_item: return ""
        best = None
        min_dist = float('inf')
        for item in self.items:
            if item == anchor_item: continue
            if item['cy'] <= anchor_item['cy']: continue
            dist_y = item['top'] - anchor_item['bottom']
            dist_x = abs(item['cx'] - anchor_item['cx'])
            if 0 <= dist_y < max_dist_y and dist_x < max_dist_x:
                if dist_y < min_dist:
                    min_dist, best = dist_y, item
        return best['text'] if best else ""

def extract_birth_fields(text: str, lines: list, raw_results=None) -> dict:
    fields = {}
    
    if raw_results:
        print("Using SpatialExtractor for flexible anchor-based layout parsing.")
        extractor = SpatialExtractor(raw_results)
        
        anchor_name = extractor.find_anchor('name') or extractor.find_anchor('child')
        full_child_name = extractor.find_right(anchor_name) or extractor.find_below(anchor_name)
        fields.update(smart_split_name(full_child_name))
        fields['full_name'] = full_child_name
        
        anchor_sex = extractor.find_anchor('sex') or extractor.find_anchor('gender')
        fields['sex'] = extractor.find_right(anchor_sex) or extractor.find_below(anchor_sex)
        
        anchor_dob = extractor.find_anchor('date of birth') or extractor.find_anchor('born')
        fields['date_of_birth'] = extractor.find_right(anchor_dob) or extractor.find_below(anchor_dob)
        
        anchor_place = extractor.find_anchor('place of birth') or extractor.find_anchor('hospital')
        fields['place_of_birth'] = extractor.find_right(anchor_place) or extractor.find_below(anchor_place)
        
        anchor_father = extractor.find_anchor('father')
        full_father_name = extractor.find_right(anchor_father) or extractor.find_below(anchor_father)
        for k, v in smart_split_name(full_father_name).items(): fields[f'father_{k}'] = v
        
        anchor_mother = extractor.find_anchor('mother') or extractor.find_anchor('maiden')
        full_mother_name = extractor.find_right(anchor_mother) or extractor.find_below(anchor_mother)
        for k, v in smart_split_name(full_mother_name).items(): fields[f'mother_{k}'] = v
        
        anchor_reg = extractor.find_anchor('registry no') or extractor.find_anchor('reg no')
        fields['registry_number'] = extractor.find_right(anchor_reg) or extractor.find_below(anchor_reg)
        
        anchor_brgy = extractor.find_anchor('barangay') or extractor.find_anchor('brgy')
        fields['barangay'] = extractor.find_right(anchor_brgy) or extractor.find_below(anchor_brgy)
        
        # Fallback to RegEx for missing key fields
        if not fields['date_of_birth']:
            fields['date_of_birth'] = _first_match([r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'], text) or ''
        return fields

    # Original RegEx fallback if no raw_results
    name_str = _first_match([
        r'(?:name of child|child\'s name|name)[:\s]*([A-Z][A-Za-z\s,.\-]+)',
        r'1\.\s*NAME\s*\([A-Za-z\s]+\)\s*([A-Z\s,.\-]+)', # Form 102 style
    ], text)
    
    if not name_str:
        for line in lines[:20]:
            clean = line.strip()
            # Look for lines that are clearly names (all caps or Title Case)
            if re.match(r'^[A-Z][A-Z\s,.\-]{5,}$', clean) and not any(kw in clean.upper() for kw in ['BIRTH', 'CERTIFICATE', 'CITY', 'MUNICIPALITY']):
                name_str = clean
                break
    
    fields.update(smart_split_name(name_str))
    
    fields['date_of_birth'] = _first_match([
        r'(?:date of birth|birth date|born)[:\s]*([A-Za-z0-9\s,/\-]+)',
        r'3\.\s*DATE OF BIRTH\s*([A-Za-z0-9\s,/\-]+)',
        r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'
    ], text) or ''
    
    fields['sex'] = _first_match([r'(?:sex|gender)[:\s]*(male|female)', r'\b(male|female)\b'], text) or ''
    fields['place_of_birth'] = _first_match([r'(?:place of birth|municipality|city)[:\s]*([A-Za-z\s,.\-]+)'], text) or ''
    fields['registry_number'] = _first_match([r'(?:registry no\.|reg\.?\s*no\.)[:\s]*([A-Z0-9\s\-]+)'], text) or ''

    f_name = _first_match([r"(?:father'?s?\s*name|father)[:\s]*([A-Za-z\s,.\-]+)"], text)
    for k, v in smart_split_name(f_name).items(): fields[f'father_{k}'] = v

    m_name = _first_match([r"(?:mother'?s?\s*name|mother)[:\s]*([A-Za-z\s,.\-]+)"], text)
    for k, v in smart_split_name(m_name).items(): fields[f'mother_{k}'] = v

    fields['barangay'] = _first_match([r'(?:barangay|brgy\.?)[:\s]*([A-Za-z\s\d\-]+)'], text) or ''
    return fields

def extract_death_fields(text: str, lines: list, raw_results=None) -> dict:
    fields = {}
    
    if raw_results:
        extractor = SpatialExtractor(raw_results)
        
        anchor_name = extractor.find_anchor('name') or extractor.find_anchor('deceased')
        full_name = extractor.find_right(anchor_name) or extractor.find_below(anchor_name)
        fields.update(smart_split_name(full_name))
        fields['full_name'] = full_name
        
        anchor_dod = extractor.find_anchor('date of death') or extractor.find_anchor('died')
        fields['date_of_death'] = extractor.find_right(anchor_dod) or extractor.find_below(anchor_dod)
        
        anchor_age = extractor.find_anchor('age')
        fields['age'] = extractor.find_right(anchor_age) or extractor.find_below(anchor_age)
        
        anchor_sex = extractor.find_anchor('sex') or extractor.find_anchor('gender')
        fields['sex'] = extractor.find_right(anchor_sex) or extractor.find_below(anchor_sex)
        
        anchor_place = extractor.find_anchor('place of death') or extractor.find_anchor('hospital')
        fields['place_of_death'] = extractor.find_right(anchor_place) or extractor.find_below(anchor_place)
        
        anchor_cause = extractor.find_anchor('cause of death') or extractor.find_anchor('cause')
        fields['cause_of_death'] = extractor.find_right(anchor_cause) or extractor.find_below(anchor_cause)
        
        anchor_brgy = extractor.find_anchor('barangay') or extractor.find_anchor('brgy')
        fields['barangay'] = extractor.find_right(anchor_brgy) or extractor.find_below(anchor_brgy)
        
        anchor_reg = extractor.find_anchor('registry no') or extractor.find_anchor('reg no')
        fields['registry_number'] = extractor.find_right(anchor_reg) or extractor.find_below(anchor_reg)
        
        if not fields['date_of_death']:
            fields['date_of_death'] = _first_match([r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'], text) or ''
        return fields

    # Original RegEx fallback
    name_str = _first_match([r'(?:name of deceased|deceased name|name)[:\s]*([A-Za-z\s,.\-]+)'], text)
    fields.update(smart_split_name(name_str))
    fields['full_name'] = name_str or ''
    fields['date_of_death'] = _first_match([r'(?:date of death|died)[:\s]*([A-Za-z0-9\s,/\-]+)', r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'], text) or ''
    fields['age'] = _first_match([r'(?:age at death|age)[:\s]*(\d+)', r'\b(\d{1,3})\s*(?:years?|yr)'], text) or ''
    fields['sex'] = _first_match([r'(?:sex|gender)[:\s]*(male|female)', r'\b(male|female)\b'], text) or ''
    fields['place_of_death'] = _first_match([r'(?:place of death|died at|hospital|municipality)[:\s]*([A-Za-z\s,.\-]+)'], text) or ''
    fields['cause_of_death'] = _first_match([r'(?:cause of death|immediate cause)[:\s]*([A-Za-z\s,.\-]+)'], text) or ''
    fields['barangay'] = _first_match([r'(?:barangay|brgy\.?)[:\s]*([A-Za-z\s\d\-]+)'], text) or ''
    fields['registry_number'] = _first_match([r'(?:registry no\.|reg\.?\s*no\.)[:\s]*([A-Z0-9\s\-]+)'], text) or ''
    return fields

def extract_marriage_fields(text: str, lines: list, raw_results=None) -> dict:
    fields = {}
    
    if raw_results:
        extractor = SpatialExtractor(raw_results)
        
        anchor_husband = extractor.find_anchor('husband') or extractor.find_anchor('groom')
        full_husband = extractor.find_right(anchor_husband) or extractor.find_below(anchor_husband)
        for k, v in smart_split_name(full_husband).items(): fields[f'husband_{k}'] = v
        fields['husbands_name'] = full_husband
        
        anchor_wife = extractor.find_anchor('wife') or extractor.find_anchor('bride')
        full_wife = extractor.find_right(anchor_wife) or extractor.find_below(anchor_wife)
        for k, v in smart_split_name(full_wife).items(): fields[f'wife_{k}'] = v
        fields['wifes_name'] = full_wife
        
        anchor_dom = extractor.find_anchor('date of marriage') or extractor.find_anchor('married on')
        fields['date_of_marriage'] = extractor.find_right(anchor_dom) or extractor.find_below(anchor_dom)
        
        anchor_place = extractor.find_anchor('place of marriage') or extractor.find_anchor('married at')
        fields['place_of_marriage'] = extractor.find_right(anchor_place) or extractor.find_below(anchor_place)
        
        anchor_brgy = extractor.find_anchor('barangay') or extractor.find_anchor('brgy')
        fields['barangay'] = extractor.find_right(anchor_brgy) or extractor.find_below(anchor_brgy)
        
        anchor_reg = extractor.find_anchor('registry no') or extractor.find_anchor('reg no')
        fields['registry_number'] = extractor.find_right(anchor_reg) or extractor.find_below(anchor_reg)
        
        if not fields['date_of_marriage']:
            fields['date_of_marriage'] = _first_match([r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'], text) or ''
        return fields

    # Original RegEx fallback
    h_name = _first_match([r"(?:husband'?s?\s*name|groom|husband)[:\s]*([A-Za-z\s,.\-]+)"], text)
    for k, v in smart_split_name(h_name).items(): fields[f'husband_{k}'] = v
    fields['husbands_name'] = h_name or ''
    
    w_name = _first_match([r"(?:wife'?s?\s*name|bride|wife)[:\s]*([A-Za-z\s,.\-]+)"], text)
    for k, v in smart_split_name(w_name).items(): fields[f'wife_{k}'] = v
    fields['wifes_name'] = w_name or ''
    
    fields['date_of_marriage'] = _first_match([r'(?:date of marriage|married on|wedding date)[:\s]*([A-Za-z0-9\s,/\-]+)', r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'], text) or ''
    fields['place_of_marriage'] = _first_match([r'(?:place of marriage|married at|municipality)[:\s]*([A-Za-z\s,.\-]+)'], text) or ''
    fields['barangay'] = _first_match([r'(?:barangay|brgy\.?)[:\s]*([A-Za-z\s\d\-]+)'], text) or ''
    fields['registry_number'] = _first_match([r'(?:registry no\.|reg\.?\s*no\.)[:\s]*([A-Z0-9\s\-]+)'], text) or ''
    return fields

def extract_fields(doc_type: str, text: str, lines: list, raw_results=None) -> dict:
    if doc_type == 'birth': return extract_birth_fields(text, lines, raw_results)
    elif doc_type == 'death': return extract_death_fields(text, lines, raw_results)
    elif doc_type == 'marriage': return extract_marriage_fields(text, lines, raw_results)
    return {}

# -- OCR Reader (Persistent) --------------------------------------------------
_reader = None
def get_reader():
    global _reader
    if _reader is None:
        try:
            import easyocr
            REDER_LANGS = ['en', 'tl']
            print(f"Loading EasyOCR models for {REDER_LANGS} (First run)...")
            _reader = easyocr.Reader(REDER_LANGS, gpu=True, verbose=False)
        except Exception as e:
            print(f"Failed to load EasyOCR: {e}")
            return None
    return _reader

if PYTESSERACT_AVAILABLE:
    print("PyTesseract is available! Will prioritize it for extreme speed on images.")
else:
    print("PyTesseract not found. EasyOCR will be loaded on first use (Accurate but slower on CPU).")
load_template_profiles()
print("OCR Server initialized.")

class OCRRequest(BaseModel):
    file_path: str
    doc_type: str = "birth"
    languages: str = "en,tl"
    ocr_mode: Literal["fast", "balanced", "accurate"] = "accurate"

class SplitRequest(BaseModel):
    file_path: str
    ocr_confidence: Optional[float] = None
    base_zoom: float = 1.35
    boosted_zoom: float = 1.8
    low_confidence_threshold: float = 0.75
    max_dimension: Optional[int] = 2000
    image_format: Literal["jpeg", "webp"] = "jpeg"
    image_quality: int = 75

@app.get('/status')
def status():
    engine = "pytesseract_easyocr_fallback" if PYTESSERACT_AVAILABLE else "easyocr"
    return {"status": "ready", "engine": engine, "persistent": True}

@app.post('/split')
def split_pdf(data: SplitRequest):
    file_path = data.file_path
    ext = _validate_input_file(file_path, expected_extensions=['.pdf'])

    try:
        with fitz.open(file_path) as doc:
            if len(doc) == 0:
                raise HTTPException(status_code=400, detail='PDF contains no pages.')
            image_paths = []
            base_dir = os.path.dirname(file_path)
            base_name = os.path.splitext(os.path.basename(file_path))[0]

            base_zoom = max(1.0, min(data.base_zoom, 3.0))
            boosted_zoom = max(base_zoom, min(data.boosted_zoom, 3.0))
            use_boosted_zoom = (
                data.ocr_confidence is not None
                and data.ocr_confidence < data.low_confidence_threshold
            )
            zoom = boosted_zoom if use_boosted_zoom else base_zoom
            max_dimension = data.max_dimension if (data.max_dimension and data.max_dimension > 0) else None
            image_format = data.image_format.lower()
            image_quality = max(1, min(data.image_quality, 100))
            output_ext = "jpg" if image_format == "jpeg" else "webp"
            output_format = "JPEG" if image_format == "jpeg" else "WEBP"

            print(
                "split_pdf settings: "
                f"zoom={zoom:.2f} (boosted={use_boosted_zoom}), "
                f"format={output_format}, quality={image_quality}, "
                f"max_dimension={max_dimension}"
            )

            for i in range(len(doc)):
                page = doc.load_page(i)
                page_start = time.perf_counter()
                mat = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=mat)

                pil_mode = "RGBA" if pix.alpha else "RGB"
                pil_image = Image.frombytes(pil_mode, (pix.width, pix.height), pix.samples)
                grayscale_image = pil_image.convert("L")

                if max_dimension:
                    resample_filter = getattr(Image, "Resampling", Image).LANCZOS
                    grayscale_image.thumbnail((max_dimension, max_dimension), resample_filter)

                img_path = os.path.join(base_dir, f"{base_name}_page_{i+1}.{output_ext}")
                save_kwargs = {"format": output_format, "quality": image_quality}
                if output_format == "JPEG":
                    save_kwargs["optimize"] = True
                elif output_format == "WEBP":
                    save_kwargs["method"] = 6

                grayscale_image.save(img_path, **save_kwargs)
                image_paths.append(img_path)

                page_elapsed = time.perf_counter() - page_start
                print(
                    f"Rendered page {i + 1}/{len(doc)} in {page_elapsed:.3f}s "
                    f"at {grayscale_image.width}x{grayscale_image.height}"
                )

            return {"success": True, "pages": image_paths, "total": len(image_paths)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        image_paths = []
        base_dir = os.path.dirname(file_path)
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        
        base_zoom = max(1.0, min(data.base_zoom, 3.0))
        boosted_zoom = max(base_zoom, min(data.boosted_zoom, 3.0))
        use_boosted_zoom = (
            data.ocr_confidence is not None
            and data.ocr_confidence < data.low_confidence_threshold
        )
        zoom = boosted_zoom if use_boosted_zoom else base_zoom
        max_dimension = data.max_dimension if (data.max_dimension and data.max_dimension > 0) else None
        image_format = data.image_format.lower()
        image_quality = max(1, min(data.image_quality, 100))
        output_ext = "jpg" if image_format == "jpeg" else "webp"
        output_format = "JPEG" if image_format == "jpeg" else "WEBP"

        print(
            "split_pdf settings: "
            f"zoom={zoom:.2f} (boosted={use_boosted_zoom}), "
            f"format={output_format}, quality={image_quality}, "
            f"max_dimension={max_dimension}"
        )

        for i in range(len(doc)):
            page = doc.load_page(i)
            page_start = time.perf_counter()
            # Render page to an image with adaptive zoom for OCR speed/quality balance
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)

            pil_mode = "RGBA" if pix.alpha else "RGB"
            pil_image = Image.frombytes(pil_mode, (pix.width, pix.height), pix.samples)
            grayscale_image = pil_image.convert("L")

            if max_dimension:
                resample_filter = getattr(Image, "Resampling", Image).LANCZOS
                grayscale_image.thumbnail((max_dimension, max_dimension), resample_filter)

            img_path = os.path.join(base_dir, f"{base_name}_page_{i+1}.{output_ext}")
            save_kwargs = {"format": output_format, "quality": image_quality}
            if output_format == "JPEG":
                save_kwargs["optimize"] = True
            elif output_format == "WEBP":
                save_kwargs["method"] = 6

            grayscale_image.save(img_path, **save_kwargs)
            image_paths.append(img_path)

            page_elapsed = time.perf_counter() - page_start
            print(
                f"Rendered page {i + 1}/{len(doc)} in {page_elapsed:.3f}s "
                f"at {grayscale_image.width}x{grayscale_image.height}"
            )
            
        return {"success": True, "pages": image_paths, "total": len(image_paths)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/ocr')
def process_ocr(data: OCRRequest):
    file_path = data.file_path
    ext = _validate_input_file(file_path)
    expected_type = data.doc_type
    languages = data.languages.split(',')
    ocr_mode = data.ocr_mode

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {file_path}")

    print(f"Processing OCR for: {file_path}")
    ext = Path(file_path).suffix.lower()
    avg_conf = 0
    lines, scores = [], []
    quick_fill_used = False
    field_confidence = {}
    detected_template_family = None
    quick_fill_debug = {
        "marker_hits": 0,
        "fallback_reason": "",
    }

    if ext == '.docx' and docx:
        print(f"Extracting text natively from DOCX (Bypassing OCR): {file_path}")
        try:
            doc = docx.Document(file_path)
            lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
            scores = [1.0] * len(lines) # Perfect confidence for digital text
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"DOCX extraction failed: {str(e)}")
    elif ext in ['.txt', '.rtf']:
        print(f"Reading raw text file natively (Bypassing OCR): {file_path}")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = [line.strip() for line in content.split('\n') if line.strip()]
                scores = [1.0] * len(lines)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TXT read failed: {str(e)}")
    else:
        # Image processing
        ocr_engine_used = "none"
        fast_mode_min_chars = 80
        fast_mode_min_conf = 0.75

        def run_easyocr():
            reader = get_reader()
            if not reader:
                return [], [], []
            try:
                print("Running EasyOCR...")
                results = reader.readtext(file_path)
                easy_lines, easy_scores = [], []
                for (_bbox, text, prob) in results:
                    if text.strip():
                        easy_lines.append(text.strip())
                        easy_scores.append(round(prob, 3))
                print("EasyOCR completed.")
                return easy_lines, easy_scores, results
            except Exception as e:
                print(f"EasyOCR failed: {e}")
                return [], [], []

        def run_tesseract():
            if not PYTESSERACT_AVAILABLE:
                return [], [], []
            try:
                print("Running PyTesseract...")
                img = Image.open(file_path)
                data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
                tess_lines = []
                tess_scores = []
                tess_raw = []
                
                n_boxes = len(data['level'])
                for i in range(n_boxes):
                    text = data['text'][i].strip()
                    if text:
                        conf = int(data['conf'][i])
                        if conf > 0:
                            x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                            bbox = [[x, y], [x+w, y], [x+w, y+h], [x, y+h]]
                            prob = conf / 100.0
                            tess_raw.append((bbox, text, prob))
                            tess_lines.append(text)
                            tess_scores.append(prob)
                            
                print("PyTesseract completed.")
                return tess_lines, tess_scores, tess_raw
            except Exception as e:
                print(f"PyTesseract failed: {e}")
                return [], [], []

        # Quick-fill pre-check: detect known template families via header anchors,
        # then OCR only pre-defined ROIs for target autofill fields.
        detected_template_family, _, marker_hits = detect_template_family(file_path)
        quick_fill_debug["marker_hits"] = marker_hits
        if detected_template_family:
            if expected_type and expected_type not in ('unknown', '') and detected_template_family != expected_type:
                quick_fill_debug["fallback_reason"] = (
                    f"template_expected_type_mismatch({detected_template_family}!={expected_type})"
                )
                detected_template_family = None
            else:
                print(f"Quick-fill template detected: {detected_template_family}")
                quick_fields, quick_meta = quick_fill_extract_from_rois(file_path, detected_template_family)
                field_confidence.update(quick_meta)
    
                required_fields = QUICK_FILL_REQUIRED_FIELDS.get(detected_template_family, [])
                required_field_confs = [
                    field_confidence.get(field, {}).get('confidence', 0.0)
                    for field in required_fields
                ]
                avg_roi_conf = (
                    sum(required_field_confs) / len(required_field_confs)
                    if required_field_confs else 0.0
                )
                missing_required = [
                    field for field in required_fields if not (quick_fields.get(field) or '').strip()
                ]
                low_conf_fields = [
                    field for field in required_fields
                    if field_confidence.get(field, {}).get('low_confidence')
                ]
                should_run_full_ocr = bool(
                    missing_required
                    or low_conf_fields
                    or avg_roi_conf < QUICK_FILL_MIN_CONFIDENCE
                )
    
                if quick_fields:
                    quick_fill_used = not should_run_full_ocr
                    lines = [f"{k}: {v}" for k, v in quick_fields.items() if v]
                    scores = required_field_confs if required_field_confs else []
                    ocr_engine_used = "quick_fill_roi"
                    print(
                        "Quick-fill ROI result "
                        f"(avg_conf={round(avg_roi_conf, 3)}, missing={missing_required}, low={low_conf_fields})"
                    )
    
                if should_run_full_ocr:
                    if missing_required:
                        quick_fill_debug["fallback_reason"] = f"missing_required_fields({','.join(missing_required)})"
                    elif low_conf_fields:
                        quick_fill_debug["fallback_reason"] = f"low_confidence_fields({','.join(low_conf_fields)})"
                    else:
                        quick_fill_debug["fallback_reason"] = "avg_roi_confidence_below_threshold"
                    print("Quick-fill confidence low; running full-page OCR fallback.")
                    lines, scores = [], []
                    quick_fill_used = False

        if not detected_template_family:
            if not quick_fill_debug["fallback_reason"]:
                quick_fill_debug["fallback_reason"] = "template_markers_not_confident_enough"
            print("No quick-fill template markers found; using full-page OCR.")

        if not lines:
            if ocr_mode in ("fast", "balanced"):
                lines, scores, raw_results = run_tesseract()
                ocr_engine_used = "pytesseract" if lines else "none"

                fast_text_len = len('\n'.join(lines))
                fast_avg_conf = (sum(scores) / len(scores)) if scores else 0
                should_fallback = (
                    not lines
                    or fast_text_len < fast_mode_min_chars
                    or fast_avg_conf < fast_mode_min_conf
                )

                if should_fallback:
                    print(
                        f"Fast mode fallback triggered (chars={fast_text_len}, conf={round(fast_avg_conf, 3)})."
                    )
                    easy_lines, easy_scores, easy_raw = run_easyocr()
                    if easy_lines:
                        lines, scores = easy_lines, easy_scores
                        raw_results = easy_raw
                        ocr_engine_used = "easyocr_fallback"
            else:
                lines, scores, raw_results = run_easyocr()
                if lines:
                    ocr_engine_used = "easyocr"
                elif PYTESSERACT_AVAILABLE:
                    print("Attempting Tesseract fallback...")
                    lines, scores, raw_results = run_tesseract()
                    if lines:
                        ocr_engine_used = "pytesseract_fallback"

    if ext in ['.docx', '.txt', '.rtf']:
        ocr_engine_used = "native_text"
    
    full_text = '\n'.join(lines)
    avg_conf = round(sum(scores) / len(scores), 3) if scores else 0
    
    # Detect & Extract
    detected_type = detect_document_type(full_text)
    extraction_type = detected_type
    if extraction_type == 'unknown' or not extraction_type:
        extraction_type = expected_type if (expected_type and expected_type != 'unknown') else 'birth'
    
    # Only run the regex extractor if we didn't successfully use Zonal OCR
    if not quick_fill_used:
        # Pass raw_results (bounding boxes) to extract_fields for Spatial Extraction
        extracted_fields = extract_fields(extraction_type, full_text, lines, raw_results if 'raw_results' in locals() else None)
    else:
        # If we used Zonal OCR, extracted_fields is already populated, 
        # but let's make sure 'full_name' is set for consistency if it's missing
        if 'full_name' not in extracted_fields and 'first_name' in extracted_fields:
            fn = extracted_fields.get('first_name', '')
            mn = extracted_fields.get('middle_name', '')
            ln = extracted_fields.get('last_name', '')
            extracted_fields['full_name'] = f"{fn} {mn} {ln}".replace("  ", " ").strip()
            
    if field_confidence and not quick_fill_used:
        for quick_field, meta in field_confidence.items():
            quick_value = extracted_fields.get(quick_field, '')
            if not quick_value:
                if meta and not meta.get('validation_passed', True):
                    continue
                # Persist direct ROI value into extracted fields if parser misses it.
                pass
    
    type_mismatch = False
    mismatch_msg = ''
    if expected_type and expected_type not in ('unknown', '') and detected_type != 'unknown':
        if detected_type != expected_type:
            type_mismatch = True
            mismatch_msg = f"Document type mismatch: you selected '{expected_type}' but it appears to be a '{detected_type}' certificate."

    template_overlay_fields = []
    for field_key, meta in (field_confidence or {}).items():
        if not isinstance(meta, dict):
            continue
        roi = meta.get('roi')
        if not roi:
            continue
        template_overlay_fields.append({
            "key": field_key,
            "value": extracted_fields.get(field_key, ''),
            "roi": roi,
            "confidence": meta.get('confidence', 0.0),
            "expected_type": meta.get('expected_type', _field_expected_type(field_key)),
            "validation_passed": bool(meta.get('validation_passed', False)),
        })

    return {
        'success': True,
        'text': full_text,
        'confidence': avg_conf,
        'ocr_mode': ocr_mode,
        'engine_used': ocr_engine_used,
        'detected_type': detected_type,
        'type_mismatch': type_mismatch,
        'mismatch_message': mismatch_msg,
        'extracted_fields': extracted_fields,
        'quick_fill_used': quick_fill_used,
        'field_confidence': field_confidence,
        'template_family_detected': detected_template_family,
        'quick_fill_debug': quick_fill_debug,
        'template_overlay': {
            'enabled': bool(template_overlay_fields),
            'family': detected_template_family,
            'fields': template_overlay_fields,
        },
    }

if __name__ == '__main__':
    import uvicorn
    # Dynamic hardware scaling: Use max cores available, minus 1 for OS stability
    cores = os.cpu_count() or 2
    # Default to 1 worker for stability on low-end systems (i3/4GB RAM)
    # Tesseract is so fast that parallelism isn't strictly required for a single user
    workers = min(max(2, cores - 1), 4)
    limit_concurrency = max(5, min(cores * 2, 10))
    print(f"Starting OCR Server with DYNAMIC HARDWARE SCALING")
    print(f"Detected CPU Cores: {cores}")
    print(f"Launching {workers} workers with limit_concurrency={limit_concurrency}")
    
    uvicorn.run(
        "ocr_server:app",
        host='0.0.0.0',
        port=8080,
        workers=workers,
        log_level="info",
        limit_concurrency=limit_concurrency,
    )
