# OcrFormPanel.jsx

**File Path:** `resources\js\components\OcrFormPanel.jsx`
**Language Used:** JavaScript (React / JSX)

## Purpose & Strategy
This is the **Crown Jewel** of the frontend UI. It is the massive interactive sliding panel where staff verify the AI's work before saving it permanently.

### Key Defense Talking Points:
1.  **Side-by-Side Verification UI:**
    *   The strategy here was to prioritize **User Experience (UX)**. Instead of forcing staff to look at a physical paper and type on a screen, the component renders the scanned PDF/Image on the left half, and the extracted AI data forms on the right half.
2.  **Dynamic Component Rendering:**
    *   Rather than creating one massive 5000-line form, this panel dynamically reads the document `type` (birth, death, marriage).
    *   If it's a birth certificate, it dynamically injects `<BirthForm />`. If it's marriage, it injects `<MarriageForm />`. This keeps the React codebase extremely modular and easy to maintain.
3.  **Draft Caching (`localStorage`):**
    *   To prevent staff from losing their work if they accidentally refresh the page, this component heavily utilizes browser `localStorage` to save drafts of their edits in real-time.
4.  **Transaction Locks & Modals:**
    *   It imports `ActionConfirmModal.jsx` (which uses React Portals) to intercept the "Save" button, forcing a final check to prevent accidental double-saving or duplicate records.

---
*This file is part of the CiviCORE system architecture.*