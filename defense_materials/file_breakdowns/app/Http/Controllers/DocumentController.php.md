# DocumentController.php

**File Path:** `app\Http\Controllers\DocumentController.php`
**Language Used:** PHP (Laravel)

## Purpose & Strategy
This is arguably the most important backend controller in the entire CiviCORE system. It handles the core logic for the **Sandbox / Staging Area** of the application. 

### Key Defense Talking Points:
1.  **The Upload Process (`upload` method):**
    *   When a staff member drops a file into the React frontend, this controller receives it. 
    *   It securely saves the raw image/PDF into Laravel's `storage/app/public/documents` directory.
    *   It creates a new row in the `documents` table with a status of `pending`.
2.  **The Background Queue Integration:**
    *   *This is crucial:* It does NOT run the heavy OCR Python script directly. If it did, the browser would freeze for 10+ seconds.
    *   Instead, it dispatches a background job: `ProcessDocumentOcr::dispatch($document->id)`.
    *   It then immediately returns a `200 OK` JSON response to React so the user interface remains fast and responsive.
3.  **Verification Logic (`quickApprove` / `storeManual`):**
    *   Handles the data sent when the staff clicks "Save" in the `OcrFormPanel`.
    *   Validates the incoming Gemini JSON data and moves it from the `documents` staging table into the final `issuances` master registry table.

---
*This file is part of the CiviCORE system architecture.*