# Mapping.jsx

**File Path:** `resources\js\components\Mapping.jsx`
**Language Used:** JavaScript (React)

## Purpose & Strategy
This is a "Headless Component" (a script that runs logic without rendering any visible UI). It is responsible for the **Fuzzy Logic Auto-Correction** of data extracted by the Gemini AI.

### Key Defense Talking Points:
1.  **The Problem with AI:**
    *   Sometimes Gemini AI misreads blurry text. For example, it might read the Barangay "San Jose" as "S4n Jos3" or "Bgy San Jse".
    *   If you saved "S4n Jos3" to the database, your data analytics and search functions would completely break.
2.  **The Levenshtein Distance Algorithm:**
    *   This component intercepts the save request from the `OcrFormPanel`.
    *   It takes the AI's extracted barangay string and compares it against the strict list of valid barangays fetched from the database (`DataContext`).
    *   It uses a mathematical formula called **Levenshtein Distance** to calculate how many "edits" (insertions, deletions, or substitutions) are required to change the AI string into a valid string.
    *   It automatically snaps to the closest match (e.g., "S4n Jos3" -> "San Jose").
3.  **Silent Correction:**
    *   This happens in milliseconds entirely on the frontend (client-side) before the final HTTP POST request is sent to the Laravel Controller, saving valuable server bandwidth.

---
*This file is part of the CiviCORE system architecture.*