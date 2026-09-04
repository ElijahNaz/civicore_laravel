import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    XMarkIcon, ArrowsRightLeftIcon,
    SparklesIcon, CpuChipIcon, ArrowDownTrayIcon,
    VideoCameraIcon
} from '@heroicons/react/24/outline';
import { createCaptureEngine, detectCaptureEnvironment } from './captureEngine';

const CameraModal = ({ isOpen, onClose, onCapture }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    const fileInputRef = useRef(null);
    const activeStreamRef = useRef(null);
    const modalOpenRef = useRef(isOpen);

    const [stream, setStream] = useState(null);
    const [facingMode, setFacingMode] = useState(() => detectCaptureEnvironment() === 'desktop' ? 'user' : 'environment');
    const [hasPermission, setHasPermission] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [helperText, setHelperText] = useState('Align document inside frame');
    const [borderColor, setBorderColor] = useState('red');
    const [streamStuck, setStreamStuck] = useState(false);
    const [isBlackFeed, setIsBlackFeed] = useState(false);

    // OpenCV states
    const [cvLoaded, setCvLoaded] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);

    // Preview states
    const [previewImage, setPreviewImage] = useState(null);
    const [capturedFile, setCapturedFile] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [isGrayscale, setIsGrayscale] = useState(false);

    // Interactive Free-Form 4-Corner Perspective Manipulation (in % of container)
    const [freeCorners, setFreeCorners] = useState({
        tl: { x: 15, y: 15 },
        tr: { x: 85, y: 15 },
        br: { x: 85, y: 85 },
        bl: { x: 15, y: 85 }
    });
    const freeCornersRef = useRef(freeCorners);
    useEffect(() => {
        freeCornersRef.current = freeCorners;
    }, [freeCorners]);

    // Auto-detected corners for Live Tracing
    const [autoCorners, setAutoCorners] = useState(null);
    const [edgeDetectionFailed, setEdgeDetectionFailed] = useState(false);
    const autoCornersRef = useRef(null); 
    const lastDetectedRef = useRef(null);
    const detectionProfileRef = useRef({
        environment: 'desktop',
        baseInterval: 80,
        minInterval: 67,
        maxInterval: 170,
        adaptiveInterval: 80,
        lowPerfHits: 0,
        highPerfHits: 0
    });
    const detectionHistoryRef = useRef([]);
    const stabilitySamplesRef = useRef([]);
    const [stabilityScore, setStabilityScore] = useState(0);
    const captureEngine = useMemo(() => createCaptureEngine(), []);

    // OpenCV.js Loader
    useEffect(() => {
        if (isOpen && !window.cv && !isInitializing) {
            setIsInitializing(true);
            const script = document.createElement('script');
            script.src = 'https://docs.opencv.org/4.x/opencv.js';
            script.async = true;
            script.onload = () => {
                // OpenCV might take a moment to initialize the WASM runtime
                const checkCv = setInterval(() => {
                    if (window.cv && window.cv.Mat) {
                        clearInterval(checkCv);
                        setCvLoaded(true);
                        setIsInitializing(false);
                    }
                }, 100);
            };
            document.body.appendChild(script);
        } else if (window.cv) {
            setCvLoaded(true);
        }
    }, [isOpen]);

    useEffect(() => {
        modalOpenRef.current = isOpen;
        if (isOpen) {
            setPreviewImage(null);
            setCapturedFile(null);
            setRotation(0);
            setIsGrayscale(false);
            setStabilityScore(0);
            setEdgeDetectionFailed(false);
            detectionHistoryRef.current = [];
            stabilitySamplesRef.current = [];
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isOpen, facingMode]);

    // Ensure the video element gets the stream once it is mounted.
    // The video element is conditionally rendered, so its ref might be null
    // when startCamera first retrieves the stream.
    useEffect(() => {
        if (stream && videoRef.current) {
            if (videoRef.current.srcObject !== stream) {
                videoRef.current.srcObject = stream;
            }
            if (videoRef.current.paused) {
                videoRef.current.play().catch(e => console.warn("Video play failed:", e));
            }
        }
    }, [stream]);

    // Live Tracing & Rendering Logic
    useEffect(() => {
        if (!isOpen) return;

        let lastProcessTime = 0;
        let lastStateUpdateTime = 0;
        let animationHandle;
        let stuckStartTime = 0;
        let blackFeedStartTime = 0;

        const render = (time) => {
            const canvas = overlayCanvasRef.current;
            const video = videoRef.current;
            if (!canvas) {
                animationHandle = requestAnimationFrame(render);
                return;
            }

            const ctx = canvas.getContext('2d');
            const { width, height } = canvas.getBoundingClientRect();
            
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            ctx.clearRect(0, 0, width, height);

            // Stuck Player Detection
            if (!previewImage && video) {
                if (video.readyState < 2 || video.paused) {
                    if (!stuckStartTime) {
                        stuckStartTime = time;
                    } else if (time - stuckStartTime > 3500) {
                        if (video.paused) video.play().catch(() => {});
                        setStreamStuck(true);
                    }
                } else {
                    stuckStartTime = 0;
                    setStreamStuck(false);
                }
            } else {
                stuckStartTime = 0;
                setStreamStuck(false);
            }

            let isTooDark = false;
            let isTooBright = false;
            let avgBrightness = 128;

            if (!previewImage && video && video.readyState >= 2) {
                try {
                    if (!window.lightCanvas) {
                        window.lightCanvas = document.createElement('canvas');
                        window.lightCanvas.width = 10;
                        window.lightCanvas.height = 10;
                    }
                    const lightCtx = window.lightCanvas.getContext('2d');
                    lightCtx.drawImage(video, 0, 0, 10, 10);
                    const imgData = lightCtx.getImageData(0, 0, 10, 10).data;
                    let brightnessSum = 0;
                    for (let i = 0; i < imgData.length; i += 4) {
                        brightnessSum += (imgData[i] * 0.299 + imgData[i+1] * 0.587 + imgData[i+2] * 0.114);
                    }
                    avgBrightness = brightnessSum / (imgData.length / 4);
                    isTooDark = avgBrightness < 50;
                    isTooBright = avgBrightness > 210;

                    // Black feed detection
                    if (avgBrightness < 8) {
                        if (!blackFeedStartTime) {
                            blackFeedStartTime = time;
                        } else if (time - blackFeedStartTime > 2000) {
                            setIsBlackFeed(true);
                        }
                    } else {
                        blackFeedStartTime = 0;
                        setIsBlackFeed(false);
                    }
                } catch (lightErr) {
                    // ignore
                }
            } else {
                blackFeedStartTime = 0;
                setIsBlackFeed(false);
            }

            // PHASE 1: LIVE (Auto Tracing)
            if (!previewImage && video && video.readyState >= 2) {
                const profile = detectionProfileRef.current;
                if (time - lastProcessTime > profile.adaptiveInterval) {
                    try {
                        const detectStartedAt = performance.now();
                        const detected = captureEngine.detectEdges({ videoElement: video });
                        const detectDuration = performance.now() - detectStartedAt;
                        detectionHistoryRef.current.push(detectDuration);
                        if (detectionHistoryRef.current.length > 8) detectionHistoryRef.current.shift();

                        const avgDuration = detectionHistoryRef.current.reduce((sum, ms) => sum + ms, 0) / detectionHistoryRef.current.length;
                        if (avgDuration > profile.adaptiveInterval * 0.65 || detectDuration > profile.adaptiveInterval * 0.9) {
                            profile.lowPerfHits += 1;
                            profile.highPerfHits = 0;
                        } else if (avgDuration < profile.baseInterval * 0.45) {
                            profile.highPerfHits += 1;
                            profile.lowPerfHits = 0;
                        } else {
                            profile.lowPerfHits = Math.max(0, profile.lowPerfHits - 1);
                            profile.highPerfHits = Math.max(0, profile.highPerfHits - 1);
                        }

                        if (profile.lowPerfHits >= 2) {
                            profile.adaptiveInterval = Math.min(profile.maxInterval, profile.adaptiveInterval + (profile.environment === 'mobile' ? 22 : 16));
                            profile.lowPerfHits = 0;
                        } else if (profile.highPerfHits >= 4) {
                            profile.adaptiveInterval = Math.max(profile.minInterval, profile.adaptiveInterval - (profile.environment === 'mobile' ? 10 : 8));
                            profile.highPerfHits = 0;
                        }

                        if (detected) {
                            autoCornersRef.current = detected;
                            lastDetectedRef.current = detected;
                            setAutoCorners(detected);
                            setEdgeDetectionFailed(false);
                            calculateStability(detected);
                        } else {
                            autoCornersRef.current = null;
                            setAutoCorners(null);
                            setEdgeDetectionFailed(true);
                            setStabilityScore(0);
                        }
                        lastProcessTime = time;
                    } catch (e) {
                        // Silent fail for rendering loop stability
                    }
                }

                if (time - lastStateUpdateTime > 200) {
                    let msg = "Align document inside frame";
                    let statusColor = "amber";
                    
                    if (isBlackFeed) {
                        msg = "Webcam feed is black. Check privacy shutter or settings.";
                        statusColor = "red";
                    } else if (isTooDark) {
                        msg = "Too dark - add light";
                        statusColor = "amber";
                    } else if (isTooBright) {
                        msg = "Too bright - reduce glare";
                        statusColor = "amber";
                    } else if (autoCornersRef.current) {
                        msg = "Document Locked • Ready to Capture";
                        statusColor = "green";
                    } else if (edgeDetectionFailed) {
                        msg = "Scanning for document...";
                        statusColor = "amber";
                    }
                    
                    setHelperText(msg);
                    setBorderColor(statusColor);
                    lastStateUpdateTime = time;
                }

                const colorMap = {
                    green: '#10b981',
                    amber: '#f59e0b',
                    red: '#ef4444'
                };
                const activeColor = colorMap[borderColor] || '#10b981';

                const currentTrace = autoCornersRef.current;
                if (currentTrace) {
                    const pts = [
                        { x: (currentTrace.tl.x / 100) * width, y: (currentTrace.tl.y / 100) * height },
                        { x: (currentTrace.tr.x / 100) * width, y: (currentTrace.tr.y / 100) * height },
                        { x: (currentTrace.br.x / 100) * width, y: (currentTrace.br.y / 100) * height },
                        { x: (currentTrace.bl.x / 100) * width, y: (currentTrace.bl.y / 100) * height }
                    ];

                    // 1. Translucent glowing emerald document fill
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    ctx.lineTo(pts[1].x, pts[1].y);
                    ctx.lineTo(pts[2].x, pts[2].y);
                    ctx.lineTo(pts[3].x, pts[3].y);
                    ctx.closePath();
                    ctx.fill();

                    // 2. Bright glowing green bounding outline
                    ctx.strokeStyle = '#10b981';
                    ctx.lineWidth = 4;
                    ctx.lineJoin = 'round';
                    ctx.shadowBlur = 18;
                    ctx.shadowColor = '#10b981';
                    ctx.stroke();

                    // 3. 4 Green target corner circles
                    pts.forEach(pt => {
                        ctx.beginPath();
                        ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = '#10b981';
                        ctx.fill();
                        ctx.strokeStyle = '#10b981';
                        ctx.lineWidth = 3;
                        ctx.stroke();
                    });
                } else {
                    const rx = width * 0.15;
                    const ry = height * 0.18;
                    const rw = width * 0.7;
                    const rh = height * 0.58;
                    
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                    ctx.fillRect(0, 0, width, ry);
                    ctx.fillRect(0, ry + rh, width, height - (ry + rh));
                    ctx.fillRect(0, ry, rx, rh);
                    ctx.fillRect(rx + rw, ry, width - (rx + rw), rh);
                    
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(rx, ry, rw, rh);
                    
                    ctx.strokeStyle = activeColor;
                    ctx.lineWidth = 5;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = activeColor;
                    const len = 24;
                    
                    ctx.beginPath();
                    ctx.moveTo(rx, ry + len); ctx.lineTo(rx, ry); ctx.lineTo(rx + len, ry);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(rx + rw - len, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + len);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(rx, ry + rh - len); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + len, ry + rh);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(rx + rw - len, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - len);
                    ctx.stroke();
                }
            }

            // PHASE 2: PREVIEW (Free-Form 4-Corner Perspective Crop)
            if (previewImage) {
                const fc = freeCornersRef.current;
                const p = {
                    tl: { x: (fc.tl.x / 100) * width, y: (fc.tl.y / 100) * height },
                    tr: { x: (fc.tr.x / 100) * width, y: (fc.tr.y / 100) * height },
                    br: { x: (fc.br.x / 100) * width, y: (fc.br.y / 100) * height },
                    bl: { x: (fc.bl.x / 100) * width, y: (fc.bl.y / 100) * height }
                };

                // Fill dark mask outside free-form polygon
                ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                ctx.fillRect(0, 0, width, height);

                // Cut out quad area inside the 4 free corners
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(p.tl.x, p.tl.y);
                ctx.lineTo(p.tr.x, p.tr.y);
                ctx.lineTo(p.br.x, p.br.y);
                ctx.lineTo(p.bl.x, p.bl.y);
                ctx.closePath();
                ctx.clip();
                ctx.clearRect(0, 0, width, height);
                ctx.restore();

                // Draw glowing indigo polygon border
                ctx.strokeStyle = '#818cf8';
                ctx.lineWidth = 3;
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#818cf8';
                ctx.beginPath();
                ctx.moveTo(p.tl.x, p.tl.y);
                ctx.lineTo(p.tr.x, p.tr.y);
                ctx.lineTo(p.br.x, p.br.y);
                ctx.lineTo(p.bl.x, p.bl.y);
                ctx.closePath();
                ctx.stroke();

                // Draw 4 circular corner handles at corners
                const handlePoints = [
                    { key: 'tl', ...p.tl },
                    { key: 'tr', ...p.tr },
                    { key: 'br', ...p.br },
                    { key: 'bl', ...p.bl }
                ];

                handlePoints.forEach((pt) => {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = 'rgba(79, 70, 229, 0.8)';
                    ctx.fill();
                    ctx.strokeStyle = '#4f46e5';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                });
            }

            animationHandle = requestAnimationFrame(render);
        };

        animationHandle = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animationHandle);
    }, [captureEngine, isOpen, previewImage, borderColor, stabilityScore, edgeDetectionFailed]);

    // Free-Form 4-Corner Dragging Handlers (ONLY IN PREVIEW/ADJUST MODE)
    const dragStateRef = useRef(null);

    const handleDragStart = (e) => {
        if (!previewImage) return;
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;

        const fc = freeCornersRef.current;
        const threshold = 12;
        let clickedCorner = null;
        let minDist = threshold;

        Object.entries(fc).forEach(([key, pt]) => {
            const dist = Math.hypot(pt.x - x, pt.y - y);
            if (dist < minDist) {
                minDist = dist;
                clickedCorner = key;
            }
        });

        if (clickedCorner) {
            dragStateRef.current = {
                type: clickedCorner,
                startX: x,
                startY: y
            };
        }
    };

    const handleDragging = (e) => {
        if (!dragStateRef.current) return;
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

        const { type } = dragStateRef.current;

        setFreeCorners(prev => ({
            ...prev,
            [type]: { x, y }
        }));
    };

    const handleDragEnd = () => {
        dragStateRef.current = null;
    };

    useEffect(() => {
        const isMobile = captureEngine.environment === 'mobile';
        detectionProfileRef.current = {
            environment: captureEngine.environment,
            // Desktop default: ~10-15fps, Mobile default: ~5-8fps
            baseInterval: isMobile ? 143 : 80,
            minInterval: isMobile ? 125 : 67,
            maxInterval: isMobile ? 300 : 240,
            adaptiveInterval: isMobile ? 143 : 80,
            lowPerfHits: 0,
            highPerfHits: 0
        };
        detectionHistoryRef.current = [];
        stabilitySamplesRef.current = [];
        setStabilityScore(0);
    }, [captureEngine.environment]);

    const calculateStability = useCallback((detectedCorners) => {
        if (!detectedCorners) {
            setStabilityScore(0);
            return 0;
        }

        const points = [detectedCorners.tl, detectedCorners.tr, detectedCorners.br, detectedCorners.bl];
        stabilitySamplesRef.current.push(points);
        if (stabilitySamplesRef.current.length > 6) stabilitySamplesRef.current.shift();

        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const widthPct = Math.max(...xs) - Math.min(...xs);
        const heightPct = Math.max(...ys) - Math.min(...ys);
        const areaScore = Math.min(1, (widthPct * heightPct) / 6000);

        if (stabilitySamplesRef.current.length < 3) {
            const bootstrapScore = Number((areaScore * 0.6).toFixed(2));
            setStabilityScore(bootstrapScore);
            return bootstrapScore;
        }

        const latest = stabilitySamplesRef.current[stabilitySamplesRef.current.length - 1];
        const previous = stabilitySamplesRef.current[stabilitySamplesRef.current.length - 2];
        const jitter = latest.reduce((sum, pt, idx) => {
            const prev = previous[idx];
            return sum + Math.hypot(pt.x - prev.x, pt.y - prev.y);
        }, 0) / latest.length;

        const jitterScore = Math.max(0, 1 - (jitter / 4));
        const score = Number(Math.max(0, Math.min(1, (jitterScore * 0.7) + (areaScore * 0.3))).toFixed(2));
        setStabilityScore(score);
        return score;
    }, []);
    const sharedSteps = useMemo(() => ([
        { key: 'preview', label: 'Preview', message: 'Align the document inside the frame.' },
        { key: 'edge_lock', label: 'Edge lock', message: 'Keep steady while we lock document edges.' },
        { key: 'capture', label: 'Capture', message: 'Capturing image with enhanced sharpness.' },
        { key: 'crop_confirm', label: 'Crop confirm', message: 'Adjust corners, then confirm your crop.' },
        { key: 'ocr_processing', label: 'OCR processing', message: 'Extracting text from the captured page.' }
    ]), []);
    const [scannerStatus, setScannerStatus] = useState('preview');

    const startCamera = async () => {
        stopCamera();
        try {
            const newStream = await captureEngine.startPreview({
                videoElement: videoRef.current,
                facingMode
            });

            // Critical Race Condition Check:
            // If the modal was closed while we were waiting for the camera, stop it immediately.
            if (!modalOpenRef.current) {
                newStream.getTracks().forEach(track => track.stop());
                return;
            }

            activeStreamRef.current = newStream;
            setStream(newStream);
            setHasPermission(true);
        } catch (err) {
            setHasPermission(false);
        }
    };

    const stopCamera = () => {
        if (activeStreamRef.current) {
            try {
                activeStreamRef.current.getTracks().forEach(track => track.stop());
            } catch (e) {}
            activeStreamRef.current = null;
        }
        try {
            captureEngine.stop();
        } catch (e) {}
        setStream(null);
        if (videoRef.current) {
            try {
                videoRef.current.pause();
                videoRef.current.srcObject = null;
            } catch (e) {}
        }
    };
    
    React.useEffect(() => {
            return () => {
                    stopCamera();
                };
            }, []);

    const handleClose = () => {
        modalOpenRef.current = false;
        stopCamera();
        onClose();
    };

    const toggleCamera = () => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');

    const capturePhoto = async () => {
        if (!videoRef.current || !stream) {
            openFilePicker();
            return;
        }

        setScannerStatus('capture');
        setIsCapturing(true);

        const captured = await captureEngine.capture({
            videoElement: videoRef.current,
            quality: 0.9
        });

        if (!captured) {
            setIsCapturing(false);
            return;
        }

        // Automatic Warp/Crop Confirmation Bypass:
        // If high confidence edge detection was active (borderColor is green), bypass crop adjust screen
        if (borderColor === 'green' && lastDetectedRef.current) {
            onCapture({
                file: captured.file,
                corners: {
                    tl: { x: lastDetectedRef.current.tl.x / 100, y: lastDetectedRef.current.tl.y / 100 },
                    tr: { x: lastDetectedRef.current.tr.x / 100, y: lastDetectedRef.current.tr.y / 100 },
                    br: { x: lastDetectedRef.current.br.x / 100, y: lastDetectedRef.current.br.y / 100 },
                    bl: { x: lastDetectedRef.current.bl.x / 100, y: lastDetectedRef.current.bl.y / 100 }
                },
                edgeStability: stabilityScore,
                deviceType: captureEngine.environment
            });
            onClose();
            setIsCapturing(false);
            stopCamera();
            return;
        }

        setPreviewImage(captured.dataUrl);

        if (captureEngine.environment === 'desktop' || (videoRef.current && videoRef.current.videoWidth > videoRef.current.videoHeight)) {
            setRotation(90);
        }

        if (lastDetectedRef.current) {
            setFreeCorners(lastDetectedRef.current);
            setEdgeDetectionFailed(false);
        } else {
            setFreeCorners({
                tl: { x: 25, y: 10 },
                tr: { x: 75, y: 10 },
                br: { x: 75, y: 90 },
                bl: { x: 25, y: 90 }
            });
            setEdgeDetectionFailed(true);
        }

        setCapturedFile(captured.file);
        setIsCapturing(false);
        setScannerStatus('crop_confirm');
        stopCamera();
    };

    const processFinalWarp = () => {
        if (!capturedFile) return;

        setScannerStatus('ocr_processing');
        setIsCapturing(true);

        const fc = freeCorners;
        onCapture({
            file: capturedFile,
            corners: {
                tl: { x: fc.tl.x / 100, y: fc.tl.y / 100 },
                tr: { x: fc.tr.x / 100, y: fc.tr.y / 100 },
                br: { x: fc.br.x / 100, y: fc.br.y / 100 },
                bl: { x: fc.bl.x / 100, y: fc.bl.y / 100 }
            },
            edgeStability: stabilityScore / 100,
            deviceType: captureEngine.environment
        });
        handleClose();
        setIsCapturing(false);
    };

    const handleConfirm = () => {
        if (!capturedFile || !previewImage) return;
        processFinalWarp();
    };

    const handleRetake = () => {
        setPreviewImage(null);
        setCapturedFile(null);
        setRotation(0);
        setIsGrayscale(false);
        setEdgeDetectionFailed(false);
        setScannerStatus('preview');
        captureEngine.retake({ videoElement: videoRef.current, facingMode }).then((newStream) => {
            activeStreamRef.current = newStream;
            setStream(newStream);
            setHasPermission(true);
        }).catch(() => setHasPermission(false));
    };

    const handleRotate = () => setRotation(prev => (prev + 90) % 360);
    const toggleGrayscale = () => setIsGrayscale(prev => !prev);
    const openFilePicker = () => fileInputRef.current?.click();
    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            onCapture({
                file: file,
                corners: null,
                edgeStability: null,
                deviceType: captureEngine.environment
            });
            handleClose();
            return;
        }

        setScannerStatus('crop_confirm');
        setIsCapturing(true);

        const reader = new FileReader();
        reader.onload = (e) => {
            setPreviewImage(e.target.result);
            setCapturedFile(file);
            setFreeCorners({
                tl: { x: 15, y: 15 },
                tr: { x: 85, y: 15 },
                br: { x: 85, y: 85 },
                bl: { x: 15, y: 85 }
            });
            setEdgeDetectionFailed(true);
            setIsCapturing(false);
            stopCamera();
        };
        reader.onerror = () => {
            setIsCapturing(false);
        };
        reader.readAsDataURL(file);
    };
    const activeStepIndex = sharedSteps.findIndex((step) => step.key === scannerStatus);
    const currentStep = sharedSteps[Math.max(activeStepIndex, 0)];
    const liveMetrics = useMemo(() => {
        const cornersList = autoCorners ? Object.values(autoCorners) : [];
        const xs = cornersList.map((point) => point.x);
        const ys = cornersList.map((point) => point.y);
        const widthPct = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
        const heightPct = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
        return {
            camera: facingMode === 'environment' ? 'Rear camera' : 'Front camera',
            stream: stream ? 'Active' : 'Paused',
            edgeLock: autoCorners ? 'Locked' : 'Scanning',
            frameCoverage: `${Math.round(widthPct * heightPct)}%`,
            detectRate: `${Math.max(1, Math.round(1000 / detectionProfileRef.current.adaptiveInterval))} FPS`,
            stability: `${Math.round(stabilityScore * 100)}%`,
            autoCapture: stabilityScore >= 82 / 100 ? 'Ready' : 'Waiting',
            quality: cvLoaded ? 'Enhanced' : 'Standard'
        };
    }, [autoCorners, cvLoaded, facingMode, stabilityScore, stream]);

    useEffect(() => {
        if (!isOpen || previewImage || isCapturing) return;
        setScannerStatus(autoCorners ? 'edge_lock' : 'preview');
    }, [autoCorners, isCapturing, isOpen, previewImage]);

    const isDesktop = captureEngine.environment === 'desktop';

    if (!isOpen) return null;

    const content = (
        <motion.div
            initial={{ opacity: 0, scale: isDesktop ? 0.95 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: isDesktop ? 0.95 : 1 }}
            className={
                isDesktop
                    ? "relative w-full max-w-4xl h-[680px] max-h-[88vh] bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-white"
                    : "fixed inset-0 z-[10000] flex flex-col bg-slate-950 touch-none overflow-hidden text-white"
            }
        >
                {/* Header Overlay - Always on Top (z-50) */}
                <div className="absolute top-0 left-0 right-0 p-4 lg:p-6 flex items-center justify-between z-50">
                    <motion.button onClick={handleClose} whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} className="p-3 text-white/70 hover:text-white bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 transition-all pointer-events-auto cursor-pointer">
                        <XMarkIcon className="w-7 h-7" />
                    </motion.button>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-full backdrop-blur-md">
                        <SparklesIcon className="w-4 h-4 text-indigo-400 animate-pulse" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">{captureEngine.environment} Scan Engine</span>
                    </div>
                    <button onClick={toggleCamera} className="p-3 text-white/70 hover:text-white bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 transition-all active:scale-95 pointer-events-auto cursor-pointer">
                        <ArrowsRightLeftIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Main Viewport Container */}
                <div className="flex-1 w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        {previewImage ? (
                            <motion.div key="preview" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full h-full flex items-center justify-center relative p-4">
                                <motion.div className="relative flex items-center justify-center w-full h-full" animate={{ rotate: rotation }} transition={{ type: 'spring', stiffness: 200, damping: 25 }}>
                                    <img src={previewImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-white/10" style={{ filter: isGrayscale ? 'grayscale(100%)' : 'none' }} alt="Preview" />
                                </motion.div>
                                <canvas ref={overlayCanvasRef} onMouseDown={handleDragStart} onMouseMove={handleDragging} onMouseUp={handleDragEnd} onMouseLeave={handleDragEnd} onTouchStart={handleDragStart} onTouchMove={handleDragging} onTouchEnd={handleDragEnd} className="absolute inset-0 w-full h-full cursor-crosshair touch-none z-10" />
                            </motion.div>
                        ) : (isInitializing || (!stream && hasPermission !== false)) ? (
                            /* STATE 1: HIGH-TECH CAMERA LOADING STATE */
                            <motion.div key="loading" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="p-8 text-center max-w-sm mx-auto flex flex-col items-center gap-5">
                                <div className="relative">
                                    <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center animate-pulse">
                                        <VideoCameraIcon className="w-10 h-10 text-indigo-400" />
                                    </div>
                                    <div className="absolute -inset-2 rounded-3xl border border-indigo-500/20 animate-ping pointer-events-none" />
                                </div>
                                <div>
                                    <h3 className="text-white font-black text-lg tracking-tight">Initializing Camera Stream...</h3>
                                    <p className="text-xs text-white/50 leading-relaxed mt-1.5">
                                        Calibrating camera sensor & auto-focus detector...
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-indigo-300">
                                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                                    <span>Connecting Video Hardware</span>
                                </div>
                            </motion.div>
                        ) : (hasPermission === false || !stream || streamStuck) ? (
                            /* STATE 2: LOCAL STREAM OFFLINE TROUBLESHOOTING OVERLAY */
                            <motion.div key="offline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 text-center max-w-sm mx-auto flex flex-col items-center gap-4 z-30">
                                <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full animate-bounce">
                                    <VideoCameraIcon className="w-8 h-8" />
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-base">Local Camera Stream Offline</h3>
                                    <p className="text-xs text-white/50 leading-relaxed mt-1">
                                        The camera stream is paused, black, or blocked by browser permissions.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2 w-full max-w-xs mt-1">
                                    <button
                                        onClick={() => {
                                            if (videoRef.current) {
                                                videoRef.current.play().catch(e => console.warn("Manual force play failed:", e));
                                            }
                                        }}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-lg shadow-indigo-500/10"
                                    >
                                        Force Start Player
                                    </button>
                                    <button
                                        onClick={handleRetake}
                                        className="w-full py-3 bg-white/10 hover:bg-white/15 text-white rounded-2xl text-xs font-bold border border-white/10 transition-all active:scale-95 cursor-pointer"
                                    >
                                        Restart Camera Device
                                    </button>
                                    <button
                                        onClick={openFilePicker}
                                        className="w-full py-3 bg-white/5 hover:bg-white/10 text-white/80 rounded-2xl text-xs font-bold border border-white/10 transition-all active:scale-95 cursor-pointer"
                                    >
                                        Upload Document File
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            /* STATE 3: LIVE ACTIVE VIDEO STREAM */
                            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full relative">
                                <video
                                    ref={(el) => {
                                        videoRef.current = el;
                                        if (el && stream) {
                                            if (el.srcObject !== stream) {
                                                el.srcObject = stream;
                                            }
                                            if (el.paused) {
                                                el.play().catch(e => console.warn("Callback ref video play failed:", e));
                                            }
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                />
                                <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* GCash-style Helper Alert Message Banner */}
                    {!previewImage && (
                        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 shadow-lg backdrop-blur-md bg-black/60">
                            <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                                borderColor === 'green' ? 'bg-emerald-500' : borderColor === 'amber' ? 'bg-amber-500' : 'bg-rose-500'
                            }`} />
                            <span className="text-xs font-bold text-white tracking-wide">{helperText}</span>
                        </div>
                    )}

                </div>

                {/* Bottom Control Bar */}
                <div className="border-t border-white/10 bg-black/80 backdrop-blur-xl p-6 pb-8 z-20">
                    {/* Step Details & Progress */}
                    <div className="mb-4 text-left max-w-md mx-auto border border-white/10 bg-white/5 rounded-xl p-3">
                        <div className="flex items-center justify-between text-xs text-white/80">
                            <span className="uppercase tracking-[0.18em] font-extrabold text-[#d4a574]">Step {Math.max(activeStepIndex, 0) + 1} / {sharedSteps.length}</span>
                            <span className="text-white font-black">{currentStep.label}</span>
                        </div>
                        <p className="text-[11px] text-white/60 mt-1">{currentStep.message}</p>
                        {previewImage && edgeDetectionFailed && (
                            <p className="text-[10px] text-amber-200 mt-1.5 font-medium">
                                Adjust the crop box manually, then press Confirm.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-center gap-4 max-w-md mx-auto">
                        {previewImage ? (
                            <>
                                <button onClick={handleRetake} className="flex-1 h-14 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm border border-white/10 transition-all active:scale-95 cursor-pointer">Retake</button>
                                <button onClick={handleRotate} className="flex-1 h-14 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm border border-white/10 transition-all active:scale-95 cursor-pointer">Rotate</button>
                                <button onClick={toggleGrayscale} className={`flex-1 h-14 rounded-2xl font-bold text-sm border border-white/10 transition-all active:scale-95 cursor-pointer ${isGrayscale ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white'}`}>B&W</button>
                                <button onClick={handleConfirm} className="flex-1 h-14 rounded-2xl bg-white hover:bg-white/90 text-slate-900 font-black text-sm transition-all active:scale-95 cursor-pointer">Confirm</button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={capturePhoto}
                                    disabled={isCapturing}
                                    className={`flex-1 h-16 rounded-3xl font-black text-base transition-all active:scale-95 cursor-pointer shadow-xl ${
                                        borderColor === 'green'
                                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 animate-pulse'
                                            : 'bg-white hover:bg-white/90 text-slate-900'
                                    } disabled:opacity-50`}
                                >
                                    {isInitializing ? 'Initializing...' : 'Capture Page'}
                                </button>
                                <button onClick={openFilePicker} className="h-16 w-16 rounded-3xl bg-white/10 hover:bg-white/15 border border-white/10 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer">
                                    <ArrowDownTrayIcon className="w-6 h-6 rotate-180" />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Hidden Processing Canvas */}
                <canvas ref={canvasRef} className="hidden" />
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                />
            </motion.div>
    );

    return createPortal(
        <AnimatePresence>
            {isDesktop ? (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 lg:p-6 bg-slate-950/85 backdrop-blur-md overflow-hidden">
                    {content}
                </div>
            ) : (
                content
            )}
        </AnimatePresence>,
        document.body
    );
};

export default CameraModal;
