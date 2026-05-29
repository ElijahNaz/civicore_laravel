# System Architecture & Data Flow Guide

This document provides a comprehensive, start-to-finish explanation of how your system operates. This is your "Master Guide" for the defense, connecting all the pieces of the system together and justifying your technical decisions.

---

## 1. The Tech Stack: "Why did we use these technologies?"
Expect the panelists to ask you why you chose your specific tools. Here is how you answer them confidently:

*   **Why Laravel (Backend)?** 
    *   *Answer:* Laravel is the most robust PHP framework available. We chose it because it provides built-in, secure solutions for routing, database migrations, and authentication. Instead of writing raw SQL and risking security vulnerabilities, Laravel's Eloquent ORM allows us to interact with the database securely and rapidly. It also natively supports API creation, which is essential for our React frontend.
*   **Why React (Frontend)?** 
    *   *Answer:* Traditional websites reload the entire page every time you click a button. We chose React to build a **Single Page Application (SPA)**. React only updates the specific parts of the screen that change (like a progress bar or an OCR panel sliding in). This provides a fast, seamless, "desktop-app-like" experience for the registry staff, which is critical when they are processing hundreds of documents a day.
*   **Why TailwindCSS (Styling)?** 
    *   *Answer:* Tailwind is a utility-first CSS framework. Instead of maintaining thousands of lines in separate `.css` files, Tailwind allows us to style components directly in our React files using utility classes. This guarantees consistency across the UI, makes it incredibly easy to implement our "Glassmorphism" design, and ensures the application is perfectly responsive on all screen sizes.
*   **Why Gemini AI (OCR Engine)?**
    *   *Answer:* Standard OCR tools (like Tesseract) only read text blindly—they don't understand *context*. We integrated Google's Gemini AI because it is a multimodal Large Language Model (LLM). When we feed it a scanned, messy Birth Certificate, Gemini doesn't just read the words; it *understands* the document structure. It can accurately distinguish between the "Father's Name" and the "Doctor's Name" even if the paper is faded or slightly misaligned, returning perfectly structured JSON data.

---

## 2. The Data Flow: "How does data move through the system?"
Let's trace the journey of a document from the moment it is scanned until it is saved in the database.

### Step A: The Upload (React to Laravel)
1. A staff member opens the **Documents** page in React and uploads a scanned PDF or Image.
2. The code in `resources/js/components/Documents.jsx` (specifically around **Line 295**) uses the `fetch` API to send a `POST` request with the file data to the backend.
3. The request hits `routes/api.php` (at **Line 78**), which routes the `/api/documents/upload` endpoint to the `DocumentController`.
4. In `app/Http/Controllers/DocumentController.php` (starting at **Line 246**), the `upload` method validates the file. It saves the physical file to the local storage disk (around **Line 294**), creates a `Pending` database record, and then queues the background OCR job (at **Line 316**).

### Step B: The AI Extraction (Laravel to Python/Gemini)
1. The background job `app/Jobs/ProcessDocumentOcr.php` picks up the file. At **Line 140**, it sends an HTTP POST request containing the file path to our Python server (`http://127.0.0.1:8080/ocr/gemini`).
2. **Pre-Processing (The Python Server - `ocr_server.py`):**
    * If the uploaded file is a PDF, the Python server hits the `/split` endpoint (around **Line 954**). It uses `PyMuPDF (fitz)` to extract the first page (ignoring the rest to save Gemini API token costs).
    * It converts the image to grayscale (`convert("L")`) to strip out unnecessary color data and compresses it using Lanczos resampling. This makes the image smaller and easier for the AI to read quickly.
3. **The Gemini AI Engine:**
    * The Python server packages the optimized, black-and-white image and sends it to the **Google Gemini API** using the `google-genai` module.
    * The prompt sent to Gemini instructs it to act as a civil registry expert and extract specific fields into a strict JSON format.
4. Gemini processes the image, understands the context, and replies with structured data.
5. **Post-Processing & Cleanup:**
    * Before returning to Laravel, the Python server cleans the data: it splits full names into First, Middle, and Last names, and normalizes date formats.
    * Back in Laravel, `ProcessDocumentOcr.php` (around **Line 165**) runs an additional `OcrParserService` as a fallback, merging any missing fields.
    * Finally, Laravel updates the database record with the extracted fields and changes the document status to `extracted` (around **Line 250**).

### Step C: The Verification (Laravel to React)
1. React polls the status, notices it is `extracted`, and slides open the **`OcrFormPanel.jsx`** component.
2. The user sees the original scanned image on the left and the Gemini-extracted text populated in editable textboxes on the right.
3. The staff member visually verifies that the AI didn't make a mistake (e.g., verifying that an "8" wasn't misread as a "B").

### Step D: Saving the Data (React to Laravel to Database)
1. Once the staff clicks "Save", React sends the verified data via a `PUT` request to `/api/documents/{id}`.
2. **The Mapping Logic happens here:** On the frontend, `Mapping.jsx` implements `findClosestBarangay` using Levenshtein distance. If Gemini extracted *"Bgy. San Jse"*, the algorithm compares it against our master list of strict barangays and automatically snaps it to the closest match: *"San Jose"*. This ensures the data going to the backend is clean.
3. The request hits `app/Http/Controllers/DocumentController.php` (at **Line 555**, `update` method).
4. This calls the `performSave` method (at **Line 731**), which updates the document's final data, status (`Processed` or `Issued`), and automatically generates a composite PDF of the record.

---

## 3. The Ticketing System Flow
If the panelists ask about the online public request feature, here is the detailed flow of how it works under the hood:

1. **Submission (Public to Laravel):** A citizen goes to the public portal and requests a certificate. This sends a `POST` request to `/api/v1/tickets`.
2. **Ticket Generation (`TicketController.php`):** The `store` method (around **Line 60**) handles this. It generates a unique Tracking Number (e.g., `T-2026-0001`) and a randomized 40-character token. It also uses the `QrCode` facade to generate an SVG QR Code (around **Line 88**) and saves the ticket as `pending`. An email is then dispatched via the `TicketConfirmation` Mail class.
3. **Kiosk Check-In:** When the citizen arrives at the office, they scan their QR code at the Kiosk. This sends a `POST` request to `/api/v1/tickets/scan`.
4. **Queue Assignment (`TicketController.php`):** The `scanCheckIn` method (around **Line 607**) verifies the QR token. If valid, it assigns them a `queue_number` starting at 101 for the day, and changes their `queue_status` to `waiting` (around **Line 666**). They now appear on the staff's `LobbyQueue.jsx` dashboard screen.
5. **Document Attachment (Staff):** The staff searches the master registry for the citizen's record and links it to the ticket via a `PATCH` request to `/api/v1/tickets/{id}/attach`.
6. **Syncing Issuances (`TicketController.php`):** The `attachDocument` method (around **Line 460**) changes the ticket status to `ready_for_pickup`. Crucially, it triggers the `syncIssuanceWithTicket` method (at **Line 531**), which automatically generates a new record in the `issuances` table (the master registry), merging the citizen's form inputs with the stored OCR data.
7. **Final Issuance:** Once the physical document is printed and handed to the citizen, the staff clicks "Issue". This hits the `issueDocument` method (around **Line 690**), permanently marking the ticket as `completed` and removing them from the lobby.

---

## 4. Authentication & Security (Login Flow)
If the panelists ask about how user login works and how passwords are secured, explain this flow:

1. **The Login Request:** The user types their email and password in React. This sends a `POST` request to `/api/login`.
2. **The Controller (`AuthController.php`):** The request is routed to the `login` method (around **Line 15**).
3. **Password Encryption & Verification:** 
    * We NEVER store plain-text passwords in the database. When a user is created, their password is encrypted using Laravel's **Bcrypt** hashing algorithm (via the `Hash::make()` facade). Bcrypt is an industry-standard, one-way hash that includes a "salt" to protect against rainbow table attacks.
    * During login, at **Line 31** (`Hash::check($request->input('password'), $user->password)`), the system takes the plain-text input, runs it through the Bcrypt algorithm, and compares the resulting hash against the hash stored in the database. 
4. **Session Management:**
    * If the password matches, we do NOT use vulnerable JWT tokens that are exposed in the browser's LocalStorage.
    * Instead, at **Line 39**, we use Laravel's secure session manager: `$request->session()->put('user_id', $user->id);`.
    * This creates a secure, **HTTP-only cookie** on the user's browser. HTTP-only means malicious JavaScript (XSS attacks) cannot steal the login session. 
    * For every subsequent request, Laravel automatically reads this cookie to verify the user's identity via the `session` endpoint (Line 50).
