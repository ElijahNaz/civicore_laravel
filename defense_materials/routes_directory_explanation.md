# Routes Directory (`routes/`) Overview

The `routes` folder acts as the "switchboard operator" or the "traffic controller" of your application. Whenever a user types a URL in their browser or the React frontend makes a fetch request (like getting data or saving a form), the request arrives here first. The route files determine which URL goes to which Controller.

Here is the file-by-file breakdown:

---

## 1. `routes/api.php`
*   **What it does:** This is the most important routing file in your CiviCORE project. Because your frontend is built with React, React communicates with Laravel exclusively through these "API endpoints" (URLs starting with `/api/`).
*   **A Tour of the Routes (with Line Numbers):**
    *   **Public APIs (Lines 31-45):** These routes do not require a login. For example, `Route::post('/v1/tickets', [TicketController::class, 'store'])` at **Line 42** handles citizens submitting online requests.
    *   **Authentication (Lines 49-51):** `Route::post('/login', [AuthController::class, 'login'])` at **Line 50** handles the login logic.
    *   **Protected Routes (Line 54):** At **Line 54**, you use `Route::middleware('auth.session')->group(...)`. This is a massive security feature. It locks down every route inside it (like viewing documents or issuances) so that if a hacker tries to guess the URL without an active server session, Laravel rejects them automatically.
    *   **The OCR Trigger (Line 78):** `Route::post('/documents/upload', [DocumentController::class, 'upload'])` is the critical endpoint where React sends the scanned image to start the Gemini AI process.
    *   **Role-Based Access Control (RBAC) (Lines 131 & 149):** You layered your security beautifully here. At **Line 131**, you have `Route::middleware('admin')` to ensure only Admins can purge documents or edit templates. Even deeper, at **Line 149**, you have `Route::middleware('superadmin')` wrapped around user creation routes, ensuring only the highest authority can create new staff accounts.
*   **Why it's important:** It is the absolute gatekeeper of your system. It enforces security, manages user sessions, and directs traffic to the correct Controller logic.

---

## 2. `routes/web.php`
*   **What it does:** Traditionally, this file handles standard webpage routes returning HTML views. However, because CiviCORE uses React as a Single Page Application (SPA), this file is very short.
*   **Inside this file:** It usually contains a "catch-all" route. For example: `Route::get('/{any}', ...)->where('any', '.*')`. 
*   **Why it's important:** This catch-all route tells Laravel: "No matter what URL the user types (like `/dashboard` or `/tickets`), don't look for a backend page. Instead, just return the single `index.blade.php` file, and let React handle the routing from there." This is how React Router is able to work seamlessly inside Laravel.

---

## 3. `routes/console.php`
*   **What it does:** This file is used to define custom console commands (commands you type in the terminal using `php artisan`). You can also use it to define scheduled tasks (Cron jobs).
*   **Inside this file:** By default, it might just contain an `artisan inspire` command which returns a random quote. But in a massive system, you might add a schedule here to "automatically delete temporary OCR files every midnight."
*   **Why it's important:** It allows developers to create background maintenance scripts that can be triggered from the terminal or run automatically on a server schedule without needing a web browser.
