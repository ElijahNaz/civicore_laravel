import sys
import json
import os
import re
import argparse
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
import easyocr
from PIL import Image

app = Flask(__name__)
CORS(app)

# ── Document-type detection ─────────────────────────────────────────────────
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
    return best if scores[best] > 0 else 'unknown'

# ── Field extractors ────────────────────────────────────────────────────────
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

def extract_fields(doc_type: str, text: str, lines: list) -> dict:
    if doc_type == 'birth': return extract_birth_fields(text, lines)
    elif doc_type == 'death': return extract_death_fields(text, lines)
    elif doc_type == 'marriage': return extract_marriage_fields(text, lines)
    return {}

# ── OCR Reader (Persistent) ──────────────────────────────────────────────────
REDER_LANGS = ['en', 'tl']
print(f"Loading EasyOCR models for {REDER_LANGS}…")
_reader = easyocr.Reader(REDER_LANGS, gpu=False, verbose=False)
print("OCR Reader ready.")

@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "ready", "engine": "easyocr", "persistent": True})

@app.route('/ocr', methods=['POST'])
def process_ocr():
    data = request.get_json()
    file_path = data.get('file_path')
    expected_type = data.get('doc_type', 'birth')
    languages = data.get('languages', 'en,tl').split(',')

    if not file_path or not os.path.exists(file_path):
        return jsonify({"success": False, "error": f"File not found: {file_path}"}), 400

    print(f"Processing OCR for: {file_path}")
    ext = Path(file_path).suffix.lower()
    
    # Simple image processing for now (PDF handled by converting in server if needed)
    # But for Option B, the worker usually converts PDF to images anyway.
    # Let's handle image directly for speed.
    results = _reader.readtext(file_path)
    lines, scores = [], []
    for (_bbox, text, prob) in results:
        if text.strip():
            lines.append(text.strip())
            scores.append(round(prob, 3))
    
    full_text = '\n'.join(lines)
    avg_conf = round(sum(scores) / len(scores), 3) if scores else 0
    
    # Detect & Extract
    detected_type = detect_document_type(full_text)
    extraction_type = detected_type if detected_type != 'unknown' else expected_type
    extracted_fields = extract_fields(extraction_type, full_text, lines)
    
    type_mismatch = False
    mismatch_msg = ''
    if expected_type and expected_type not in ('unknown', '') and detected_type != 'unknown':
        if detected_type != expected_type:
            type_mismatch = True
            mismatch_msg = f"Document type mismatch: you selected '{expected_type}' but it appears to be a '{detected_type}' certificate."

    return jsonify({
        'success': True,
        'text': full_text,
        'confidence': avg_conf,
        'detected_type': detected_type,
        'type_mismatch': type_mismatch,
        'mismatch_message': mismatch_msg,
        'extracted_fields': extracted_fields,
    })

if __name__ == '__main__':
    # Default port 5000
    app.run(host='0.0.0.0', port=5000, debug=False)
