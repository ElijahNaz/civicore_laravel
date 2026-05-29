# Application Directory (`app/`) Overview

The `app` folder is the heart of your Laravel backend. It contains the core logic of the system, including how requests are handled (Controllers), how data is structured (Models), background tasks (Jobs), emails (Mail), and reusable logic (Services). 

Here is a detailed, file-by-file breakdown of everything inside the `app/` directory to help you ace your defense tomorrow.

---

## 1. `app/Http/Controllers/`
Controllers act as the "middleman" between your frontend (React) and your database. When a user clicks a button or loads a page, a route sends that request to a specific controller function to process it.

*   **`ActivityLogController.php`**
    *   **What it does:** Fetches the history of user actions (like who printed a certificate or who deleted a file).
    *   **Importance:** Essential for system auditing and accountability, allowing admins to track what users are doing inside the system.
*   **`AnnouncementController.php`**
    *   **What it does:** Manages the creation, updating, deletion, and fetching of announcements/bulletins.
    *   **Importance:** Powers the announcement board on the dashboard, keeping users informed about system updates or office news.
*   **`AuthController.php`**
    *   **What it does:** Handles user login, logout, and session management.
    *   **Importance:** Critical for security. It verifies usernames and passwords and ensures that only authorized personnel can access the system.
*   **`BarangayController.php`**
    *   **What it does:** Manages the list of barangays (fetching, adding, editing).
    *   **Importance:** Used in dropdowns and forms throughout the system to standardize the input of addresses.
*   **`Controller.php`**
    *   **What it does:** The base controller class provided by Laravel.
    *   **Importance:** All other controllers extend this file. It provides foundational methods used by the entire controller system.
*   **`DashboardController.php`**
    *   **What it does:** Calculates and gathers the statistics shown on the main dashboard (e.g., total issuances, pending tickets, recent activities).
    *   **Importance:** Gives the users a quick, high-level summary of the system's current state as soon as they log in.
*   **`DocumentController.php`**
    *   **What it does:** Handles the uploading, archiving, retrieving, and deletion of scanned documents.
    *   **Importance:** This is the core of the digital archiving feature. It manages where physical files are stored digitally and links them to database records.
*   **`IssuanceController.php`**
    *   **What it does:** Manages civil registry issuances (Birth, Marriage, Death certificates). It handles saving extracted OCR data, updating records, generating PDF certificates, and managing print approvals.
    *   **Importance:** This is arguably the most important file for the core business logic of generating and issuing certificates.
*   **`OcrController.php`**
    *   **What it does:** Receives uploaded images and sends them to the Python OCR server for text extraction, then returns the result to the frontend.
    *   **Importance:** Bridges the gap between the Laravel web app and the Python Artificial Intelligence/OCR engine, enabling the automatic reading of scanned documents.
*   **`PublicController.php`**
    *   **What it does:** Handles routes that don't require the user to be logged in, such as a public tracker for requests.
    *   **Importance:** Allows citizens to track their ticket status without needing an internal staff account.
*   **`SettingController.php`**
    *   **What it does:** Manages global system settings (e.g., system name, logo, or specific OCR configurations).
    *   **Importance:** Allows administrators to customize the system without changing the code.
*   **`TemplateController.php`**
    *   **What it does:** Manages the templates used for printing different types of certificates.
    *   **Importance:** Ensures that when data is overlaid onto a certificate, it maps to the correct X and Y coordinates.
*   **`TicketController.php`**
    *   **What it does:** Manages public ticketing requests (creation, status updates, approvals, and rejections).
    *   **Importance:** Powers the online request system, allowing citizens to request documents remotely and staff to process those requests.
*   **`UserController.php`**
    *   **What it does:** Manages staff accounts (creating users, resetting passwords, changing roles).
    *   **Importance:** Used by the Super Admin to control who has access to the system and what permissions they hold.
*   **`VerificationController.php`**
    *   **What it does:** Handles security verifications, like generating and verifying OTPs (One Time Passwords) sent via email.
    *   **Importance:** Adds an extra layer of security (2FA/Email verification) for sensitive actions or logins.

---

## 2. `app/Http/Middleware/`
Middleware acts as a filter for HTTP requests entering your application. They run *before* the request hits the Controller to verify if the request is allowed.

*   **`AdminRoleMiddleware.php`**
    *   **What it does:** Checks if the currently logged-in user has an "Admin" role.
    *   **Importance:** Prevents regular staff members from accessing admin-only routes (like user management).
*   **`RequireSessionAuth.php`**
    *   **What it does:** Checks if a user has an active, valid login session.
    *   **Importance:** Protects the entire internal system from unauthorized access. If a user isn't logged in, they get redirected to the login page.
*   **`SuperAdminRoleMiddleware.php`**
    *   **What it does:** Checks if the user is the ultimate "Super Admin".
    *   **Importance:** Protects the highest-level settings and destructive actions from even regular Admins.

---

## 3. `app/Jobs/`
Jobs are tasks that are pushed to the background (queues) so they don't freeze the user's screen while loading.

*   **`ProcessDocumentOcr.php`**
    *   **What it does:** Handles the OCR extraction of large, multi-page PDF documents in the background.
    *   **Importance:** Prevents the browser from timing out or freezing when the system is reading a massive 50-page document.
*   **`ProcessImageOcrJob.php`**
    *   **What it does:** Similar to the above, but specifically optimized for processing single or batch image files via the OCR engine.
    *   **Importance:** Ensures smooth user experience by offloading heavy AI processing tasks.

---

## 4. `app/Mail/`
Mailable classes represent emails sent by the system. They connect data to the email templates.

*   **`TicketConfirmation.php`**
    *   **What it does:** Sends an email to a citizen confirming that their online request (ticket) has been received.
    *   **Importance:** Provides citizens with a reference number and assurance that the office is working on their request.
*   **`TicketDeclinedMail.php`**
    *   **What it does:** Sends an email notifying a citizen that their request was rejected, along with the reason.
    *   **Importance:** Keeps the citizen informed and handles the rejection workflow professionally.
*   **`VerificationCodeMail.php`**
    *   **What it does:** Sends a 6-digit OTP code to a user's email address.
    *   **Importance:** Core component of the 2-Factor Authentication or password reset process.

---

## 5. `app/Models/`
Models represent the "blueprint" of your database tables. They allow the Laravel code to easily read, insert, update, and delete rows in the database.

*   **`ActivityLog.php`** maps to the `activity_logs` table (tracks user actions).
*   **`Announcement.php`** maps to the `announcements` table (bulletin board posts).
*   **`Document.php`** maps to the `documents` table (the master list of archived files).
*   **`DocumentHistoryLog.php`** maps to the `document_history_logs` table (tracks who edited a specific document).
*   **`DocumentOcrPage.php`** maps to the `document_ocr_pages` table (stores text extracted from individual pages of a large document).
*   **`Issuance.php`** maps to the `issuances` table (the actual civil registry records: birth, death, marriage).
*   **`Setting.php`** maps to the `settings` table (stores key-value pairs for system config).
*   **`Ticket.php`** maps to the `tickets` table (online public requests).
*   **`User.php`** maps to the `users` table (system staff/admin accounts).
*   **`VerificationCode.php`** maps to the `verification_codes` table (temporary storage for OTPs).

*Why are Models important?* Without them, you would have to write complex, raw SQL queries for every single database operation. Models make database interactions object-oriented, clean, and secure.

---

## 6. `app/Providers/`
Providers are the central place where the application is bootstrapped (started up).

*   **`AppServiceProvider.php`**
    *   **What it does:** Registers global configurations when the application boots up (e.g., setting default database string lengths, registering custom services, or sharing data with all views).
    *   **Importance:** It is the starting point of the Laravel application lifecycle.

---

## 7. `app/Services/`
Services hold complex "business logic" that doesn't belong in a Controller. This keeps Controllers clean and readable.

*   **`OcrParserService.php`**
    *   **What it does:** Takes the raw, messy text outputted by the Python OCR and uses regular expressions (regex) or logic to format it cleanly into fields like `First Name`, `Last Name`, `Registry Number`.
    *   **Importance:** Raw OCR just spits out blocks of text. This service is the "brain" that figures out which text is a name and which text is a date.
*   **`TemplateConfigService.php`**
    *   **What it does:** Stores and retrieves the exact X and Y coordinates for where text should be printed on blank civil registry forms.
    *   **Importance:** Ensures that when you print a Birth Certificate, the name actually lands on the "Name" line of the physical paper instead of floating off the page.
