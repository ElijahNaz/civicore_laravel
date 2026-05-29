# Bootstrap and Config Directories Overview

These two folders (`bootstrap/` and `config/`) are responsible for setting up the environment and dictating how your application behaves before any user request is even processed. While you rarely need to edit the files in `bootstrap`, the `config` folder is where you define the major settings of your system.

Here is the file-by-file breakdown for your defense.

---

## 1. The `bootstrap/` Directory
Think of this directory as the "ignition switch" or the "starter motor" of your application. When a request comes into your server, this is the very first code that runs to wake the system up.

*   **`app.php`**
    *   **What it does:** This is the main bootstrapping file (especially critical in Laravel 11). It initializes the application instance, registers core routing files (`web.php`, `api.php`), configures global middleware (like CSRF protection or CORS), and sets up exception handling.
    *   **Why it's important:** Without this file, the framework cannot start. If you ever need to add a global middleware that runs on *every single request*, you configure it here.
*   **`providers.php`**
    *   **What it does:** Returns an array of service providers that should be loaded automatically by the framework.
    *   **Why it's important:** Service providers are the central place where your application is bootstrapped (where services are bound to the container). This file tells Laravel which providers to wake up.
*   **`cache/` (Folder)**
    *   **What it does:** Contains framework-generated files (like `packages.php` and `services.php`) that Laravel creates automatically to optimize performance. 
    *   **Why it's important:** Instead of reading massive configuration files from scratch every time a user loads a page, Laravel caches the results here. This makes your application run significantly faster. **Note:** You should never manually edit files inside this cache folder; they are auto-generated.

---

## 2. The `config/` Directory
This directory contains all the configuration files for your application. It acts as the "control panel" where you adjust settings for database connections, email servers, caching mechanisms, and more. Most of these files pull values from your hidden `.env` file for security.

*   **`app.php`**
    *   **What it does:** Contains general application settings like the timezone (e.g., `Asia/Manila`), the application environment (`local` vs `production`), application name, and the "key" used for encryption.
    *   **Why it's important:** The encryption key configured here is what keeps your user sessions and passwords secure. The timezone setting ensures that when you save an issuance, the `created_at` timestamp reflects Philippine time, not server default time.
*   **`auth.php`**
    *   **What it does:** Configures the authentication guards and providers. It tells Laravel how users should be logged in (e.g., via session cookies) and which database table holds the user accounts (`users` table).
    *   **Why it's important:** It is the backbone of your login system. Without it, the application wouldn't know how to verify if an admin is actually an admin.
*   **`cache.php`**
    *   **What it does:** Configures how the system caches data to improve speed. It defines whether cache should be saved as files, in a database, or using an in-memory tool like Redis.
    *   **Why it's important:** Proper caching prevents your server from crashing under heavy load. For CiviCORE, it dictates where temporary data is stored quickly.
*   **`cors.php`**
    *   **What it does:** Cross-Origin Resource Sharing (CORS) settings. It determines which external websites or domains are allowed to talk to your Laravel backend.
    *   **Why it's important:** This is a crucial security feature. Since your frontend (React/Vite) and backend (Laravel/Python OCR) might run on different ports during development or production, CORS rules dictate whether they are allowed to share data.
*   **`database.php`**
    *   **What it does:** Contains the connection settings for your MySQL database (hostname, port, database name, username, password).
    *   **Why it's important:** This is the bridge to your actual data. If this file is misconfigured, the entire system goes down with a "Database Connection Error".
*   **`filesystems.php`**
    *   **What it does:** Configures your storage "disks". It defines where uploaded files (like scanned PDFs or generated certificates) should be saved—whether locally on the server's hard drive or on cloud storage like Amazon S3.
    *   **Why it's important:** Your system heavily relies on archiving documents. This file ensures that when an OCR image is uploaded or a PDF is generated, it lands safely in the `storage/app/public` folder.
*   **`logging.php`**
    *   **What it does:** Configures how and where error messages are saved. By default, it saves them to `storage/logs/laravel.log`.
    *   **Why it's important:** If the system crashes or encounters a 500 Server Error (like the OCR issue you recently fixed), this config determines where the error details are written so you can fix them.
*   **`mail.php`**
    *   **What it does:** Configures your email sending service (SMTP details, Mailtrap, or Gmail configurations).
    *   **Why it's important:** Powers your ticket confirmation emails and verification codes. If this isn't set up correctly, citizens won't receive their tracking numbers.
*   **`queue.php`**
    *   **What it does:** Configures background job queues. It tells Laravel how to handle tasks that take too long (like OCR processing).
    *   **Why it's important:** Crucial for user experience. Because OCR takes time, this config allows the system to process the document in the background without freezing the user's browser.
*   **`services.php`**
    *   **What it does:** Stores credentials for third-party services (e.g., Stripe, Mailgun, or AWS).
    *   **Why it's important:** Provides a safe, centralized place to store API keys for external integrations so they aren't hardcoded randomly throughout the system.
*   **`session.php`**
    *   **What it does:** Configures how user sessions are stored (in files, cookies, or the database) and how long a user can remain idle before being automatically logged out.
    *   **Why it's important:** Essential for security. It controls the "Remember Me" functionality and ensures that inactive admin sessions expire properly to prevent unauthorized access.
