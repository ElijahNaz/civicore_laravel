# Implementation Plan - Civil Registry Document Processing Upgrades (Phase 3)

This phase implements a premium, GCash-style mobile camera scanner interface, integrates client-side resolution optimization, and unifies the document scanning logic between the Document Uploads and Scan-to-Search systems.

## User Review Required

> [!IMPORTANT]
> **Automatic Warp/Crop Confirmation Bypass:** If the edge scanner detects high-confidence corners (`stabilityScore >= 0.9` and good lighting), we will automatically crop, warp, and scale the image down to `1024px` maximum dimension before submitting, bypassing manual adjustment to maximize efficiency.
> **Auto-Capture:** Should we enable automatic capture once framing and stability have been held green for more than 1.5 seconds, or keep it manual? We will default to a responsive manual button that turns green to let the user control the capture point, with an option to auto-trigger.

## Proposed Changes

### Component 1: Client-Side Token Cost Downscaling

#### [MODIFY] [uploadPreprocess.js](file:///c:/laragon/www/civicore_laravel/resources/js/utils/uploadPreprocess.js)
- Update scaling limits to downscale all images to a maximum of `1024px` on their longest edge (from 1600px).
- This ensures all camera-captured and manually uploaded documents fit within Gemini's 2-tile limit (516 tokens cost) for substantial paid API token savings.

---

### Component 2: Camera Modal (GCash-Style Edge & Light Scanner)

#### [MODIFY] [CameraModal.jsx](file:///c:/laragon/www/civicore_laravel/resources/js/components/CameraModal.jsx)
- **UI Simplification**:
  - Remove left-side "Scanner Tips" panel and right-side "Live Metrics" panel on desktop screens to provide a clean, focused, full-screen viewport.
  - Wrap control buttons in sleek glassmorphic overlays.
- **Light Level Detection**:
  - Sample frames from the video stream to analyze pixel brightness.
  - Display helpful warnings if it's too dark (average brightness < 50) or too bright (average brightness > 200).
- **Dynamic Colored Framing Border**:
  - Draw a dynamic framing border overlay around detected document boundaries.
  - Border turns **green** when edges are stable, lighting is good, and document is framed correctly.
  - Border turns **amber/red** with descriptive assistant prompts (e.g., "Hold steady...", "Too dark - add light", "Move closer", "Align document inside frame") when scanning.
- **Client-Side Perspective Warp & crop confirmation**:
  - Apply the warp perspective transformation automatically using OpenCV upon capture.

---

### Component 3: Scan-to-Search Unification

#### [MODIFY] [Issuances.jsx](file:///c:/laragon/www/civicore_laravel/resources/js/components/Issuances.jsx)
- Import and reuse `CameraModal` within the "Scan to Search" modal.
- Replace the legacy raw HTML `<video>` rendering and basic `getUserMedia` camera code with the unified `CameraModal`.
- On successful capture, warp the image, run OCR against the search server (`/api/issuances/ocr-search`), and execute the search.

---

## Verification Plan

### Automated/Manual Testing
- Open the **Upload Document** section and click **Use Device Camera**.
- Verify that the camera opens in a clean, full-screen viewport with helper text overlays.
- Test under low-light conditions; verify the assistant displays "Too dark - add light" and the framing border turns amber/red.
- Verify the frame turns green under stable conditions and good lighting.
- Confirm capture and verify that the document is warped and correctly downscaled to `1024px` before uploading.
- Repeat the test in the **Issuances -> Scan to Search** modal to ensure unification works seamlessly.
