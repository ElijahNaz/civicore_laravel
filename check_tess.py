import pytesseract
print("PyTesseract is installed.")
try:
    print(pytesseract.get_tesseract_version())
except Exception as e:
    print(f"But Tesseract binary not found: {e}")
