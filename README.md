# 🏛️ CiviCORE - Civic Document Management System

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-12.0-red?style=for-the-badge&logo=laravel" alt="Laravel Version">
  <img src="https://img.shields.io/badge/PHP-8.2+-purple?style=for-the-badge&logo=php" alt="PHP Version">
  <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" alt="React Version">
  <img src="https://img.shields.io/badge/Python-3.10+-yellow?style=for-the-badge&logo=python" alt="Python Version">
  <img src="https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=for-the-badge&logo=tailwind-css" alt="Tailwind Version">
  <img src="https://img.shields.io/badge/Last%20Updated-May%2026%2C%202026-brightgreen?style=for-the-badge" alt="Last Updated">
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

These objectives define the full scope of the CiviCORE system. All items below have been implemented and verified as of **May 26, 2026**.

| # | Objective | Status | Summary |
|---|-----------|--------|---------|
| **1a** | OCR-Based Searchability | ✅ **Completed** | Full OCR search with webcam camera overlay in the Issuances section. Uses EasyOCR + Tesseract Python engine. Scan a document with your camera or upload a file — extracted fields auto-fill the search bar. |
| **1b** | Auto-Generation from Extracted Text | ✅ **Completed** | `template_profiles` system with pre-seeded coordinate overlays for LCR Form 102 (Birth) & Form 103 (Death). Interactive `TemplateDesigner` allows admins to calibrate field positions visually. |
| **1c** | Geospatial Demographic Analytics | ✅ **Completed** | Interactive Leaflet map showing barangay-level distribution of Birth, Death, and Marriage records across Naic. Features: Heatmap Mode, Demographic Ratio Mode, Barangay Rankings, Transaction Velocity panel, and full Timeframe Filtering (Today / This Week / This Month / This Year / Custom Date Range). |
| **1d** | Role-Based Access Control (RBAC) | ✅ **Completed** | `RequireSessionAuth`, `AdminRole`, and `SuperAdminRole` middleware enforce backend API access. Staff, Admin, and SuperAdmin privilege levels are enforced across all routes. |
| **1e** | Document Request Approval Workflow | ✅ **Completed** | In-person request modal with automated Official Receipt (OR) number generation. SuperAdmin approval queue integrated into the Issuances view. Approved requests can then be printed. |
| **1f** | Centralized Data Management | ✅ **Completed** | Archive Manager tab integrated into the Documents UI. Supports soft-delete, Restore, and Permanent Purge with full audit trail tracking. |
| **1g** | QR Code-Based Ticketing | ✅ **Completed** | Public citizen request portal with sequential QR ticket generation. Live queue tracking for staff with status transitions (Pending → Serving → Completed). QR code links to real-time ticket status page. |

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
| **Mobile Responsive UI Layouts** | Dashboard stats grid, mapping cards, welcome banner sizing, public landing page vertical scrolling, and Account settings are optimized for PC/large screens only. Mobile/tablet views have layout breakages, scroll locks, and oversized UI elements. | Tracked as a future development item to be resolved after PC interface is fully finalized. |
| **OCR Stability on Low RAM** | On 4GB machines, running multiple EasyOCR workers may cause system instability. | Use Tesseract mode or limit to 1 queue worker (`RAM_PROFILE=4GB`). |
| **Auto-Fill Sync Delay** | OCR results may not auto-populate template preview boxes on first load. | Manually edit any field to trigger a re-sync. |
| **Template Alignment** | Form 102/103 field coordinates are approximate and may need printer calibration. | Use the Template Designer to visually fine-tune field positions. |
| **Marriage Cert Overlay** | Municipal Form No. 101 (Marriage) overlay is not yet implemented. | Tracked as a future development item. |
| **Type Detection on Low-Quality Scans** | Occasional misclassification. System now returns "Unknown" instead of a wrong guess. | User selects the correct template manually in the OCR panel. |
| **Death & Marriage Stats Accuracy** | Geospatial and Dashboard stats may undercount Death/Marriage records due to inconsistent `type` field values. | Tracked as a future development item (see below). |

---

## 🔭 Future Development Plans

The following items have been identified and documented for upcoming development cycles:

### 📱 Mobile UI Layout Refinement (Problem 3 Deferral)
- Optimize Dashboard stats grids and cards to use a 2x2 grid layout on mobile viewports.
- Scale down welcome banners, headers, and motto text size dynamically on smaller viewports.
- Fix scroll lock issues by changing `overflow-hidden` to `overflow-x-hidden` in layout wrappers to allow vertical swipe.
- Redesign `Accounts.jsx` grid layouts (`lg:grid-cols-12`) to stack gracefully on mobile screens.

### 🔧 Fix: Death Certificate Stats / Counting Accuracy
- Normalize `type` field detection across `issuances` and `documents` tables (e.g., `"Death"` vs `"death certificate"` vs `"Death Certificate (LCR Form 103)"` all resolve to the same type).
- Add a dedicated `certificate_type` enum column (`birth | death | marriage`) to `issuances` to ensure reliable classification.
- Update `DashboardController.php` and `Mapping.jsx` stats aggregation to use the normalized field.

### 🔧 Fix: Marriage Certificate Stats / Counting Accuracy
- Apply the same `certificate_type` normalization as the death certificate fix.
- Verify the Monthly Trajectory chart correctly accumulates marriage records.
- Add a dedicated **Marriage Certs** stat card to the Dashboard (currently only Births and Deaths have their own cards).

### 🔧 Marriage Certificate Overlay System
- Implement the LCR Form 101 (Marriage Certificate) overlay template with full field mapping support in the `TemplateDesigner`.

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

## 📝 Development Log — May 26, 2026

The following features were implemented in the morning session of **May 26, 2026**:

### 🎟️ QR Code Ticketing System (Component 1)
- Created `tickets` database table with sequential ticket numbering (`T-2026-0001` format), client info, purpose, status, and unique QR tracking token.
- Built `TicketController` with public submission, status tracking, and staff queue management endpoints.
- Implemented `Ticketing.jsx` split interface:
  - **Public Portal**: Citizens fill a form and receive a downloadable QR ticket.
  - **Staff Dashboard**: Real-time queue view with status transition controls (Pending → Serving → Completed).

### 🗄️ Archive Management (Component 2)
- Added Archive Manager tab to the Documents UI.
- Staff can soft-delete records (move to archive), restore them, or permanently purge with confirmation.
- Full audit trail maintained for all archive actions.

### 🔐 RBAC & Session Security (Component 3)
- Implemented `RequireSessionAuth`, `AdminRole`, and `SuperAdminRole` middleware.
- Protected sensitive API routes (template management, permanent deletion, user administration) under admin/superadmin middleware groups.

### 🖨️ Print Approval Workflow & Automated Receipts (Component 5)
- Changed the "Print" button in Issuances to a **"Request Print"** workflow.
- Automated **Official Receipt (OR) number** generation — pre-filled on modal open, overridable by staff.
- SuperAdmin approval queue: pending requests await approval before printing is authorized.
- Dashboard "Total Issued Files" now accurately counts only records with `status = 'Issued'`.

### 📷 OCR-Based Camera Search (Component 5)
- Added a **Scan Search** camera button next to the search bar in the Issuances Master Database view.
- Clicking it opens a full-screen overlay with:
  - Live webcam feed with capture button.
  - File upload drag-and-drop alternative.
- Captured image is sent to the Python OCR backend (`/api/issuances/ocr-search`).
- Extracted fields (name, registry number, barangay) auto-fill the search bar and filter the list.

### 🗺️ Geospatial Time Filtering (Component 4)
- Replaced the basic dropdown with a full **Filter Bar** featuring:
  - Quick-select pills: **All Time / Today / This Week / This Month / This Year**
  - **Custom Date Range** picker with animated slide-in panel (From date → To date → Apply Range button).
- Active filter badge below stat cards shows current period and live record count with inline clear button.
- All map markers, stat cards, Monthly Trajectory chart, Barangay Rankings, and the Prints table react to the selected timeframe.
- Upgraded header design: icon now uses a branded gradient background box matching the project's design language.

---

## License
Developed by Team CiviCORE. [MIT License](https://opensource.org/licenses/MIT).

---

## 📝 Development Log — May 26, 2026 (Afternoon Session)

The following features were implemented in the afternoon session of **May 26, 2026**:

### 📊 Issuance Dashboard — 3-Tab Analytics Panel
- Replaced the static 4 stat cards in `Issuances.jsx` with a **3-tab unified dashboard panel**:
  - **Tab 1 – Overview**: Upgraded stat cards (Master DB dark card + Birth/Death/Marriage with hover scale animations).
  - **Tab 2 – Per Category**: SVG donut chart + progress bars per type + status breakdown grid (Issued / Approved / Active / Pending).
  - **Tab 3 – Top Issued**: Top 5 barangays with gold/silver/bronze badges + Most Active Type badge + recently issued records list.

### 🗺️ Mapping Section — Tabbed Stat Panel
- Replaced the 5 static stat cards at the top of `Mapping.jsx` with a **2-tab clickable panel**:
  - **Tab 1 – Records Overview**: Uploaded Docs / Birth Certs / Death Certs / Marriage Certs / Most Active Barangay (same as before, with upgraded card design and hover animations).
  - **Tab 2 – Issued Per Category**: Shows how many Birth, Death, and Marriage records have been **formally issued** from the issuances table, with mini progress bars, percentage-of-total labels, Total Issued count, and Top Barangay by issuances. Respects the active time filter.

### 🗺️ Mapping Section — "By Barangay" Right Panel Tab
- Added a **3rd tab** ("By Barangay") to the right analytics panel in `Mapping.jsx`.
- Shows ranked barangay list with:
  - Gold/silver/bronze rank badges for top 3.
  - Mini gradient progress bars relative to the highest-ranked barangay.
  - Birth (B) / Death (D) / Marriage (M) breakdown per row.
  - **Top 10 by default** with a **"↓ Show All X Barangays"** toggle button (only visible when >10 have records).
  - Clicking any row pans the map and opens the barangay popup via `locateBarangay()`.

### ✅ Input Validation — Unknown Document Type Guard
- Added a **type detection banner** to `OcrFormPanel.jsx`: when OCR cannot auto-detect the document type, an amber warning banner appears at the top of the form.
- Staff selects Birth / Death / Marriage manually via 3 pill buttons.
- Banner turns **red** if the user attempts to save without selecting a type.
- Save is blocked until a valid type is chosen.

### ✍️ Signature Fields — Initial Implementation
- Created `SignaturePad.jsx` — a canvas-based signature drawing component with:
  - Draw with mouse or touch, Undo last stroke, Clear (resets to `n/a`), Done.
  - Saves as **base64 PNG data URL** in the field value.
  - Shows `n/a` badge when blank; shows existing signature as a preview image.
- Updated `BirthCertificateConfig.js`: all 5 signature fields now use `type: 'signature'` so the form renders the pad instead of a plain text box.
- Signature fields are **optional** — left blank automatically saves as `n/a`.

---

## ⏳ Pending Tasks (Next Session)

The following items are planned for the **next development session**:

### ✍️ Signature Extraction from Scanned Documents
**Goal**: When a civil registry document is uploaded and processed by OCR, automatically crop the signature regions from the scanned image and pre-populate the signature fields — instead of leaving them blank/`n/a`.

**Approach**:
- The `BirthTemplateOverlayFields` array in `BirthCertificateConfig.js` already contains the `x, y, w, h` coordinates (as fractions of image size) for every signature field position on LCR Form 102.
- On the **backend** (`DocumentController.php` or the Python OCR server), after the image is uploaded:
  1. Load the scanned image using **Intervention Image** (PHP) or **Pillow** (Python).
  2. For each signature field, compute the pixel crop box: `px = x * imgWidth`, `py = y * imgHeight`, etc.
  3. Apply a **threshold/binarize** filter to isolate the ink from the paper background (grayscale → adaptive threshold → invert).
  4. Save each cropped region as a base64 PNG string.
  5. Return the base64 strings alongside `extracted_fields` in the OCR API response.
- On the **frontend** (`OcrFormPanel.jsx`), initialize signature field values from the returned base64 strings instead of `n/a`.
- The `SignaturePad` component already supports displaying a base64 image as an existing signature — no changes needed there.

**Files to modify**:
- `ocr_server.py` — add signature region cropping in the extraction pipeline.
- `app/Http/Controllers/DocumentController.php` — forward cropped signature data in the response.
- `OcrFormPanel.jsx` — read signature base64 values from `ocrResult.extracted_fields` on init (already handled by the existing `ef[f.key]` fallback).
- `BirthCertificateConfig.js` — coordinates already defined; may need slight calibration per scan DPI.

**Open question**: Should signature extraction happen server-side (Python/PHP) or client-side (Canvas API using the already-loaded document image)? Client-side avoids a backend change but depends on CORS/image accessibility. Server-side is more reliable for skewed/low-DPI scans.

---

### 🗺️ Mapping — Barangay Involvement (Advanced)
- Consider adding barangay drill-down in the Mapping right panel: clicking a barangay row shows a breakdown panel with a mini chart of its Birth/Death/Marriage trend over time.