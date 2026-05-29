# api.php

**File Path:** `routes\api.php`
**Language Used:** PHP (Laravel)

## Purpose & Strategy
This is the **Gatekeeper and Switchboard** of your backend. Because your frontend uses React, it communicates with Laravel exclusively through the API endpoints defined in this file.

### Key Defense Talking Points:
1.  **Strict Separation:**
    *   Unlike traditional older websites, CiviCORE does not load HTML pages from the server. Instead, React handles all the visuals, and this file (`api.php`) acts strictly as a data provider (sending and receiving JSON).
2.  **Role-Based Access Control (RBAC) & Middleware:**
    *   This file demonstrates deep security layering.
    *   Routes are wrapped inside `Route::middleware('auth.session')`. This prevents unauthorized users from accessing sensitive endpoints (like viewing documents) without a valid, server-side session.
    *   Furthermore, specific routes are wrapped in `Route::middleware('admin')` and `Route::middleware('superadmin')`, ensuring that only top-level users can trigger account creation or document purging.
3.  **The OCR Gateway:**
    *   `Route::post('/documents/upload', [DocumentController::class, 'upload'])` is the critical endpoint defined here that bridges the user's uploaded file from the React UI to the Laravel backend so the background job can begin processing it via Python.

---
*This file is part of the CiviCORE system architecture.*