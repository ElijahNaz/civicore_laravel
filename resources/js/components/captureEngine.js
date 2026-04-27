const CAPTURE_PROFILES = {
    desktop: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 60 },
        facingMode: 'user',
        aspectRatio: { ideal: 16 / 9 }
    },
    mobile: {
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        frameRate: { ideal: 24, max: 30 },
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

        const constraints = {
            video: {
                width: profile.width,
                height: profile.height,
                frameRate: profile.frameRate,
                aspectRatio: profile.aspectRatio,
                facingMode: lastFacingMode
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;

        if (videoElement) {
            videoElement.srcObject = stream;
        }

        return stream;
    };

    const detectEdges = ({ videoElement } = {}) => {
        const cv = window.cv;
        if (!cv || !videoElement || videoElement.readyState < 2) return null;

        const src = cv.imread(videoElement);
        const resized = new cv.Mat();
        const dsize = new cv.Size(400, (400 / videoElement.videoWidth) * videoElement.videoHeight);

        cv.resize(src, resized, dsize, 0, 0, cv.INTER_AREA);

        const gray = new cv.Mat();
        cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);

        const blurred = new cv.Mat();
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

        const edged = new cv.Mat();
        cv.Canny(blurred, edged, 50, 150);

        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let maxArea = 0;
        let bestQuad = null;

        for (let i = 0; i < contours.size(); i += 1) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);

            if (area > 1000) {
                const perimeter = cv.arcLength(contour, true);
                const approx = new cv.Mat();
                cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

                if (approx.rows === 4 && area > maxArea) {
                    maxArea = area;
                    if (bestQuad) bestQuad.delete();
                    bestQuad = approx;
                } else {
                    approx.delete();
                }
            }
            contour.delete();
        }

        let result = null;

        if (bestQuad) {
            const pts = [];
            for (let i = 0; i < 4; i += 1) {
                pts.push({
                    x: (bestQuad.data32S[i * 2] / dsize.width) * 100,
                    y: (bestQuad.data32S[i * 2 + 1] / dsize.height) * 100
                });
            }
            result = sortPoints(pts);
            bestQuad.delete();
        }

        src.delete();
        resized.delete();
        gray.delete();
        blurred.delete();
        edged.delete();
        contours.delete();
        hierarchy.delete();

        return result;
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
                const file = new File([blob], `captured-${Date.now()}.jpg`, { type: 'image/jpeg' });
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
