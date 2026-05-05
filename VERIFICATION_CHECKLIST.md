# CiviCORE OCR Integration - Verification Checklist

Use this checklist to verify your OCR integration is working correctly.

---

## ✅ Pre-Setup Checklist

- [ ] Laravel project is running
- [ ] Database is connected
- [ ] `storage/app/public` directory exists
- [ ] OCR server installed and ready to run
- [ ] FastAPI dependencies installed (`pip install fastapi uvicorn easyocr`)

---

## ✅ Setup Checklist

### 1. Database Migrations

```bash
php artisan migrate
```

- [ ] Migration output shows 2 new migrations completed
- [ ] No database errors in output
- [ ] `documents` table has `file_path` column
- [ ] `documents` table has `raw_text` column
- [ ] `documents` table has `extracted_data` column

**Verify columns:**
```sql
DESCRIBE documents;
```

Should show:
- `file_path` VARCHAR
- `raw_text` LONGTEXT
- `extracted_data` JSON

### 2. Storage Directory

```bash
mkdir -p storage/app/public/documents
chmod 755 storage/app/public/documents
php artisan storage:link
```

- [ ] Directory created at `storage/app/public/documents`
- [ ] Directory is writable (755 permissions)
- [ ] Symlink created in `public/storage`

**Verify:**
```bash
ls -la public/storage/
# Should show: storage -> ../storage/app/public
ls -la storage/app/public/documents/
# Should be empty initially
```

### 3. Full-Text Index

```sql
SHOW INDEX FROM documents WHERE Key_name = 'ft_raw_text_name';
```

- [ ] Index `ft_raw_text_name` exists
- [ ] Index includes columns: `raw_text`, `name`
- [ ] Index type is FULLTEXT

**If missing, create it:**
```sql
ALTER TABLE documents ADD FULLTEXT INDEX ft_raw_text_name (raw_text, name);
```

---

## ✅ OCR Server Verification

### 1. Start OCR Server

```bash
cd path/to/ocr_server_directory
python ocr_server.py
```

- [ ] Server starts without errors
- [ ] Shows: "Initializing EasyOCR reader..."
- [ ] Shows: "Application startup complete"
- [ ] Listening on `http://127.0.0.1:8000`

### 2. Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status":"ok","service":"CiviCORE OCR Server"}
```

- [ ] Returns 200 OK
- [ ] Returns JSON with status
- [ ] No connection refused errors

### 3. Test OCR Endpoint

```bash
# Create a test image or use an existing PDF
curl -X POST -F "file=@test_document.pdf" http://localhost:8000/process
```

Expected response:
```json
{
  "raw_text": "CERTIFICATE OF LIVE BIRTH...",
  "extracted_fields": {...},
  "detected_type": "birth"
}
```

- [ ] Returns 200 OK
- [ ] Includes `raw_text` field
- [ ] Includes `extracted_fields` object
- [ ] Includes `detected_type` field

---

## ✅ Code Verification

### 1. Document Model

```bash
php artisan tinker
>>> use App\Models\Document;
>>> Document::class
=> "App\Models\Document"
>>> $doc = new Document();
>>> method_exists($doc, 'search')
=> true
```

- [ ] Document model exists at `app/Models/Document.php`
- [ ] Model has `search()` method
- [ ] Model has `searchByRawText()` method
- [ ] Model has `searchByFileName()` method

### 2. DocumentController Methods

```php
// app/Http/Controllers/DocumentController.php

// Verify these methods exist:
- upload()                  // NEW
- processDocumentOcr()      // NEW (private)
- saveDocumentFile()        // NEW (private)
- renameDocumentFile()      // NEW (private)
```

- [ ] All methods are present in file
- [ ] No syntax errors in file

**Check:**
```bash
php artisan route:list | grep documents
```

---

## ✅ Integration Testing

### Test 1: Upload a File

```javascript
const form = new FormData();
form.append('file', fileInput.files[0]);
form.append('docType', 'birth');

const response = await fetch('/api/documents/upload', {
    method: 'POST',
    body: form,
    credentials: 'include'
});

const data = await response.json();
console.log(data);
```

Expected response:
```json
{
  "success": true,
  "id": 1,
  "file_path": "documents/...",
  "raw_text_length": 1234,
  "extracted_fields": {...}
}
```

**Checklist:**
- [ ] Response status 200 OK
- [ ] `success` is true
- [ ] `id` returned (document ID)
- [ ] `file_path` contains path to document
- [ ] `raw_text_length` > 0 (OCR worked)
- [ ] `extracted_fields` has content

### Test 2: Verify File Saved to Disk

```bash
ls -la storage/app/public/documents/
```

- [ ] New file exists in directory
- [ ] Filename matches format: `BIRTH_*_*.pdf`
- [ ] File size > 0
- [ ] File is readable

### Test 3: Search Documents

```bash
# In Laravel Tinker
php artisan tinker
>>> use App\Models\Document;
>>> $results = Document::search('juan')->paginate(20);
>>> $results->count()
=> 1
>>> $results->first()->name
=> "scan_001.pdf"
```

**Checklist:**
- [ ] Search returns results
- [ ] Results include `raw_text` field
- [ ] Results include `file_path` field
- [ ] Results include `extracted_data` field
- [ ] Pagination works correctly

### Test 4: Check Database Records

```sql
SELECT id, name, file_path, raw_text_length, extracted_data 
FROM documents 
ORDER BY created_at DESC 
LIMIT 1;
```

- [ ] `file_path` column populated
- [ ] `raw_text` column has content (or empty if OCR failed)
- [ ] `extracted_data` column has JSON data
- [ ] `status` changed to "Extracted"

---

## ✅ Error Scenario Testing

### Scenario 1: OCR Server Down

```bash
# Stop OCR server, then upload a file
```

- [ ] Upload still succeeds (file saved)
- [ ] Returns success response
- [ ] `raw_text_length` is 0
- [ ] File exists in storage
- [ ] No 500 error returned

### Scenario 2: Invalid File Format

```bash
# Try uploading .docx or .txt file
```

- [ ] Upload succeeds or returns 400 error (if validation)
- [ ] No crash or 500 error
- [ ] Error message is clear

### Scenario 3: Large File (>20MB)

```bash
# Try uploading file > 20MB
```

- [ ] Returns validation error or 413 error
- [ ] Not a 500 crash
- [ ] Error message is clear

### Scenario 4: File System Full

- [ ] If storage fills up, returns appropriate error
- [ ] Database transaction rolled back
- [ ] No orphaned files left

---

## ✅ Performance Testing

### Test Full-Text Search Speed

```php
// Time a search query
$start = microtime(true);
$results = Document::search('juan santos', 1000)->paginate(20);
$end = microtime(true);

echo ($end - $start) * 1000; // milliseconds
```

- [ ] Search completes in < 50ms
- [ ] Pagination works
- [ ] Results are relevant (highest relevance first)

### Test With Multiple Documents

```php
// Insert 100+ documents, then search
```

- [ ] Search still fast (< 100ms)
- [ ] No timeout errors
- [ ] Results are ranked by relevance

---

## ✅ Logging Verification

### Check Application Logs

```bash
tail -f storage/logs/laravel.log
```

During an upload, should see entries like:
```
[2026-04-09 12:00:00] local.INFO: File saved to disk: documents/BIRTH_SANTOS_JUAN_42.pdf
[2026-04-09 12:00:02] local.INFO: Sending file to OCR server: /var/www/...
[2026-04-09 12:00:05] local.INFO: OCR processing successful, extracted 8234 characters
[2026-04-09 12:00:05] local.INFO: File renamed to: documents/BIRTH_SANTOS_JUAN_42.pdf
```

- [ ] Upload process is logged
- [ ] OCR processing is logged
- [ ] No error messages in logs
- [ ] File operations are logged

---

## ✅ Documentation Verification

- [ ] `SETUP_CHANGES_SUMMARY.md` exists and is readable
- [ ] `CIVICORE_OCR_GUIDE.md` exists and is comprehensive
- [ ] `DOCUMENT_OCR_INTEGRATION.md` exists with quick start
- [ ] All documentation references are correct

---

## ✅ Final System Test

### Complete End-to-End Flow

1. Start OCR server ✅
2. Upload PDF document ✅
3. Verify file saved to disk ✅
4. Verify OCR data in database ✅
5. Search for document ✅
6. Retrieve extracted fields ✅
7. Download/view document ✅

---

## 📝 Sign-Off

If all checkboxes are checked ✅, your CiviCORE OCR integration is:
- ✅ Properly configured
- ✅ Fully functional
- ✅ Ready for production use
- ✅ Performant and scalable

**Setup Date:** ___________  
**Verified By:** ___________  
**Notes:** 

---

## 🆘 If Something Fails

1. **Check logs first:** `storage/logs/laravel.log`
2. **Verify OCR server:** `curl http://localhost:8000/health`
3. **Check database:** Verify columns exist in `documents` table
4. **Check storage:** Ensure `storage/app/public/documents` is writable
5. **Review error message:** Most errors have specific solutions
6. **Consult guide:** See `CIVICORE_OCR_GUIDE.md` for troubleshooting

---

**Verification Checklist Complete!**  
Date: May 2, 2026  
System: CiviCORE Records Management
