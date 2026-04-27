# 🏛️ CiviCORE - Civic Document Management System

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-12.0-red?style=for-the-badge&logo=laravel" alt="Laravel Version">
  <img src="https://img.shields.io/badge/PHP-8.2+-purple?style=for-the-badge&logo=php" alt="PHP Version">
  <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" alt="React Version">
  <img src="https://img.shields.io/badge/Python-3.10+-yellow?style=for-the-badge&logo=python" alt="Python Version">
  <img src="https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=for-the-badge&logo=tailwind-css" alt="Tailwind Version">
</p>

CiviCORE is a premium, high-performance document management system designed for Local Government Units (LGUs). It features **AI-powered Intelligent OCR** for automated data extraction from Birth, Marriage, and Death certificates, and an **Interactive Document Scanner** with live edge tracing.

---

## 📋 System Requirements

Before you begin, ensure your local environment meets the following specifications:

### 1. Servers & Languages
- **PHP 8.2 or higher**: Required for Laravel 12 backend logic.
- **Node.js 18.x or higher**: Required for the React/Vite frontend.
- **Python 3.10 or higher**: Required for the EasyOCR engine.
- **MySQL 8.x or MariaDB**: Required for database management.

### 2. Recommended Environment (Windows)
- **Laragon Full**: Highly recommended as it provides Apache/Nginx, PHP, and MySQL in a pre-configured stack.

---

## 📥 Comprehensive Installation Guide

Follow these steps carefully to get the system running on your device.

### Step 1: Clone the Repository
Open your terminal or command prompt and run:
```bash
git clone https://github.com/louieramilo0101/civicorelaravel2.git
cd civicore_laravel
```

### Step 2: Install Dependencies
You must install both backend and frontend dependencies:

1. **PHP (Backend)**:
   ```bash
   composer install
   ```
2. **Node.js (Frontend)**:
   ```bash
   npm install
   ```

### Step 3: Configure Environment Variables
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Generate the unique Application Key:
   ```bash
   php artisan key:generate
   ```
3. Open `.env` in your code editor and update the database details:
   ```env
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306      # Update to 3307 if using Laragon default
   DB_DATABASE=civicore_laravel
   DB_USERNAME=root
   DB_PASSWORD=      # Leave blank if no password is set
   ```

### Step 4: Import the Database ⚠️ **CRITICAL**
The system requires a specific data structure and sample records.
1. Create a new database named `civicore_laravel` in your MySQL manager (e.g., HeidiSQL, phpMyAdmin).
2. Import the provided SQL dump:
   - **File**: `civicore-export-4-9-2026.sql`
   - Use the **Import** feature in your database tool to execute this file.

### Step 5: Python OCR Engine Setup
CiviCORE uses a specialized Python server for document scanning.
1. Ensure Python is added to your system's PATH.
2. Install the required Python packages:
   ```bash
   pip install fastapi uvicorn easyocr Pillow pytesseract python-docx
   ```
   *Note: On the first run, the OCR engine will download about 150MB of machine learning models. Ensure you have an internet connection.*

### Step 6: File Storage
Create a symbolic link for the storage folder (for uploaded documents):
```bash
php artisan storage:link
```

---

## 🚀 Running the Application

For convenience, a **One-Click Launcher** has been provided.

1. Locate the `start-civicore.bat` file in the root directory.
2. **Double-click it**. This will automatically launch:
   - **Laravel Server** (Port 8000)
   - **Vite Dev Server** (Frontend)
   - **Persistent OCR Server** (Port 5000)
   - **Dedicated queue workers**:
     - `high` queue worker (single-page and urgent OCR jobs)
     - `low` queue worker(s) (multi-page PDF OCR fan-out)
     - `default` queue worker (non-OCR jobs)

**Wait for all windows to say "Ready"**, then visit:
👉 **[http://localhost:8000](http://localhost:8000)**

### ⚙️ Queue Worker Tuning Profiles (Deployment)

`start-civicore.bat` now supports queue-specific tuning for worker count, sleep, and timeout values.

#### Profile A: 4GB RAM (Conservative)
- **Set in BAT file**: `RAM_PROFILE=4GB`
- **Recommended for**: entry-level laptops and shared office desktops.
- **Worker layout**:
  - `high`: 1 worker (`--sleep=1 --timeout=120`)
  - `low`: 1 worker (`--sleep=2 --timeout=900`)
  - `default`: 1 worker (`--sleep=3 --timeout=90`)
- **Why**: reduces memory pressure and prevents EasyOCR overload while keeping urgent OCR responsive.

#### Profile B: 8GB+ RAM (Balanced/Production-like)
- **Set in BAT file**: `RAM_PROFILE=8GB_PLUS` (default)
- **Recommended for**: workstations with 8GB+ RAM and SSD storage.
- **Worker layout**:
  - `high`: 1 worker (`--sleep=1 --timeout=120`)
  - `low`: 2 workers (`--sleep=1 --timeout=1200`)
  - `default`: 1 worker (`--sleep=2 --timeout=90`)
- **Why**: increases throughput for PDF page fan-out on `low` without delaying urgent `high` OCR jobs.

#### CPU Core Safeguard
- If the machine has **4 CPU cores or fewer**, the launcher automatically caps `low` queue workers to **1**, even in `8GB_PLUS` mode.
- This avoids thread contention when OCR, Laravel, and Vite are running together.

---

## 🛠️ Troubleshooting

- **OCR not working?**: Ensure `python` command is recognized in your terminal. If you use `python3`, rename the command in `start-civicore.bat`.
- **Database Connection Error**: Double check the `DB_PORT` in your `.env`. If using Laragon, it is often `3306` or `3307`.
- **White Screen on Launch**: Run `npm run build` once if `npm run dev` doesn't resolve the CSS immediately.

---

## 📂 Project Highlights
- **`app/`**: Laravel core logic and API.
- **`resources/js/components/`**: React 19 Frontend components.
- **`ocr_server.py`**: The Python FastAPI server that handles AI vision.
- **`civicore-export-4-9-2026.sql`**: The production-ready database dump.

---

## 📜 Final System Overhaul & Deployment Log

The following features, fixes, and architectural refinements have been successfully implemented and verified:

### ⚡ OCR & Document Processing (Latest Updates)
- **Intelligent Edge Detection**: Integrated **OpenCV.js** with adaptive throttling and stability telemetry to ensure smooth live tracing on low-power devices.
- **Client-Side Preprocessing**: Implemented quality-aware image enhancement and metadata generation (DPI, exposure, and focus scoring) before server transmission.
- **Resilient Capture Layer**: Added a multi-stage hardware fallback system to handle legacy camera drivers and permission edge cases.
- **Multi-Engine Support**: Integrated **Tesseract** as a high-speed fallback for **EasyOCR**.
- **Binary Safety**: Converted `issuances` table to use `LONGBLOB` for PDF storage, resolving 500 errors during approval.
- **Reactive Extraction**: OCR results now populate the form fields in real-time as background jobs complete.
- **Improved Accuracy**: Enhanced regex patterns to support Form 102 (Birth) and Form 103 (Death) standard layouts.
- **UI Compaction**: Re-engineered the document queue to be significantly more compact, eliminating horizontal scrolling.

### 🏛️ UI/UX & Layout Consistency
- **Standardized Aesthetics**: Unified icons, fonts, and sub-heading styles across the entire platform.
- **Optimized Sidebar**: 
  - Logout button relocated to the absolute bottom for better ergonomics.
  - Sidebar fixed position logic implemented; scrolling main content no longer affects navigation visibility.
- **Performance**: Resolved "laggy" occurrences through requirement-based code optimization and background job offloading.

### 🔐 Security & Account Management
- **Verification Pipeline**: Integrated **Mailtrap** for robust Gmail/OTP verification testing.
- **Strict Validation**: 
  - Implemented Name validation logic.
  - Enforced Minimum Password Requirements (One Capital, One Small, Number, Special Character).

---

## ⚠️ Known Issues / Technical Debt
- **OCR Stability**: On machines with low RAM (e.g., 4GB), running multiple EasyOCR workers may cause system instability. Recommendation: Use Tesseract for high-speed CPU processing or limit to 1 worker.
- **Auto-Fill Sync**: In some cases, OCR results may not automatically populate the template preview textboxes on the first load. (Workaround: Manually edit any field to trigger a re-sync).
- **Template Alignment**: The current field coordinates for Form 102/103 are approximate and may require manual calibration via the "Template Designer" for perfect printer alignment.
- **Marriage Certificates**: Official support for Municipal Form No. 101 (Marriage) is pending and has not yet been implemented in the overlay system.
- **Document Type Detection**: Occasional classification challenges on low-quality scans. **Improved Logic**: The system now returns "Unknown" instead of an incorrect guess, allowing the user to select the correct template manually in the OCR panel.
- **Database Race Conditions**: In very high-concurrency environments, multiple OCR pages may compete to update the same record. (Patch: Implemented Row-Level Locking in April 2026).

---

## 🔄 Recent Updates & Database Changes (April 2026 - Phase 2)

The system has been upgraded with a professional Document Registry and Overlay system for high-fidelity certificate generation.

### 📜 Premium Template Overlay System
- **Clean PDF Integration**: Implemented support for high-resolution PDF templates. Scanned document data is now overlaid on clean backgrounds for a professional look.
- **Official Field Mapping**: Expanded field configurations to match **Philippine LCR Form 102 (Birth)** and **Form 103 (Death)**, supporting 20+ precise data points (e.g., Weight at Birth, Parents' Marriage Date, Causes of Death).
- **Interactive Designer**: Built a drag-and-drop `TemplateDesigner` allowing administrators to calibrate field positions visually in real-time.

### ⚡ Architectural Refinements
- **Global Data Context**: Migrated to a centralized `DataContext` to ensure document and template lists are always synchronized across all tabs (Dashboard, Documents, Issuances).
- **Smart Stream Previews**: Switched all document previews to `/api/documents/view` streaming, eliminating unwanted browser downloads and improving UI responsiveness.
- **Heuristic Type Matching**: Enhanced the OCR engine to automatically pair scanned documents with the correct official template based on deep-text analysis.

### 🌐 Localization & Audit
- **Timezone Synchronization**: Fixed submission and activity logs to follow **Philippine Standard Time (Asia/Manila, UTC+8)**.
- **Expanded Audit Trail**: Added detailed logging for every View, Download, Edit, and Print action performed by staff.

### 🗄️ Database Updates
- **New Table: `template_profiles`**: Stores JSON-based Region of Interest (ROI) coordinates, field keys, and template metadata.
- **Seeded ROIs**: Pre-populated the database with calibrated field positions for official 102 and 103 form layouts.
- **Logging Persistence**: Updated `activity_logs` schema support for local time offsets.

---

## License
Developed by Team CiviCORE. [MIT License](https://opensource.org/licenses/MIT).
