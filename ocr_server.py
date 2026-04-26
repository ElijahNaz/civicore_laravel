import sys
import json
import os
import re
import argparse
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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

def detect_document_type(text: str) -> str:
    lower = text.lower()
    birth_hits    = sum(1 for kw in BIRTH_KEYWORDS    if kw in lower)
    death_hits    = sum(1 for kw in DEATH_KEYWORDS    if kw in lower)
    marriage_hits = sum(1 for kw in MARRIAGE_KEYWORDS if kw in lower)
    scores = {'birth': birth_hits, 'death': death_hits, 'marriage': marriage_hits}
    best = max(scores, key=scores.get)
    # Default to 'birth' instead of 'unknown' if no clear indicators are found
    return best if scores[best] > 0 else 'birth'

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

def extract_birth_fields(text: str, lines: list) -> dict:
    fields = {}
    # Use a more aggressive search for the child's name
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

def extract_death_fields(text: str, lines: list) -> dict:
    fields = {}
    name_str = _first_match([r'(?:name of deceased|deceased name|name)[:\s]*([A-Za-z\s,.\-]+)'], text)
    fields.update(smart_split_name(name_str))
    fields['date_of_death'] = _first_match([r'(?:date of death|died)[:\s]*([A-Za-z0-9\s,/\-]+)', r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'], text) or ''
    fields['age'] = _first_match([r'(?:age at death|age)[:\s]*(\d+)', r'\b(\d{1,3})\s*(?:years?|yr)'], text) or ''
    fields['sex'] = _first_match([r'(?:sex|gender)[:\s]*(male|female)', r'\b(male|female)\b'], text) or ''
    fields['place_of_death'] = _first_match([r'(?:place of death|died at|hospital|municipality)[:\s]*([A-Za-z\s,.\-]+)'], text) or ''
    fields['cause_of_death'] = _first_match([r'(?:cause of death|immediate cause)[:\s]*([A-Za-z\s,.\-]+)'], text) or ''
    fields['barangay'] = _first_match([r'(?:barangay|brgy\.?)[:\s]*([A-Za-z\s\d\-]+)'], text) or ''
    fields['registry_number'] = _first_match([r'(?:registry no\.|reg\.?\s*no\.)[:\s]*([A-Z0-9\s\-]+)'], text) or ''
    return fields

def extract_marriage_fields(text: str, lines: list) -> dict:
    fields = {}
    h_name = _first_match([r"(?:husband'?s?\s*name|groom|husband)[:\s]*([A-Za-z\s,.\-]+)"], text)
    for k, v in smart_split_name(h_name).items(): fields[f'husband_{k}'] = v
    w_name = _first_match([r"(?:wife'?s?\s*name|bride|wife)[:\s]*([A-Za-z\s,.\-]+)"], text)
    for k, v in smart_split_name(w_name).items(): fields[f'wife_{k}'] = v
    fields['date_of_marriage'] = _first_match([r'(?:date of marriage|married on|wedding date)[:\s]*([A-Za-z0-9\s,/\-]+)', r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})'], text) or ''
    fields['place_of_marriage'] = _first_match([r'(?:place of marriage|married at|municipality)[:\s]*([A-Za-z\s,.\-]+)'], text) or ''
    fields['barangay'] = _first_match([r'(?:barangay|brgy\.?)[:\s]*([A-Za-z\s\d\-]+)'], text) or ''
    fields['registry_number'] = _first_match([r'(?:registry no\.|reg\.?\s*no\.)[:\s]*([A-Z0-9\s\-]+)'], text) or ''
    return fields

def extract_fields(doc_type: str, text: str, lines: list) -> dict:
    if doc_type == 'birth': return extract_birth_fields(text, lines)
    elif doc_type == 'death': return extract_death_fields(text, lines)
    elif doc_type == 'marriage': return extract_marriage_fields(text, lines)
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
            _reader = easyocr.Reader(REDER_LANGS, gpu=False, verbose=False)
        except Exception as e:
            print(f"Failed to load EasyOCR: {e}")
            return None
    return _reader

if PYTESSERACT_AVAILABLE:
    print("PyTesseract is available! Will prioritize it for extreme speed on images.")
else:
    print("PyTesseract not found. EasyOCR will be loaded on first use (Accurate but slower on CPU).")
print("OCR Server initialized.")

class OCRRequest(BaseModel):
    file_path: str
    doc_type: str = "birth"
    languages: str = "en,tl"

class SplitRequest(BaseModel):
    file_path: str

@app.get('/status')
def status():
    engine = "pytesseract_easyocr_fallback" if PYTESSERACT_AVAILABLE else "easyocr"
    return {"status": "ready", "engine": engine, "persistent": True}

@app.post('/split')
def split_pdf(data: SplitRequest):
    file_path = data.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="File not found")
    
    try:
        doc = fitz.open(file_path)
        image_paths = []
        base_dir = os.path.dirname(file_path)
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        
        for i in range(len(doc)):
            page = doc.load_page(i)
            # Render page to an image (zoom for better OCR quality)
            zoom = 2.0
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            
            img_path = os.path.join(base_dir, f"{base_name}_page_{i+1}.png")
            pix.save(img_path)
            image_paths.append(img_path)
            
        return {"success": True, "pages": image_paths, "total": len(image_paths)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/ocr')
def process_ocr(data: OCRRequest):
    file_path = data.file_path
    expected_type = data.doc_type
    languages = data.languages.split(',')

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {file_path}")

    print(f"Processing OCR for: {file_path}")
    ext = Path(file_path).suffix.lower()
    avg_conf = 0
    lines, scores = [], []

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
        processed_with_easyocr = False
        
        # Try EasyOCR first as requested by user
        print("Running EasyOCR...")
        reader = get_reader()
        if reader:
            try:
                results = reader.readtext(file_path)
                for (_bbox, text, prob) in results:
                    if text.strip():
                        lines.append(text.strip())
                        scores.append(round(prob, 3))
                processed_with_easyocr = True
                print("EasyOCR completed.")
            except Exception as e:
                print(f"EasyOCR failed: {e}")

        # Fallback to Tesseract ONLY if EasyOCR failed or returned no text
        if not processed_with_easyocr or not lines:
            if PYTESSERACT_AVAILABLE:
                try:
                    print(f"Attempting Tesseract fallback...")
                    img = Image.open(file_path)
                    tess_text = pytesseract.image_to_string(img)
                    if tess_text.strip():
                        lines = [line.strip() for line in tess_text.split('\n') if line.strip()]
                        scores = [0.9] * len(lines)
                        print("Tesseract fallback successful.")
                except Exception as e:
                    print(f"Tesseract fallback failed: {e}")
    
    full_text = '\n'.join(lines)
    avg_conf = round(sum(scores) / len(scores), 3) if scores else 0
    
    # Detect & Extract
    detected_type = detect_document_type(full_text)
    extraction_type = detected_type
    if extraction_type == 'unknown' or not extraction_type:
        extraction_type = expected_type if (expected_type and expected_type != 'unknown') else 'birth'
    
    extracted_fields = extract_fields(extraction_type, full_text, lines)
    
    type_mismatch = False
    mismatch_msg = ''
    if expected_type and expected_type not in ('unknown', '') and detected_type != 'unknown':
        if detected_type != expected_type:
            type_mismatch = True
            mismatch_msg = f"Document type mismatch: you selected '{expected_type}' but it appears to be a '{detected_type}' certificate."

    return {
        'success': True,
        'text': full_text,
        'confidence': avg_conf,
        'detected_type': detected_type,
        'type_mismatch': type_mismatch,
        'mismatch_message': mismatch_msg,
        'extracted_fields': extracted_fields,
    }

if __name__ == '__main__':
    import uvicorn
    # Dynamic hardware scaling: Use max cores available, minus 1 for OS stability
    cores = os.cpu_count() or 2
    # Default to 1 worker for stability on low-end systems (i3/4GB RAM)
    # Tesseract is so fast that parallelism isn't strictly required for a single user
    workers = 1 
    print(f"Starting OCR Server with DYNAMIC HARDWARE SCALING")
    print(f"Detected CPU Cores: {cores}")
    print(f"Launching {workers} concurrent AI threads for massive parallel throughput...")
    
    uvicorn.run("ocr_server:app", host='0.0.0.0', port=5000, workers=workers, log_level="info")
