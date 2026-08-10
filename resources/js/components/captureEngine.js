const CAPTURE_PROFILES = {
    desktop: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: 'user',
        aspectRatio: { ideal: 16 / 9 }
    },
    mobile: {
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        frameRate: { ideal: 24 },
        facingMode: 'environment',
        aspectRatio: { ideal: 9 / 16 }
    }
};

const sortPoints = (pts) => {
    const sorted = [...pts].sort((a, b) => a.y - b.y);
    const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
    return { tl: top[0], tr: top[1], br: bottom[1], bl: bottom[0] };
};

export const detectCaptureEnvironment = () => {
    if (typeof window === 'undefined') return 'desktop';

    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
    const narrowViewport = window.matchMedia?.('(max-width: 1024px)')?.matches;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator?.userAgent || '');

    return coarsePointer || narrowViewport || mobileUA ? 'mobile' : 'desktop';
};

export const createCaptureEngine = () => {
    const environment = detectCaptureEnvironment();
    const profile = CAPTURE_PROFILES[environment];
    let activeStream = null;
    let lastFacingMode = profile.facingMode;

    const stop = () => {
        if (activeStream) {
            activeStream.getTracks().forEach((track) => track.stop());
            activeStream = null;
        }
    };

    const startPreview = async ({ videoElement, facingMode } = {}) => {
        stop();
        lastFacingMode = facingMode || lastFacingMode || profile.facingMode;

        const baseVideoConstraints = {
            width: profile.width,
            height: profile.height,
            frameRate: profile.frameRate,
            aspectRatio: profile.aspectRatio
        };
        const constraints = {
            video: {
                ...baseVideoConstraints,
                facingMode: { ideal: lastFacingMode }
            }
        };
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            console.warn("Primary camera constraints failed, attempting fallback:", error);
            try {
                // Fallback 1: Try without rigid resolution, aspect ratio, or framerate constraints (just ideal facingMode)
                const fallbackConstraints = {
                    video: {
                        facingMode: { ideal: lastFacingMode }
                    }
                };
                stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            } catch (fallbackError) {
                console.warn("Secondary camera constraints failed, attempting absolute minimal:", fallbackError);
                try {
                    // Fallback 2: Absolute minimal, just any video
                    const minimalConstraints = { video: true };
                    stream = await navigator.mediaDevices.getUserMedia(minimalConstraints);
                } catch (minimalError) {
                    console.error("All camera initialization attempts failed:", minimalError);
                    throw minimalError;
                }
            }
        }
        activeStream = stream;

        if (videoElement) {
            videoElement.srcObject = stream;
            videoElement.play().catch(e => console.warn("Engine video play failed:", e));
        }

        return stream;
    };

    const detectEdges = ({ videoElement } = {}) => {
        const cv = window.cv;
        if (!videoElement || videoElement.readyState < 2 || !videoElement.videoWidth || !videoElement.videoHeight || videoElement.videoWidth < 10 || videoElement.videoHeight < 10 || videoElement.paused || videoElement.ended) {
            return null;
        }

        // OpenCV-powered edge & contour detection
        if (cv && cv.Mat) {
            let src = null;
            let resized = null;
            let gray = null;
            let blurred = null;
            let edged = null;
            let contours = null;
            let hierarchy = null;
            let bestPts = null;

            try {
                src = cv.imread(videoElement);
                resized = new cv.Mat();
                const targetW = 400;
                const targetH = Math.round((400 / videoElement.videoWidth) * videoElement.videoHeight);
                const dsize = new cv.Size(targetW, targetH);
                if (dsize.width <= 0 || dsize.height <= 0) return null;

                cv.resize(src, resized, dsize, 0, 0, cv.INTER_AREA);

                gray = new cv.Mat();
                cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);

                blurred = new cv.Mat();
                cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

                edged = new cv.Mat();
                // Try dual Canny thresholds for low & high contrast
                cv.Canny(blurred, edged, 30, 120);

                contours = new cv.MatVector();
                hierarchy = new cv.Mat();
                cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                let maxArea = 0;

                for (let i = 0; i < contours.size(); i += 1) {
                    const contour = contours.get(i);
                    const area = cv.contourArea(contour);

                    // Threshold relative to resized frame size
                    if (area > 800) {
                        const perimeter = cv.arcLength(contour, true);
                        
                        // Stage 1: Try polygon approximation with multiple epsilon ratios
                        let quadFound = false;
                        const epsilons = [0.02, 0.03, 0.015, 0.04];
                        
                        for (let epsRatio of epsilons) {
                            const approx = new cv.Mat();
                            cv.approxPolyDP(contour, approx, epsRatio * perimeter, true);
                            if (approx.rows === 4 && area > maxArea) {
                                maxArea = area;
                                bestPts = [];
                                for (let k = 0; k < 4; k++) {
                                    bestPts.push({
                                        x: (approx.data32S[k * 2] / dsize.width) * 100,
                                        y: (approx.data32S[k * 2 + 1] / dsize.height) * 100
                                    });
                                }
                                approx.delete();
                                quadFound = true;
                                break;
                            }
                            approx.delete();
                        }

                        // Stage 2: Fallback to minAreaRect for contours with >= 4 points
                        if (!quadFound && area > maxArea && contour.rows >= 4) {
                            try {
                                const rotatedRect = cv.minAreaRect(contour);
                                const vertices = cv.RotatedRect.points(rotatedRect);
                                if (vertices && vertices.length === 4) {
                                    maxArea = area;
                                    bestPts = vertices.map(pt => ({
                                        x: (pt.x / dsize.width) * 100,
                                        y: (pt.y / dsize.height) * 100
                                    }));
                                }
                            } catch (rectErr) {
                                // ignore
                            }
                        }
                    }
                    contour.delete();
                }

                if (bestPts && bestPts.length === 4) {
                    return sortPoints(bestPts);
                }
            } catch (error) {
                console.error("OpenCV edge detection failed:", error);
            } finally {
                if (src) src.delete();
                if (resized) resized.delete();
                if (gray) gray.delete();
                if (blurred) blurred.delete();
                if (edged) edged.delete();
                if (contours) contours.delete();
                if (hierarchy) hierarchy.delete();
            }
        }

        // Fast Canvas-based Luminance Contrast Fallback Detector (when OpenCV is offline or loading)
        try {
            if (!window.fallbackCanvas) {
                window.fallbackCanvas = document.createElement('canvas');
                window.fallbackCanvas.width = 40;
                window.fallbackCanvas.height = 30;
            }
            const fctx = window.fallbackCanvas.getContext('2d');
            fctx.drawImage(videoElement, 0, 0, 40, 30);
            const imgData = fctx.getImageData(0, 0, 40, 30).data;

            // Calculate center vs edge contrast
            let centerLuma = 0;
            let edgeLuma = 0;
            let centerCount = 0;
            let edgeCount = 0;

            for (let y = 0; y < 30; y++) {
                for (let x = 0; x < 40; x++) {
                    const idx = (y * 40 + x) * 4;
                    const luma = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;
                    if (x >= 8 && x <= 32 && y >= 6 && y <= 24) {
                        centerLuma += luma;
                        centerCount++;
                    } else {
                        edgeLuma += luma;
                        edgeCount++;
                    }
                }
            }

            const avgCenter = centerLuma / (centerCount || 1);
            const avgEdge = edgeLuma / (edgeCount || 1);
            const contrastDiff = Math.abs(avgCenter - avgEdge);

            // If there is significant document contrast in center frame
            if (contrastDiff > 18) {
                return sortPoints([
                    { x: 15, y: 15 },
                    { x: 85, y: 15 },
                    { x: 85, y: 85 },
                    { x: 15, y: 85 }
                ]);
            }
        } catch (fbErr) {
            // ignore
        }

        return null;
    };

    const capture = ({ videoElement, quality = 0.9 } = {}) => {
        if (!videoElement) return null;

        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(videoElement, 0, 0);

        return new Promise((resolve) => {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            canvas.toBlob((blob) => {
                if (!blob) {
                    resolve(null);
                    return;
                }
                const realMimeType = blob.type || 'image/jpeg';
                const extension = realMimeType.includes('png') ? 'png' : realMimeType.includes('webp') ? 'webp' : 'jpg';
                const file = new File([blob], `captured-${Date.now()}.${extension}`, { type: realMimeType });
                resolve({ dataUrl, file });
            }, 'image/jpeg', quality);
        });
    };

    const retake = async ({ videoElement, facingMode } = {}) => startPreview({
        videoElement,
        facingMode: facingMode || lastFacingMode
    });

    return {
        environment,
        profile,
        startPreview,
        detectEdges,
        capture,
        retake,
        stop
    };
};
