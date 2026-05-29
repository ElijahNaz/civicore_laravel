# Database Directory (`database/`) Overview

The `database` folder holds all the scripts and tools needed to construct and fill your MySQL database. Instead of manually creating tables using phpMyAdmin, you write code in here to generate the database structure. This is crucial for version control and working in teams.

Here is the file-by-file and folder-by-folder breakdown:

---

## 1. `database/migrations/`
Migrations are like "version control" for your database. They contain PHP scripts that tell the database exactly what tables to create, what columns they should have, and what data types to use (e.g., `VARCHAR`, `INT`, `LONGTEXT`). 

If you look at the filenames, they are prefixed with a timestamp (e.g., `2026_03_24_000001_create_documents_table.php`). This ensures they run in the exact order they were created.

*   **`0001_01_01_000000_create_users_table.php`**: Creates the `users` table for staff accounts, passwords, and roles.
*   **`0001_01_01_000001_create_cache_table.php`**: Creates tables for the framework to store cache data.
*   **`0001_01_01_000002_create_jobs_table.php`**: Creates the `jobs` and `failed_jobs` tables used for background processing (like OCR extraction).
*   **`2024_01_15_000001_add_performance_indexes.php`**: Adds database indexes to speed up search queries across massive datasets.
*   **`2026_03_24_000001_create_documents_table.php`**: Creates the `documents` table which archives scanned files.
*   **`2026_03_24_000002_create_issuances_table.php`**: Creates the core `issuances` table for Birth, Marriage, and Death certificates.
*   **`2026_03_24_000003_create_barangays_table.php`**: Creates the `barangays` dictionary table for standardized dropdowns.
*   **`2026_04_08_014000_create_activity_logs_table.php`**: Creates the `activity_logs` table to track who did what.
*   **`2026_04_09_000001_create_document_history_logs_table.php`**: Tracks changes specifically made to archived documents.
*   **`2026_04_21_060039_create_settings_table.php`**: Creates a table for dynamic system configurations (System Name, Logo path).
*   **`2026_04_21_061006_create_announcements_table.php`**: Creates the table for dashboard bulletin messages.
*   **`2026_04_21_065817_create_verification_codes_table.php`**: Temporarily stores 6-digit OTP codes for email verification.
*   **`2026_04_27_000001_create_document_ocr_pages_table.php`**: Stores text extracted from massive multi-page documents, mapped page-by-page.
*   **`2026_04_27_092700_create_template_profiles_table.php`**: Stores X,Y mapping coordinates for printing on blank certificates.
*   **`2026_05_26_000001_create_tickets_table.php`**: Creates the `tickets` table for the public-facing document request queue.
*   **`2026_05_26_101717_add_print_approval_fields...`**: Alters the `issuances` table to add fields like `or_number` and `requested_by` for the print approval workflow.
*   **`2026_05_27_230000_add_certificate_type_to_issuances.php`**: Modifies issuances to differentiate between birth, death, and marriage.
*   **`2026_05_28_000001_add_qr_fields_to_tickets_table.php`**: Modifies the `tickets` table to store secure tracking codes and QR code paths.
*   **`2026_05_28_104539_add_ticket_number_to_issuances_table.php`**: Links a queue ticket to a final registry issuance.
*   **`2026_05_28_110000_change_extracted_data_to_longtext...`**: A critical fix made recently to prevent database crashes when saving heavy base64 image data from the OCR frontend.
*   **`2026_05_28_192000_update_tickets_table_v2.php`**: The most recent update refining the ticketing system structure.

*   **Why Migrations are important:** If a panelist asks, "How do you deploy this to a new server?", you explain that you don't copy the database manually. You just run `php artisan migrate`, and Laravel reads these files to build the entire database structure in seconds.

---

## 2. `database/seeders/`
Seeders are scripts that populate your database with initial "dummy" or "default" data. 
*   **`DatabaseSeeder.php`** (and related files inside this folder):
    *   **What it does:** Typically inserts the default Super Admin account so you can actually log in the first time you deploy. It is also used to insert the default list of Barangays (`barangays_table`), and default settings (`settings_table`).
    *   **Why it's important:** Prevents you from having to manually type in default records every time you reset the database.

---

## 3. `database/factories/`
Factories are blueprints for generating fake testing data.
*   **What they do:** Define what a fake "User" or fake "Issuance" looks like (e.g., generating a random name using a Faker library).
*   **Why it's important:** If you need to test how the dashboard looks with 1,000 records, you can use factories to instantly generate 1,000 fake records instead of typing them one by one.

---

## 4. `database/database.sqlite`
*   **What it is:** This is a local, file-based SQLite database. 
*   **Why it's here:** Depending on your `.env` configuration, Laravel might use this file for running automated tests rapidly without touching your main MySQL database.
