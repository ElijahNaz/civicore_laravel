# 🏛️ CiviCORE - Civic Document Management System

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-12.0-red?style=for-the-badge&logo=laravel" alt="Laravel Version">
  <img src="https://img.shields.io/badge/PHP-8.2+-purple?style=for-the-badge&logo=php" alt="PHP Version">
  <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" alt="React Version">
  <img src="https://img.shields.io/badge/Python-3.10+-yellow?style=for-the-badge&logo=python" alt="Python Version">
  <img src="https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=for-the-badge&logo=tailwind-css" alt="Tailwind Version">
  <img src="https://img.shields.io/badge/Last%20Updated-August%2010%2C%202026-brightgreen?style=for-the-badge" alt="Last Updated">
</p>

CiviCORE is a premium, high-performance document management system designed for Local Government Units (LGUs). It features **AI-powered Intelligent OCR** for automated data extraction from Birth, Marriage, and Death certificates, an **Interactive Document Scanner** with live edge tracing, **QR Code ticketing** for citizen request management, and a **Geospatial Analytics** dashboard for real-time demographic visualization across Naic barangays.

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

## ✅ Project Objectives & Completion Status

These objectives define the full scope of the CiviCORE system. All items below have been implemented and verified as of **August 10, 2026**.

| # | Objective | Status | Summary |
|---|-----------|--------|---------|
| **1a** | OCR-Based Searchability | ✅ **Completed** | Full OCR search with webcam camera overlay in the Issuances section. Uses EasyOCR + Tesseract Python engine. Scan a document with your camera or upload a file — extracted fields auto-fill the search bar. |
| **1b** | Auto-Generation from Extracted Text | ✅ **Completed** | `template_profiles` system with pre-seeded coordinate overlays for LCR Form 102 (Birth), Form 103 (Death), and Form 101 (Marriage). Interactive `TemplateDesigner` allows admins to calibrate field positions visually. |
| **1c** | Geospatial Demographic Analytics | ✅ **Completed** | Interactive Leaflet map showing barangay-level distribution of Birth, Death, and Marriage records across Naic. Features: Heatmap Mode, Demographic Ratio Mode, Barangay Rankings, Transaction Velocity panel, and full Timeframe Filtering (Today / This Week / This Month / This Year / Custom Date Range). |
| **1d** | Role-Based Access Control (RBAC) | ✅ **Completed** | `RequireSessionAuth`, `AdminRole`, and `SuperAdminRole` middleware enforce backend API access. Staff, Admin, and SuperAdmin privilege levels are enforced across all routes. |
| **1e** | Document Request Approval Workflow | ✅ **Completed** | In-person request modal with automated Official Receipt (OR) number generation. SuperAdmin approval queue integrated into the Issuances view. Approved requests can then be printed. |
| **1f** | Centralized Data Management | ✅ **Completed** | Archive Manager tab integrated into the Documents UI. Supports soft-delete, Restore, and Permanent Purge with full audit trail tracking. |
| **1g** | QR Code-Based Ticketing | ✅ **Completed** | Public citizen request portal with sequential QR ticket generation. Live queue tracking for staff with status transitions (Pending → Serving → Completed). QR code links to real-time ticket status page. |
| **1h** | Dedicated Reports & Analytics Export | ✅ **Completed** | Full Export Reports module (`/reports`) with CSV and Excel (.xlsx) data export capabilities, custom date-range filtering, status/type/barangay filters, and dynamic summary metrics. |

---

## 📜 System Features Overview

### 🏛️ Core Document Management
- Upload, process, and manage Birth, Death, and Marriage Certificates.
- Centralized Master Database view with OCR-powered document search.
- Archive Manager: soft-delete, restore, and permanently purge records.
- Full audit trail for every view, download, edit, and print action.

### 🤖 AI / OCR Processing
- **EasyOCR + Tesseract** dual-engine for document field extraction.
- **Google Gemini (gemini-2.5-flash)** is fully integrated into the OCR pipeline for intelligent multi-layout document understanding — the integration is complete and ready to activate. A Gemini API key just needs to be purchased and added to the `.env` file (`GEMINI_API_KEY=`) to enable it.
- **Camera-based Search**: Scan a physical document with your webcam to search the database.
- **OpenCV.js** live edge detection for document framing during capture.
- Client-side image preprocessing (DPI, exposure, focus scoring) before server upload.

### 🎟️ QR Ticketing System
- Citizens submit document requests via a public portal — no login required.
- Each submission generates a unique **QR Code ticket** with a tracking URL.
- Staff dashboard shows a real-time queue with one-click status transitions.

### 🗺️ Geospatial Analytics
- Leaflet-based interactive map pinned to Naic's geographical bounds.
- Per-barangay breakdown of Births, Deaths, and Marriages.
- **Heatmap Mode**: visualize activity density across barangays.
- **Demographic Ratio Mode**: color-coded Birth-to-Death ratio across the map.
- **Advanced Timeframe Filter**: All Time, Today, This Week, This Month, This Year, or a **Custom Date Range** (from date → to date).
- Monthly Trajectory chart (6-month rolling view).
- Barangay Rankings sorted by total document volume.
- Transaction Velocity: daily and weekly request processing rates.

### 🔐 Security & Access Control
- Session-based authentication with middleware-enforced role separation.
- **Mailtrap**-integrated OTP email verification pipeline *(currently used for testing/development — planned to be upgraded to **Gmail SMTP** for production in a future release)*.
- Password strength enforcement (uppercase, lowercase, number, special character).
- Strict name validation on registration.

### 🖨️ Print & Approval Workflow
- Staff submits a print request with an **auto-generated OR number** (overridable).
- SuperAdmin reviews and approves pending print requests.
- Upon approval, the document can be printed and is marked as `Issued`.
- Dashboard "Total Issued Files" accurately counts only finalized `Issued` records.

---

## 🧠 Gemini AI Integration

To achieve the highest OCR accuracy across multiple document layouts, CiviCORE is designed to integrate **Google Gemini (gemini-2.5-flash)** into the OCR pipeline.

> ⚠️ **Note: Gemini API Key Not Yet Purchased**
> The Gemini AI integration is fully implemented in the codebase, but the production Gemini API key has **not yet been purchased**. The system currently falls back to EasyOCR + Tesseract for all document processing. Once a Gemini API key is acquired and added to the `.env` file (`GEMINI_API_KEY=`), the AI-powered extraction pipeline will activate automatically.

### What Gemini Enables
- **Multi-Form Version Support**: Automatically identify whether a document is a 1958 or 1993 layout variant and map fields to the unified schema accordingly.
- **Intelligent Field Mapping**: Rather than fixed pixel coordinates, Gemini reads the document semantically and maps fields like "Usual Residence of Mother" (older forms) to the standardized `mother_residence_house` schema field.
- **Graceful Handling of Missing Data**: Fields absent in older form layouts are intelligently skipped rather than causing extraction failures.

---

## ⚠️ Known Issues / Technical Debt

| Issue | Details | Workaround |
|-------|---------|------------|
| **OCR Stability on Low RAM** | On 4GB machines, running multiple EasyOCR workers may cause system instability. | Use Tesseract mode or limit to 1 queue worker (`RAM_PROFILE=4GB`). |
| **Auto-Fill Sync Delay** | OCR results may not auto-populate template preview boxes on first load. | Manually edit any field to trigger a re-sync. |
| **Template Alignment** | Form 102/103 field coordinates are approximate and may need printer calibration. | Use the Template Designer to visually fine-tune field positions. |
| **Type Detection on Low-Quality Scans** | Occasional misclassification. System now returns "Unknown" instead of a wrong guess. | User selects the correct template manually in the OCR panel. |

---

## 🔭 Future Development Plans

The following items have been identified and documented for upcoming development cycles:

### 📧 Upgrade: Email Driver — Mailtrap → Gmail SMTP
- The current email/OTP verification system uses **Mailtrap** (a development/sandbox mail catcher). For production deployment, this will be replaced with a real **Gmail SMTP** (or other production mail provider) so citizens and staff actually receive verification and notification emails.
- Required change: update `.env` `MAIL_MAILER`, `MAIL_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD`, and `MAIL_FROM_ADDRESS` to Gmail credentials.

### 📱 Enhancement: Phone Number / SMS Notifications for QR Tickets
- The QR ticketing system currently collects an optional `phone` field on the citizen request form but does not yet send SMS notifications.
- Future plan: Integrate an SMS gateway (e.g., **Semaphore**, **Vonage**, or **Globe Labs**) so that when a ticket's status changes (e.g., moves to *Serving*), the citizen receives an SMS alert with their queue number and estimated wait time.
- This mirrors the same approach as the ticket's QR code — using the stored `phone` number as the delivery target.

### 🔑 Gemini API Key Activation
- Purchase and configure a production Gemini API key to activate the AI-powered OCR pipeline for significantly higher extraction accuracy and multi-layout document support.

---

## 📝 Development Log — August 10, 2026

The following major features, enhancements, and system updates were implemented on **August 10, 2026**:

### 📊 Dedicated Export Reports Page & Export Suite (`Reports.jsx`)
- Built a dedicated **Reports & Analytics / Export Reports** view accessible via the main navigation sidebar (`/reports`).
- Implemented dual **CSV** (`.csv`) and **Excel** (`.xlsx`) export engines for Civil Registry Issuances, Documents, and Digital Ticket Requests.
- Supported detailed filtering capabilities:
  - **Date Range**: Precise date range filtering using the newly built `DatePickerInput` component.
  - **Certificate Type**: Filter by Birth (LCR Form 102), Death (LCR Form 103), or Marriage (LCR Form 101) certificates.
  - **Status**: Filter by Issued, Approved, Pending, or Archived document states.
  - **Barangay**: Filter by specific Naic barangay jurisdiction.
- Real-time statistics summary displaying exported record counts, type distribution breakdown, and progress tracking prior to export.

### 📜 Death & Marriage Certificate Live Preview & Overlay Calibration
- Resolved coordinate mapping, alignment shifts, and live PDF preview rendering for **LCR Form 103 (Death Certificate)** and **Form 101 (Marriage Certificate)** in `OcrFormPanel.jsx`, `Documents.jsx`, and `Issuances.jsx`.
- Standardized multi-certificate template overlays to accurately align text, signature fields, and registry headers across all civil document formats.

### 🖼️ Reference Picture SVG Fallback & Document Viewer Enhancements
- Created an SVG placeholder fallback system when reference document scans or previews are missing, corrupted, or unreachable across `AttachDocumentModal.jsx`, `OcrFormPanel.jsx`, and `ArchiveManager.jsx`.
- Enhanced image preview modals with full interactive controls: zoom slider, rotation reset, full-screen view, and side-by-side reference picture comparison.

### 📷 Interactive Camera Edge & Light Scanner (`CameraModal.jsx`, `captureEngine.js`)
- Comprehensive stability overhaul for webcam document scanning and real-time capture.
- Developed a GCash-style live scanning overlay in `captureEngine.js` featuring:
  - **Visual Edge Detection**: Real-time framing guides (green border when framed properly, red when misaligned).
  - **Ambient Lighting Analysis**: Live brightness indicator to notify users if lighting is too low or overexposed.
  - **Focus & Sharpness Check**: Pre-capture blur assessment.
- Integrated one-tap auto-crop and frame stabilization to ensure high-accuracy OCR processing on webcam captures.

### 📱 Mobile & Tablet Responsive Layout Overhaul
- Converted all system modules (`Dashboard`, `Documents`, `Issuances`, `Ticketing`, `PendingRequests`, `Reports`, `Accounts`) into fully responsive layouts for mobile and tablet screens.
- Replaced fixed grid columns and hardcoded pixel widths with dynamic responsive breakpoints (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, flex-wrap, dynamic padding).
- Eliminated vertical scroll locks and overflow cutoffs (`overflow-x-hidden`, responsive modal containers, touch-friendly action controls).

### 🎟️ Digital Service Request Lobby & Queue Enhancements (`PendingRequests.jsx`)
- Refactored the digital service request lobby with `AttachDocumentModal.jsx` for seamless document verification and attachment.
- Added database migration support for `tickets` soft-deletes (`2026_08_09_225347_add_soft_deletes_to_tickets_table.php`).
- Removed legacy unique index constraints on `issuances` to handle multi-request ticket processing without registry collisions.



---

## 📜 License
Developed by Team CiviCORE. [MIT License](https://opensource.org/licenses/MIT).
