# CiviCORE OCR Architecture & Technology Stack

This document breaks down the entire technology stack used in the CiviCORE application specifically for the Optical Character Recognition (OCR) pipeline. It covers the journey of a document from the user's browser, through the PHP/Laravel backend, into the Python background server, and back.

---

## 1. Frontend: The User Interface (React + Vite)
The frontend is responsible for providing a smooth, animated user experience for uploading and previewing documents.

**Core Technologies:**
*   **React 19 (`react`, `react-dom`)**: The foundational JavaScript library used to build the interactive user interface (components like the Document Viewer Modal and Upload screens).
*   **Vite (`vite`, `laravel-vite-plugin`)**: The lightning-fast build tool and development server that bundles the React code and connects it directly to Laravel.
*   **Tailwind CSS v4 (`tailwindcss`)**: The utility-first CSS framework used for styling the entire application (glassmorphism effects, layouts, responsive design).

**Key Libraries for OCR Flow:**
*   **`react-dropzone`**: A specialized React component used to create the drag-and-drop file upload areas. It handles file selection and initial validation in the browser before sending it to the server.
*   **`framer-motion`**: Used for the smooth micro-animations, transitions, and loading spinners while the user waits for the OCR to process.
*   **`axios`**: The HTTP client used by React to securely send the uploaded files via POST requests to the Laravel API.

---

## 2. Backend: The Application Logic & Queues (PHP + Laravel)
Laravel acts as the "Traffic Cop." It receives the file from React, saves it, and orchestrates the background processing so the user's browser doesn't freeze.

**Core Technologies:**
*   **PHP 8.2+**: The server-side programming language.
*   **Laravel 12 (`laravel/framework`)**: The robust PHP framework that handles routing, database connections, and business logic.

**Key Components for OCR Flow:**
*   **Laravel Queues (`Illuminate\Contracts\Queue\ShouldQueue`)**: Instead of processing the OCR instantly (which could take a long time), Laravel puts the task into a background queue. The `ProcessImageOcrJob.php` file handles this.
*   **`WithoutOverlapping` Middleware**: A lock system applied to the Queue Job. It forces the queue workers to process Gemini API requests one at a time (in a single-file line) to strictly obey the Google API rate limits (15 RPM).
*   **Laravel HTTP Client (`Illuminate\Support\Facades\Http`)**: Used inside the Queue Job to send the image from the Laravel PHP server over to the separate Python FastAPI server.
*   **`barryvdh/laravel-dompdf`**: A Laravel library used to take the extracted OCR data and generate a clean, downloadable PDF report.

---

## 3. The OCR Engine: AI & Image Processing (Python)
Because Python has the best ecosystem for Artificial Intelligence and Computer Vision, a dedicated, persistent Python server handles the heavy lifting of reading the documents.

**Core Technologies:**
*   **FastAPI & Uvicorn**: A modern, high-performance web framework for building APIs in Python. It listens on `http://127.0.0.1:8080/ocr/gemini` and waits for Laravel to send it images.
*   **Google GenAI SDK (`google-genai`)**: The official Google library used to communicate with the **Gemini 1.5 Flash** AI model. This is the primary engine that visually "reads" the document and returns a structured JSON payload of all the civil registry data.

**Image Processing & Fallback Libraries:**
*   **Pillow (`PIL`)**: The standard Python image library. It is used to automatically resize and downscale massive uploaded images to a maximum of 1024px before sending them to Gemini. This drastically reduces API token costs.
*   **OpenCV (`cv2`) & NumPy (`numpy`)**: Advanced computer vision libraries. In this project, they are used to specifically target, crop, and "binarize" (extract ink from background paper) the physical signatures on the documents, turning them into transparent PNGs.
*   **PyMuPDF (`fitz`)**: If the user uploads a multi-page PDF instead of an image, this library cleanly converts the PDF pages into image arrays so the OCR engines can read them.
*   **PyTesseract & EasyOCR**: Traditional, non-AI OCR engines built into the script. They act as a fallback. If the Gemini API fails or runs out of quota, the Python server can use these older engines to attempt to read the text.

---

## Summary of the Data Flow
1. **React** (`react-dropzone`) captures the scanned birth certificate from the user and sends it via **Axios**.
2. **Laravel** receives the file, saves it to the `storage` folder, and dispatches a **Queue Job** (`ProcessImageOcrJob`).
3. The Laravel **Queue Worker** picks up the job, applies the `WithoutOverlapping` lock, and makes an HTTP POST request to the Python server.
4. **FastAPI** (Python) receives the image. It uses **Pillow** to optimize the size, and **OpenCV** to extract the signatures.
5. Python sends the optimized image to **Gemini 1.5 Flash** with a strict prompt asking for JSON output.
6. Python parses the JSON, adds the cropped signatures, and returns everything to Laravel.
7. Laravel saves the structured data to the MySQL database.
8. The React frontend fetches the updated database row and displays the fully digitized document to the user!
