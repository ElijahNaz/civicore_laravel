# ProcessDocumentOcr.php

**File Path:** `app\Jobs\ProcessDocumentOcr.php`
**Language Used:** PHP (Laravel)

## Purpose & Strategy
This file is the **Asynchronous Bridge** between your Laravel backend and your Python OCR server. It ensures the user's browser doesn't freeze while the heavy AI extraction occurs.

### Key Defense Talking Points:
1.  **Background Queues (`implements ShouldQueue`):**
    *   By implementing this interface, Laravel knows *not* to run this code during the regular HTTP request lifecycle. 
    *   Instead, it pushes the job to the database (`jobs` table). A background worker (running via terminal) picks it up and processes it silently.
2.  **Talking to Python via HTTP:**
    *   Inside the `handle()` method, this job uses Laravel's `Http::post()` method to send a network request to your local Python server (`http://127.0.0.1:8000/ocr/gemini`).
    *   It attaches the physical file path of the scanned document so Python can open it.
3.  **Handling the AI Response:**
    *   When Gemini finishes, it sends a JSON string back to this job.
    *   The job intercepts the JSON, finds the document in the database using `Document::find()`, updates the `extracted_fields` column, and changes the status to `extracted`.
4.  **Error Handling (`failed` method):**
    *   If the Python server crashes or Gemini is down, the job catches the exception and safely updates the document status to `failed` so the staff knows they need to try again, without crashing the whole application.

---
*This file is part of the CiviCORE system architecture.*