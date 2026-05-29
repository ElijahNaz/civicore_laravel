# Resources Directory (`resources/`) Overview

The `resources` directory is entirely dedicated to your **frontend user interface**. Because you chose to build CiviCORE as a modern Single Page Application (SPA), this folder contains all your React JavaScript code, styling, and base views.

Here is a breakdown of the folder structure and a file-by-file explanation of your core React components.

---

## 1. Base Structure

*   **`resources/views/`**
    *   **`index.blade.php`**: This is the single HTML file that Laravel actually sends to the browser. It is almost completely empty except for a `<div id="root"></div>` tag. This file serves as the "empty canvas" where your entire React application is drawn.
*   **`resources/css/`**
    *   **`app.css` / `index.css`**: The main CSS file where TailwindCSS is injected. You also likely have your custom `.glass-panel` or custom animations defined here.
*   **`resources/js/`**
    *   **`app.jsx`** (or `index.jsx`): The main entry point of your React app. It grabs the `<div id="root">` from the Blade file and tells React to start rendering your components inside it.

---

## 2. React Components (`resources/js/components/`)
This is the most critical folder for the frontend. Every file here represents a visual block or a page in your application.

### A. Core Layout & Context
*   **`Layout.jsx`**: The main wrapper for the admin dashboard. It contains your sidebar navigation, top header, and decides where to render the child pages.
*   **`PublicLayout.jsx`**: A wrapper specifically for the public-facing pages (like the citizen tracking portal) that removes the admin sidebar.
*   **`DataContext.jsx`**: Extremely important. This uses React Context API to hold global data (like the logged-in user's details, the list of barangays, and system settings) so that you don't have to pass data down manually to every single component.
*   **`ModalContext.jsx`**: Manages which global popups are currently visible on the screen.

### B. Main Pages & The Component Flow
To explain the React architecture to the panel, you should trace the flow of a single document through your components:

1.  **`Documents.jsx` (The Upload):** This is the main archive page. When a staff member uploads a PDF, this component executes the `fetch` API call that sends the file to the Laravel `/api/documents/upload` endpoint. It then starts "polling" (constantly checking) the server to see if the Gemini AI is finished.
2.  **`OcrFormPanel.jsx` (The Verification):** Once `Documents.jsx` sees the AI is done, it slides open this massive, interactive side-panel. It renders the original scanned image on the left, and dynamically renders the appropriate sub-form on the right (e.g., `BirthForm.jsx`, `DeathForm.jsx`, or `MarriageForm.jsx`). 
3.  **`Mapping.jsx` (The Fuzzy Logic Corrector):** This is a silent, "headless" component that doesn't render visuals. Instead, when the user clicks "Save" in the `OcrFormPanel`, the data is first passed through `Mapping.jsx`. This script runs a **Levenshtein Distance** algorithm (a mathematical formula measuring the difference between two strings). If Gemini extracted a misspelled barangay, `Mapping.jsx` snaps it to the closest valid database string.
4.  **`Issuances.jsx` (The Final Destination):** Once saved, the staff navigates to this component, which manages the table of final, verified records. From here, they can trigger PDF generation or printing.

### C. Public Queueing System Components
*   **`Ticketing.jsx` & `LobbyQueue.jsx`:** The public-facing portal where citizens request documents, and the staff dashboard showing real-time queue updates.
*   **`PendingRequests.jsx`:** The digital inbox where staff attach citizen requests to the finalized OCR records.

### D. Utility Modals & Security Overlays
*   **`ActionConfirmModal.jsx` & `PasswordConfirmModal.jsx`:** These use **React Portals** to break out of the standard DOM hierarchy and overlay the entire screen. They require the staff to re-enter their password for highly sensitive actions (like deleting an official registry record).
*   **`AlertModal.jsx` & `SaveToasts.jsx`:** Provides visual, non-intrusive feedback (e.g., "Saved Successfully") to improve the User Experience (UX).
*   **`CameraModal.jsx`:** Interfaces with the browser's `navigator.mediaDevices` API to activate the user's webcam for live document scanning.

### D. Utilities & UI Polish
*   **`AnimatedCounter.jsx`**: A small component that makes numbers count up smoothly (used on the Dashboard).
*   **`Avatar.jsx` & `AvatarLibrary.js`**: Manages user profile pictures.
*   **`LoadingSpinner.jsx` & `SkeletonLoader.jsx`**: Visual indicators shown when data is being fetched from the Laravel API, improving perceived performance.
*   **`SaveToasts.jsx`**: The small notification bubbles that pop up in the corner of the screen when an action completes.
*   **`PageTransition.jsx`**: Wraps pages in animation logic so they fade or slide in smoothly when navigating.

### E. `forms/` Directory
*   This folder contains the specific, heavily customized input forms tailored for the complex fields of a Birth Certificate, Death Certificate, or Marriage Contract. Separating these keeps `OcrFormPanel.jsx` from becoming ten thousand lines of code.

---

### *Defense Tip for `resources/`:*
If panelists ask why you chose React over standard Laravel Blade, you should answer: **"We chose React to create a Single Page Application (SPA). Because our system relies heavily on complex, interactive features—like the side-by-side OCR form panel and live queue updates—React allows the interface to update instantly without the page ever needing to reload, providing a much smoother, desktop-like experience for the staff."**
