# Database Overhaul Implementation Plan

The current database schema relies heavily on iterative, patchy migrations that have introduced massive bloat (such as storing `LONGBLOB` file data directly in tables) and loose relationships (missing foreign key constraints). This causes high memory usage, extremely slow database queries, and significant difficulty in properly managing bulk deletions and data synchronization.

## Goal
Restructure the database to optimize performance, ensure reliable cascading deletions, and properly normalize document/OCR data. 

## User Review Required

> [!WARNING]  
> **Data Loss:** Since this is a complete remake of the database schema, do we have any critical data in the current database that needs to be preserved and migrated, or are we okay with running `php artisan migrate:fresh` to wipe the slate clean and start fresh?

> [!IMPORTANT]
> **File Storage Policy:** The plan proposes removing `LONGBLOB` `file_data` columns from the database entirely. All files (images/PDFs) will be stored in the local file system (e.g., `storage/app/public/documents`), and the database will only save the `file_path`. Please confirm if this approach works for your infrastructure.

## Open Questions

1. Are we still enforcing `SoftDeletes` on tables like `documents` and `issuances`? Soft deletes can sometimes cause issues with unique constraints (like `certNumber`) if a new issuance reuses an old number from a deleted record.
2. The `Issuance` and `ActivityLog` models do not seem to exist in `app/Models/` (only controllers are present). Would you like me to generate these missing Eloquent Models as part of this overhaul?

## Proposed Changes

### 1. Unified and Cleaned Migrations
We will consolidate the scattered migrations into clean, logical structures.

#### [NEW] `database/migrations/..._create_documents_table.php` (Consolidated)
- Remove `file_data` `LONGBLOB`.
- Introduce `file_path` as a primary storage reference.
- Move large `longText` OCR data and `json` metadata into a separate `document_metadata` or `document_ocr_data` table to keep the core `documents` table lean and fast.

#### [NEW] `database/migrations/..._create_issuances_table.php` (Consolidated)
- Add a strict Foreign Key constraint: `$table->foreignId('document_id')->constrained('documents')->cascadeOnDelete();`. This ensures that when a document is deleted, the issuance is also automatically deleted by the database engine, solving the bulk deletion issue.
- Remove redundant fields like `extracted_data` if they can be fetched from the document.

#### [NEW] `database/migrations/..._create_document_ocr_pages_table.php`
- Enforce foreign keys: `$table->foreignId('document_id')->constrained()->cascadeOnDelete();`.

### 2. Model Refactoring

#### [MODIFY] [Document.php](file:///c:/laragon/www/civicore_laravel/app/Models/Document.php)
- Remove `file_data` from `$fillable`.
- Add proper Eloquent relationships (`hasOne`, `hasMany`) to link with `Issuance`, `DocumentOcrPage`, etc.

#### [NEW] Models (`Issuance.php`, `ActivityLog.php`, etc.)
- Create proper Eloquent models with defined relationships and `$fillable` properties to make querying and data reflection accurate.

## Verification Plan

### Automated Tests
1. Run `php artisan migrate:fresh` to verify the schema builds without errors.
2. Use tinker to insert dummy documents and issuances, then delete a parent document to verify the `cascadeOnDelete` properly cleans up related records.

### Manual Verification
1. Test the "Bulk Delete" functionality from the UI to ensure it executes quickly without timeouts or memory errors.
2. Verify that uploaded files correctly save to the filesystem instead of the database.
