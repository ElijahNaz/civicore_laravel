# CiviCORE - Civic Document Management System

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-12.0-red?style=for-the-badge&logo=laravel" alt="Laravel Version">
  <img src="https://img.shields.io/badge/PHP-8.2+-purple?style=for-the-badge&logo=php" alt="PHP Version">
  <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" alt="React Version">
  <img src="https://img.shields.io/badge/Gemini%20AI-Main%20OCR-green?style=for-the-badge&logo=google" alt="Gemini AI">
  <img src="https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=for-the-badge&logo=tailwind-css" alt="Tailwind Version">
  <img src="https://img.shields.io/badge/Last%20Updated-September%202026-brightgreen?style=for-the-badge" alt="Last Updated">
</p>

CiviCORE is an document management platform tailored for Local Government Units (LGUs). It streamlines civil registry operations through AI-assisted Optical Character Recognition (OCR) powered by Google Gemini for Birth, Marriage, and Death certificates, an interactive webcam scanner with live framing guidance, QR code-based citizen request ticketing, and geospatial demographic analytics across barangay jurisdictions.

---

## System Requirements

Before setting up the project, ensure your local environment satisfies the following minimum requirements:

### 1. Runtimes and Services
- **PHP 8.2 or higher**: Required for Laravel 12 core framework execution.
- **Node.js 18.x or higher**: Required for React 19 and Vite asset bundling.
- **Google Gemini API Key**: Main OCR engine requirement (`GEMINI_API_KEY` in `.env`).
- **Python 3.10 or higher**: Optional / microservice bridge runner.
- **MySQL 8.0+ or MariaDB 10.4+**: Relational database engine.

### 2. Recommended Windows Stack
- **Laragon Full**: Provides Apache/Nginx, PHP 8.2+, MySQL, and automatic local virtual hosts.

---

## Installation and Setup Guide

Follow these steps sequentially to set up CiviCORE locally:

### 1. Clone the Repository
Open a terminal and clone the source repository:
```bash
git clone https://github.com/louieramilo0101/civicorelaravel2.git
cd civicore_laravel
```

### 2. Install Dependencies
Install PHP packages via Composer and JavaScript dependencies via Node Package Manager:

```bash
# Install PHP dependencies
composer install

# Install Frontend dependencies
npm install
```

### 3. Configure Environment File
Create your environment configuration file from the provided template:
```bash
cp .env.example .env
php artisan key:generate
```

Open `.env` and set your database and Gemini AI credentials:
```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=civicore_laravel
DB_USERNAME=root
DB_PASSWORD=

GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Database Setup and Migration
Run database migrations to generate all required tables, indexes, and soft-delete schemas:
```bash
php artisan migrate
```

Optionally, run seeders to populate initial barangay reference records and administrative accounts:
```bash
php artisan db:seed
```

Default administrative account credentials (if seeded):
- **SuperAdmin**: `superadmin@civicore.gov.ph` / `superadmin2024`
- **Admin**: `admin@civicore.gov.ph` / `admin2024`

### 5. Storage Link Creation
Link the public storage path to make document attachments and generated QR codes accessible:
```bash
php artisan storage:link
```

---

## Operating the Application

### One-Click System Launcher (Windows)
A pre-configured batch script is included in the project root: `start-civicore.bat`.

Double-click `start-civicore.bat` or run it from command prompt:
```cmd
start-civicore.bat
```

This automatically orchestrates:
- **Laravel HTTP Web Server** (`http://127.0.0.1:8000`)
- **Vite Development Server** (Hot Module Replacement for React)
- **FastAPI Python Microservice Bridge** (Port 5000)
- **Queue Workers**:
  - `high` queue: handles single-page scanning and priority OCR tasks.
  - `low` queue: handles multi-page document processing fan-out.
  - `default` queue: handles background email dispatches and system jobs.

Once started, access the Web Interface at:
**http://localhost:8000**

---

## System Architecture and Key Modules

### 1. Document Management and Main OCR Engine
- **Main OCR Engine - Google Gemini AI (`gemini-2.5-flash`)**: Google Gemini AI is the primary and active OCR engine powering intelligent document parsing, field extraction, and layout understanding across Birth, Marriage, and Death certificates.
- **Engine Status Note**: Legacy/offline engines (Tesseract and EasyOCR) are currently disabled and not operational. Google Gemini AI serves as the single active extraction engine.
- **Multi-Certificate Processing**: Supports LCR Form 102 (Live Birth), Form 103 (Death), and Form 101 (Marriage).
- **Webcam Edge Engine**: Real-time camera canvas with framing boundaries, ambient lighting detection, and blur/sharpness metrics.
- **Audit Logging**: Comprehensive record tracking for document view, upload, edit, archive, and print events.

### 2. Recipient Name Standardization Rules
- All recipient and subject names across Birth, Death, and Marriage certificates follow a strict uppercase format:
  - **Single Subject (Birth / Death)**: `LASTNAME, FIRSTNAME MIDDLENAME SUFFIX` (e.g., `DELA CRUZ, JUAN PEDRO`)
  - **Joint Subject (Marriage)**: `HUSBAND_LASTNAME, HUSBAND_FIRSTNAME HUSBAND_MIDDLENAME & WIFE_LASTNAME, WIFE_FIRSTNAME WIFE_MIDDLENAME`
- **Input Sanitization**: Numbers and invalid symbols are blocked on name fields, and full uppercase styling is enforced automatically on save and display.

### 3. Citizen QR Ticketing and Queue Management
- **Public Request Portal**: Citizens submit request forms online without needing an account.
- **QR Code Ticket Generation**: Automatically generates a unique QR code ticket linked directly to the public status endpoint (`/ticket-status/{ticket_number}`).
- **Staff Queue Panel**: Staff can manage requests in real time, transitioning states (`Pending` -> `Serving` -> `Completed` -> `Issued`).

### 4. Geospatial Analytics Dashboard
- **Interactive Mapping**: Leaflet map bounded to Naic barangay coordinates.
- **Visual Analytics Modes**:
  - **Heatmap Overlay**: Displays volume density per barangay.
  - **Demographic Ratios**: Color-codes birth-to-death ratios per location.
  - **Barangay Leaderboard**: Ranks regions by document volume.
  - **Date Range Controls**: Filter metrics by All Time, Today, This Week, This Month, This Year, or Custom Date Intervals.

### 5. Export Suite and Reporting (`/reports`)
- Dedicated reporting console supporting data extraction in **CSV** and **Excel (.xlsx)** formats.
- Granular search filters: Date Ranges, Certificate Types, Statuses, and Barangay Jurisdictions.

---

## Technical Specifications & Character Limits

All civil document entry fields are strictly validated on both client and backend layers:

| Field Name | Type | Max Characters | Constraints |
|------------|------|----------------|-------------|
| `registry_number` | String | 30 | Alphanumeric, hyphens |
| `last_name` / `husband_last_name` / `wife_last_name` | String | 50 | Alphabetic, spaces, dashes, dots |
| `first_name` / `husband_first_name` / `wife_first_name` | String | 50 | Alphabetic, spaces, dashes, dots |
| `middle_name` / `husband_middle_name` / `wife_middle_name` | String | 50 | Alphabetic, spaces, dashes, dots |
| `suffix` | String | 10 | Standard suffixes (Jr., Sr., III) |
| `barangay` | String | 100 | Selected from registered barangays |
| `ticket_number` | String | 50 | Generated unique identifier |
| `contact_number` / `phone` | String | 15 | Numeric, leading plus |
| `email` | String | 100 | RFC 5322 compliant email format |

---

## Summary of Completed Project Objectives

| ID | Module / Feature | Status | Implementation Details |
|----|------------------|--------|------------------------|
| **1a** | OCR Document Search | Completed | Camera overlay search & file upload scanning powered by Google Gemini AI. |
| **1b** | Document Template Overlay | Completed | Pre-calibrated field coordinate maps for LCR Forms 101, 102, and 103 with visual editor. |
| **1c** | Geospatial Analytics | Completed | Interactive Leaflet map with Heatmaps, Ratios, Leaderboards, and Date Range filtering. |
| **1d** | Role-Based Access Control | Completed | Middleware enforcement (`RequireSessionAuth`, `AdminRole`, `SuperAdminRole`). |
| **1e** | Issuance Approval Workflow | Completed | Official Receipt (OR) generation and SuperAdmin print authorization queue. |
| **1f** | Centralized Archive | Completed | Soft-delete, document restoration, permanent purge, and history audit trail logs. |
| **1g** | QR Code Ticketing System | Completed | Public ticket registration, sequential QR generation, and `/ticket-status/{ticket_number}` viewer. |
| **1h** | Custom Export Suite | Completed | Flexible CSV and Excel export module with multi-attribute filtering. |

---

## Troubleshooting Checklist

1. **OCR Extraction Failure / Missing Key**:
   Ensure `GEMINI_API_KEY` is correctly set in your `.env` file. Google Gemini AI is the active engine.
2. **Database Connection Exception**:
   Verify `DB_PORT` in `.env`. Laragon often defaults MySQL to port `3306` or `3307`.
3. **Document Preview Mismatch**:
   Ensure storage symlink is active (`php artisan storage:link`) and cleared view caches (`php artisan view:clear`).
4. **Vite CSS or Component Assets Not Rendering**:
   Execute `npm run build` to compile production assets.

---

To achieve the highest OCR accuracy across multiple document layouts, CiviCORE is designed to integrate **Google Gemini (gemini-3.6-flash)** into the OCR pipeline.

> ⚠️ **Note: Gemini API Key Not Yet Purchased**
> The Gemini AI integration is fully implemented in the codebase (Elijah "I added a google AI studio free API for this), but the production Gemini API key has **not yet been purchased**. The system currently falls back to EasyOCR + Tesseract for all document processing. Once a Gemini API key is acquired and added to the `.env` file (`GEMINI_API_KEY=`), the AI-powered extraction pipeline will activate automatically.

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
## License

Developed by Team CiviCORE. Released under the [MIT License](https://opensource.org/licenses/MIT).


