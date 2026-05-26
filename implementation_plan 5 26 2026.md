# CiviCore - System Alignment & Enhancements Plan

This implementation plan details the current state of the CiviCore system against the project's specific objectives, identifies the gaps/lacking features, and proposes a plan to implement and verify them.

---

## Current Status & Gap Analysis

Based on our analysis of the codebase, here is the current status of each specific objective:

| Objective | Description | Status | Details |
| :--- | :--- | :--- | :--- |
| **1a. OCR Search** | OCR-based searchability for historical records. | **Completed** | OCR-based search with webcam document camera search, EasyOCR & Tesseract Python engine. |
| **1b. Auto Gen** | Extract text from files to fill templates. | **Completed** | `template_profiles` system with pre-seeded coordinate overlays for LCR Form 102 & 103, and `TemplateDesigner`. |
| **1c. Geospatial** | Visualize demographic data & transaction volume. | **Completed** | Leaflet map with timeframe filtering (Today/Week/Month/Year/Custom Date Range), demographic ratio mode, heatmap mode, barangay rankings, and transaction velocity panel. |
| **1d. RBAC** | Ensure data security and define user privileges. | **Completed** | RequireSessionAuth, AdminRole, and SuperAdminRole middlewares enforce backend API access. |
| **1e. Approvals** | Document requests approval module. | **Completed** | In-person request modal, automated OR generation, and SuperAdmin approvals queue. |
| **1f. Data Mgmt** | Centralized module to add, update, and archive. | **Completed** | Archive Manager tab integrated into Documents UI supporting restore and purging. |
| **1g. QR Ticketing** | QR Code-based ticketing module for client requests. | **Completed** | Public client request portal, sequential QR tickets, live tracking, and staff dashboard queues. |

---

## Proposed Changes

To address the gaps, we propose adding the missing database schemas, controllers, and UI interfaces.

### Component 1: QR Code-based Ticketing Module

#### [NEW] [2026_05_26_000001_create_tickets_table.php](file:///c:/laragon/www/civicore_laravel/database/migrations/2026_05_26_000001_create_tickets_table.php)
Create a table to store client tickets:
- `id` (BigInt Auto-increment)
- `ticket_number` (String, unique queue identifier e.g., `T-2026-0001`)
- `client_name` (String)
- `email` / `phone` (String, optional)
- `purpose` (Enum: Birth Certificate, Death Certificate, Marriage Certificate)
- `status` (Enum: Pending, Serving, Completed, Cancelled)
- `details` (JSON, containing the client's information to speed up processing)
- `token` (String, unique tracking token for QR code verification)
- `created_at` / `updated_at`

#### [NEW] [Ticket.php](file:///c:/laragon/www/civicore_laravel/app/Models/Ticket.php)
Eloquent model to represent a client ticket.

#### [NEW] [TicketController.php](file:///c:/laragon/www/civicore_laravel/app/Http/Controllers/TicketController.php)
Controller exposing backend endpoints:
- `POST /api/public/tickets`: Create a new ticket (public client submission)
- `GET /api/public/tickets/{token}`: Retrieve ticket status & details (public status check)
- `GET /api/tickets`: List tickets (staff/admin view with filters)
- `PUT /api/tickets/{id}/status`: Update ticket status (e.g., mark as Serving, Completed)
- `POST /api/tickets/{id}/link-document`: Link a ticket to a generated issuance/document

#### [NEW] [Ticketing.jsx](file:///c:/laragon/www/civicore_laravel/resources/js/components/Ticketing.jsx)
A split interface component:
1. **Client Portal (Public)**: A sleek form allowing citizens to request document copy issuances. Upon submission, it renders a high-fidelity downloadable ticket with a dynamic **QR Code** (using `qrcode.react` or similar utility) containing the ticket tracking URL.
2. **Staff Dashboard (Private)**: A queue controller allowing staff to:
   - Call the next client in line.
   - Scan/verify a QR code (simulated via file upload or camera view).
   - View submitted request data and directly pre-fill a template.

### Component 2: Centralized Archive Management Tab

#### [MODIFY] [Documents.jsx](file:///c:/laragon/www/civicore_laravel/resources/js/components/Documents.jsx)
- Integrate an **Archive Manager** section in the UI.
- Provide a view to display soft-deleted files (`onlyTrashed()`).
- Add action buttons to **Restore** or **Permanently Delete** (purge) records, with audit trail tracking.

### Component 3: RBAC & Permission Reinforcement

#### [MODIFY] [routes/api.php](file:///c:/laragon/www/civicore_laravel/routes/api.php)
- Add middleware or policy layer to secure sensitive management routes (e.g., permanent deletion, template configuration updates, user account management) restricting them strictly to `Admin` users.

### Component 4: Geospatial Demographic Analytics Enhancements

#### [MODIFY] [Mapping.jsx](file:///c:/laragon/www/civicore_laravel/resources/js/components/Mapping.jsx)
- **Timeframe Filtering**: Add a timeframe dropdown filter in the Geospatial page offering filters: "All Time", "Today", "This Month", and "This Year".
- **Dynamic Data Updates**: The map markers, tooltips, popup statistics, timeline trajectory chart, velocity panel, and barangay rankings will all dynamically re-render based on the selected timeframe filter.
- Add a new "Demographic Ratio Mode" showing a comparison map (Birth vs. Death rates) across Naic barangays.
- Enhance the sidebar listing with detailed demographic rankings and transaction velocities (number of requests processed per day/week).

---

## Verification Plan

### Automated / Browser-based Testing
- Simulate a client filing a Birth Certificate request ticket, verifying the QR code is generated.
- Scan/verify the ticket inside the Staff dashboard, transitioning status from `Pending` -> `Serving`.
- Delete a document, verify it appears in the Archive section, and restore it.
- Log in as a `Staff` user and verify access is denied when attempting to delete templates or access system-wide configurations.

### Manual Verification
- Test PDF generation and print template alignment overlays.
- Verify Leaflet coordinates correspond correctly to Naic's geographical region.

---

## Future Development Plans

These items are **not yet scheduled** but have been identified as priorities for upcoming development cycles.

### 🔧 Fix: Death Certificate Stats / Counting Accuracy

Currently, the Geospatial Analytics stat cards (Death Certs count) and the Dashboard may undercount or misclassify death certificate records due to inconsistent `type` field values across the `issuances` and `documents` tables (e.g., `"Death"` vs `"death certificate"` vs `"Death Certificate (LCR Form 103)"`).

**Proposed Fix:**
- Normalize `type` field detection by expanding the `.includes('death')` check to also match common aliases.
- Add a dedicated `certificate_type` enum column (`birth | death | marriage`) to the `issuances` table to ensure reliable type classification regardless of free-text value.
- Update `DashboardController.php` and `Mapping.jsx`'s `combinedForStats` logic to use the normalized field.

**Files to Modify:**
- `app/Http/Controllers/DashboardController.php`
- `resources/js/components/Mapping.jsx` (stats aggregation logic)
- Migration: `add_certificate_type_to_issuances_table`

---

### 🔧 Fix: Marriage Certificate Stats / Counting Accuracy

Similar to the death certificate issue, marriage records may be miscounted or missed entirely from the Geospatial Analytics charts (Monthly Trajectory, Barangay Rankings) and Dashboard totals. The root cause is the same — inconsistent `type` string values.

**Proposed Fix:**
- Apply the same `certificate_type` enum normalization as above.
- Ensure the Monthly Trajectory chart's `monthData.marriages` array correctly accumulates records classified as marriage types.
- Add a dedicated "Marriage Certs" stat card to the Dashboard (currently only Births and Deaths have explicit cards).

**Files to Modify:**
- `app/Http/Controllers/DashboardController.php`
- `resources/js/components/Dashboard.jsx` (add Marriage Certs card)
- `resources/js/components/Mapping.jsx` (verify marriage accumulation logic)
