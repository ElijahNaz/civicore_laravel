# CiviCORE Ticketing & Issuance System Revamp - Implementation Plan

## 1. System Overview & Architecture Goal
**Objective:** Revamp the existing CiviCORE ticketing system to decouple the **Digital Request Lifecycle** from the **Physical Lobby Queue**. 
**Tech Stack:** Laravel (Backend/API) & React (Frontend).
**Context:** This ensures civil registry staff can utilize OCR to locate and attach documents *before* the citizen arrives in person at the Naic registry office, reducing physical wait times and streamlining the final issuance approval.

---

## 2. Phase 1: Database Refactoring (Laravel Migrations)
Create an `update_tickets_table` migration instead of building a new table. This prevents data loss while restructuring the state machine.

### Migration Requirements (`up` method):
* **Add Foreign Key:** `document_id` (nullable, constrained to `documents` table).
* **Split Status Columns:**
    * `request_status` (Enum/String: `pending`, `document_attached`, `ready_for_pickup`, `cancelled`, `completed`). Default: `pending`.
    * `queue_status` (Enum/String: `not_in_lobby`, `waiting`, `serving`, `missed`). Default: `not_in_lobby`.
* **Add Queue Tracking:** `queue_number` (Integer, nullable - for the daily live lobby queue, e.g., 101, 102).
* **Add QR Token:** `qr_code_token` (String, unique - if not already existing).
* **Add Timestamps:** `verified_at` (nullable), `issued_at` (nullable).
* *Note for AI Code Gen:* Include logic to map existing legacy `status` data to the new `request_status` / `queue_status` paradigm to avoid breaking active queues.

---

## 3. Phase 2: Eloquent Model Refactoring
Update the `Ticket.php` model to support the new schema.

### Model Updates:
* Add relationships: 
    * `public function document() { return $this->belongsTo(Document::class); }`
    * `public function user() { return $this->belongsTo(User::class); }`
* Add casts for the new status columns.
* (Optional but recommended) Implement status scope queries (e.g., `scopePendingRequests($query)`, `scopeActiveLobbyQueue($query)`).

---

## 4. Phase 3: Controller & API Endpoint Split
Refactor the `TicketController` to handle the asynchronous nature of the new flow.

### Required Endpoints:
1.  **Request Generation:** `POST /api/v1/tickets`
    * *Action:* User requests a document. Generate ticket, create `qr_code_token`, set `request_status = 'pending'`.
2.  **Staff Acceptance & OCR Attachment:** `PATCH /api/v1/tickets/{id}/attach`
    * *Payload:* `{ document_id: int }`
    * *Action:* Staff finds document via CiviCORE OCR, attaches it. Updates `request_status` to `ready_for_pickup`. Triggers notification to user.
3.  **Lobby Kiosk Check-in (QR Scan):** `POST /api/v1/tickets/scan`
    * *Payload:* `{ qr_code_token: string }`
    * *Action:* Validates QR. If `request_status == 'ready_for_pickup'`, sets `queue_status = 'waiting'` and assigns the next daily `queue_number`.
4.  **Final Issuance (Admin Counter):** `POST /api/v1/tickets/{id}/issue`
    * *Action:* Admin verifies physical ID against the pre-attached document. Marks `request_status = 'completed'`, removes from active `queue_status`, records `issued_at`.

---

## 5. Phase 4: Fix Edit Issuance Bugs (Duplicate Checker & Saving)

The user reported two main issues when modifying an existing record in the Issuances section:
1. **False Positive Duplicate Check:** The system flags the record as a duplicate of itself because the Duplicate Checker doesn't realize this record is already the master issuance in the registry.
2. **Changes Not Saving Properly:** Edits made in the UI do not seem to properly overwrite the record or rebuild the PDF as expected.

## User Review Required

> [!IMPORTANT]
> Please review this plan to confirm that we should completely bypass the duplicate checker for existing issuances, and verify the backend fix for the update mechanism.

## Proposed Changes

### 1. Disable Duplicate Checker for Existing Issuances
We will prevent the duplicate checker from running if the document is already an issuance.

#### [MODIFY] [OcrFormPanel.jsx](file:///c:/laragon/www/civicore_laravel/resources/js/components/OcrFormPanel.jsx)
- In the `useEffect` that triggers `checkDuplicateRecord`, add a condition to immediately return if `file.source === 'issuance'` or the file ID indicates it's an issuance. 
- This ensures that records already in the registry are not compared against the registry.

### 2. Fix Backend Update & PDF Regeneration Logic
We will ensure that the changes submitted from the frontend are strictly saved to the database and accurately reflected in the regenerated PDF.

#### [MODIFY] [IssuanceController.php](file:///c:/laragon/www/civicore_laravel/app/Http/Controllers/IssuanceController.php)
- In the `update` method, ensure that both `extracted_data` and `extracted_fields` keys are mapped correctly so the database strictly receives the new JSON.
- When regenerating the PDF at the end of the `update` function, forcefully inject the newly provided `extracted_fields` rather than relying solely on fetching the old row, ensuring the visual PDF reflects the exact edits submitted by the user.

## Verification Plan

### Manual Verification
1. Open the "Issuances" section.
2. Click to edit any existing certificate.
3. **Verify:** The "Potential Duplicate Detected" warning should no longer appear.
4. Modify a field (e.g., change the First Name or Barangay).
5. Click Save.
6. **Verify:** The grid immediately reflects the new name, and clicking "View PDF" shows the updated text overlaid on the document.

---

## 6. Phase 5: Frontend (React) Dashboard Updates
The staff/admin frontend needs to be split to reflect the decoupled logic.

### Component Structure:
* **1. Digital Requests Dashboard (`PendingRequests.jsx`)**
    * Displays all tickets with `request_status == 'pending'`.
    * Contains the CiviCORE OCR search module alongside the ticket details.
    * Action button: "Attach Document & Mark Ready".
* **2. Live Lobby Queue Monitor (`LobbyQueue.jsx`)**
    * Displays tickets with `queue_status == 'waiting'` or `serving`.
    * Admin view allows calling the next number (updates to `serving`).
    * Action button: "Verify ID & Issue Document".
* **3. Citizen Kiosk/Scanner (`KioskScanner.jsx`)**
    * Simple interface for scanning the QR code upon arrival to trigger the `/api/v1/tickets/scan` endpoint.
