# CiviCORE Document Management & OCR Integration Guide

## Overview

Your documents system now supports:
- ✅ **File Storage**: PDFs/images saved to `storage/app/public/documents` 
- ✅ **OCR Integration**: Sends files to your FastAPI server at `http://localhost:8000/process`
- ✅ **Database Indexing**: Raw OCR text stored in `raw_text` column for searchability
- ✅ **Dynamic Renaming**: Files auto-renamed based on OCR results (e.g., `BIRTH_SANTOS_JUAN_1.pdf`)
- ✅ **Full-Text Search**: Lightning-fast search using MySQL FULLTEXT index

---

## Database Schema

### New Columns Added

Your `documents` table now includes:

| Column | Type | Purpose |
|--------|------|---------|
| `file_path` | VARCHAR | Path to file in storage (e.g., `documents/BIRTH_SANTOS_JUAN_1.pdf`) |
| `raw_text` | LONGTEXT | Complete raw OCR text (indexed for full-text search) |
| `extracted_data` | JSON | Structured fields extracted from OCR (Name, Date, etc.) |

### Indexes

A FULLTEXT index `ft_raw_text_name` is created on `(raw_text, name)` for fast searches.

---

## Migration Instructions

### 1. Run Migrations

```bash
php artisan migrate
```

This will create:
- `2026_04_09_000001_add_file_path_raw_text_to_documents.php` - Adds new columns
- `2026_04_09_000002_add_fulltext_index_to_documents.php` - Adds FULLTEXT index

### 2. Verify Storage Directory

Ensure `storage/app/public/documents` exists:

```bash
mkdir -p storage/app/public/documents
chmod 755 storage/app/public/documents
php artisan storage:link  # If not already done
```

---

## Upload Workflow

### File Upload Endpoint

**POST** `/api/documents/upload`

**Request:**
```javascript
const formData = new FormData();
formData.append('file', file); // PDF or image
formData.append('docType', 'birth'); // birth, death, marriage, marriage_license
formData.append('personName', 'Juan Santos'); // optional
formData.append('barangay', 'Poblacion'); // optional
formData.append('quality_metadata', JSON.stringify({...})); // optional

fetch('/api/documents/upload', {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
    }
})
.then(r => r.json())
.then(data => console.log(data));
```

**Response:**
```json
{
    "success": true,
    "id": 42,
    "filename": "BIRTH_SANTOS_JUAN_42.pdf",
    "originalName": "scan_20260409.pdf",
    "file_path": "documents/BIRTH_SANTOS_JUAN_42.pdf",
    "size": "2.45 MB",
    "raw_text_length": 8234,
    "extracted_fields": {
        "first_name": "Juan",
        "last_name": "Santos",
        "date_of_birth": "1990-05-15",
        "place_of_birth": "Naic"
    },
    "detected_type": "birth",
    "encoded_by": "admin"
}
```

---

## What Happens During Upload

### Behind the Scenes

1. **File Storage**: File saved to `storage/app/public/documents/BIRTH_SANTOS_JUAN_42.pdf`
2. **OCR Processing**: File sent to `http://localhost:8000/process` (with file attachment)
3. **Data Extraction**: OCR server returns raw text and structured fields
4. **Database Storage**:
   - `file_path` → `documents/BIRTH_SANTOS_JUAN_42.pdf`
   - `raw_text` → Full OCR output (indexed for searches)
   - `extracted_data` → JSON fields from OCR
5. **Async Job**: `ProcessDocumentOcr` queued for additional processing

### Error Handling

If OCR server is unreachable, the system gracefully falls back:
- File still saved to disk
- Record created with empty `raw_text`
- Manual OCR review available in dashboard

---

## OCR Server Integration

### Expected FastAPI Response Format

Your OCR server should return:

```json
{
    "raw_text": "CERTIFICATE OF LIVE BIRTH\nRepublic of the Philippines\n...",
    "extracted_fields": {
        "first_name": "Juan",
        "middle_name": "Dela Cruz",
        "last_name": "Santos",
        "suffix": "Jr.",
        "date_of_birth": "1990-05-15",
        "place_of_birth": "Naic",
        "father_name": "Pedro Santos",
        "mother_name": "Maria Santos",
        "barangay": "Poblacion"
    },
    "detected_type": "birth"
}
```

### For Marriage Certificates

```json
{
    "raw_text": "...",
    "extracted_fields": {
        "husband_first_name": "Juan",
        "husband_last_name": "Santos",
        "husband_middle_name": "Dela Cruz",
        "wife_first_name": "Maria",
        "wife_last_name": "Garcia",
        "wife_middle_name": "Santos",
        "date_of_marriage": "2020-06-15"
    },
    "detected_type": "marriage"
}
```

---

## Search Implementation

### Model Methods

The `Document` model has three search methods:

#### 1. Full-Text Search (Fastest)

```php
// Search both raw_text and filename
$results = Document::search('Juan Santos', $perPage = 20); // Paginated
// Returns: LengthAwarePaginator with highest-relevance results first
```

**Usage:**
```php
$documents = Document::search('barangay naic');
foreach ($documents as $doc) {
    echo $doc->name; // filename
    echo substr($doc->raw_text, 0, 100); // first 100 chars of OCR
}
```

#### 2. Raw Text Search Only

```php
$query = Document::searchByRawText('date of birth');
$results = $query->get(); // Get all results
// or
$results = $query->paginate(20); // Get paginated results
```

#### 3. Filename Search

```php
$query = Document::searchByFileName('santos');
$results = $query->get();
```

### Controller Search Endpoint

Add this to your `DocumentController`:

```php
public function search(Request $request)
{
    $query = $request->query('q', '');
    $type = $request->query('type', '');
    $perPage = min((int)$request->query('per_page', 20), 100);

    if (empty($query)) {
        return response()->json([
            'data' => [],
            'meta' => ['total' => 0]
        ]);
    }

    // Use full-text search
    $results = Document::search($query, $perPage);

    // Filter by type if provided
    if (!empty($type)) {
        $results->getCollection()->filter(fn($doc) => $doc->type === $type);
    }

    return response()->json([
        'data' => $results->items(),
        'meta' => [
            'total' => $results->total(),
            'page' => $results->currentPage(),
            'per_page' => $results->perPage(),
            'last_page' => $results->lastPage()
        ]
    ]);
}
```

**Route:**
```php
Route::get('/documents/search', [DocumentController::class, 'search']);
```

**API Usage:**
```javascript
// Search for "Juan Santos"
fetch('/api/documents/search?q=Juan+Santos&type=birth&per_page=10')
    .then(r => r.json())
    .then(data => console.log(data.data));
```

---

## File Naming Convention

### Automatic Renaming Rules

Files are automatically renamed after OCR extraction:

**Pattern:** `[TYPE]_[LASTNAME]_[FIRSTNAME]_[DOCID].[ext]`

**Examples:**
- Birth Certificate → `BIRTH_SANTOS_JUAN_42.pdf`
- Death Certificate → `DEATH_GARCIA_MARIA_43.pdf`
- Marriage Certificate → `MARRIAGE_SANTOS_GARCIA_44.pdf`

Special characters are removed from names:
- "O'Brien" → "OBRIEN"
- "José María" → "JOSEMARIA"

If no names are extracted, original filename is preserved.

---

## Advanced Usage

### Retrieving Full OCR Data

```php
// Get document with all OCR fields
$doc = Document::find($id);

// Raw OCR text (all extracted text)
echo $doc->raw_text;

// Structured extracted fields
$fields = json_decode($doc->extracted_data, true);
echo $fields['first_name']; // "Juan"
echo $fields['date_of_birth']; // "1990-05-15"

// File path for public URL
echo asset('storage/' . $doc->file_path);
// Output: https://civicore.app/storage/documents/BIRTH_SANTOS_JUAN_42.pdf
```

### Scopeable Queries

```php
// Get by type
Document::byType('birth')->get();

// Get by status
Document::byStatus('Processed')->get();

// Combine
Document::byType('birth')
    ->byStatus('Processed')
    ->searchByRawText('barangay naic')
    ->get();
```

### Extract Person Name Helper

```php
$doc = Document::find($id);
$fullName = $doc->getExtractedPersonName();
// Returns: "Santos, Juan" for birth/death
// Returns: "Santos, Juan & Garcia, Maria" for marriage
```

---

## Performance Tips

### Full-Text Search is Lightning-Fast

The FULLTEXT index makes searches extremely fast:
```php
// Even with 100,000+ documents, this is instant
$results = Document::search('Juan Santos')->paginate(20);
```

### Avoid N+1 Queries

```php
// ❌ Bad - will query N times
$docs = Document::search('juan')->paginate(10);
foreach ($docs as $doc) {
    // Each $doc requires a query
    echo $doc->extracted_data['first_name'];
}

// ✅ Good - eager load if needed
$docs = Document::with('relations')->search('juan')->paginate(10);
```

---

## Troubleshooting

### OCR Server Not Responding

If `http://localhost:8000/process` is down:
- File still uploads successfully
- `raw_text` column remains empty
- Document marked with empty extracted fields
- Check logs: `storage/logs/laravel.log`

### Files Not Saved to Disk

Ensure directory is writable:
```bash
chmod -R 775 storage/app/public/documents
sudo chown -R www-data:www-data storage/app/public/documents
```

### Full-Text Index Not Working

If FULLTEXT search returns no results, verify index exists:
```sql
SHOW INDEX FROM documents WHERE Key_name = 'ft_raw_text_name';
```

If missing, recreate it:
```sql
ALTER TABLE documents ADD FULLTEXT INDEX ft_raw_text_name (raw_text, name);
```

---

## API Reference

### Document Model

```php
namespace App\Models;

class Document extends Model
{
    // Search methods
    static search(string $query, int $limit = 20)          // → LengthAwarePaginator
    static searchByRawText(string $query)                  // → Builder
    static searchByFileName(string $query)                 // → Builder
    
    // Query scopes
    scopeByType(Builder $query, string $type)              // → Builder
    scopeByStatus(Builder $query, string $status)          // → Builder
    
    // Helper methods
    getExtractedPersonName()                               // → string|null
}
```

### DocumentController

```php
namespace App\Http\Controllers;

class DocumentController
{
    // New/Enhanced methods
    upload(Request $request)          // → JSON with OCR results
    search(Request $request)          // → JSON paginated search results
    
    // Existing methods (still work)
    index(Request $request)           // → JSON documents list
    store(Request $request)           // → JSON document created
    update(Request $request, $id)     // → JSON document updated
    destroy($id)                      // → JSON success
}
```

---

## Database Queries

### Raw SQL Examples

```sql
-- Search for "Juan" in both raw_text and name
SELECT * FROM documents 
WHERE MATCH(raw_text, name) AGAINST('+Juan' IN BOOLEAN MODE)
ORDER BY MATCH(raw_text, name) AGAINST('+Juan' IN BOOLEAN MODE) DESC;

-- Get all Birth certificates processed in last 7 days
SELECT * FROM documents
WHERE type = 'birth' AND status = 'Processed' 
AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY);

-- Find documents with specific person name
SELECT * FROM documents
WHERE JSON_EXTRACT(extracted_data, '$.first_name') = 'Juan'
AND JSON_EXTRACT(extracted_data, '$.last_name') = 'Santos';
```

---

## Next Steps

1. **Run Migrations**: `php artisan migrate`
2. **Test Upload**: Upload a sample PDF/image to verify workflow
3. **Verify OCR Server**: Ensure `http://localhost:8000/process` is running
4. **Test Search**: Try searching with `Document::search('query')`
5. **Monitor Logs**: Check `storage/logs/laravel.log` for any issues

---

**Built for CiviCORE** • Records Management System
May 2026
