import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    XMarkIcon, ArrowsRightLeftIcon,
    SparklesIcon, CpuChipIcon
} from '@heroicons/react/24/outline';
import { createCaptureEngine } from './captureEngine';

const CameraModal = ({ isOpen, onClose, onCapture }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    const activeStreamRef = useRef(null);
    const modalOpenRef = useRef(isOpen);
    
    // Dragging state
    const draggingCorner = useRef(null);

    const [stream, setStream] = useState(null);
    const [facingMode, setFacingMode] = useState('environment');
    const [hasPermission, setHasPermission] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);

    // OpenCV states
    const [cvLoaded, setCvLoaded] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);

    // Preview states
    const [previewImage, setPreviewImage] = useState(null);
    const [capturedFile, setCapturedFile] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [isGrayscale, setIsGrayscale] = useState(false);

    // Interactive Corner Guides (in % of container)
    const [corners, setCorners] = useState({
        tl: { x: 15, y: 15 },
        tr: { x: 85, y: 15 },
        bl: { x: 15, y: 85 },
        br: { x: 85, y: 85 }
    });

    // Auto-detected corners for Live Tracing
    const [autoCorners, setAutoCorners] = useState(null);
    const autoCornersRef = useRef(null); 
    const lastDetectedRef = useRef(null);

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
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isOpen, facingMode]);

    // Live Tracing & Rendering Logic
    useEffect(() => {
        if (!isOpen) return;

        let lastProcessTime = 0;
        const processFreq = 60; // Slightly faster processing (~15fps)
        let animationHandle;

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

            // PHASE 1: LIVE (Auto Tracing)
            if (!previewImage && video && video.readyState >= 2) {
                if (window.cv && time - lastProcessTime > processFreq) {
                    try {
                        const detected = captureEngine.detectEdges({ videoElement: video });
                        if (detected) {
                            autoCornersRef.current = detected;
                            lastDetectedRef.current = detected;
                            setAutoCorners(detected);
                        } else {
                            autoCornersRef.current = null;
                            setAutoCorners(null);
                        }
                        lastProcessTime = time;
                    } catch (e) {
                        // Silent fail for rendering loop stability
                    }
                }

                // Draw Live Trace using Ref (for smoothness)
                const currentTrace = autoCornersRef.current;
                if (currentTrace) {
                    ctx.beginPath();
                    ctx.moveTo((currentTrace.tl.x / 100) * width, (currentTrace.tl.y / 100) * height);
                    ctx.lineTo((currentTrace.tr.x / 100) * width, (currentTrace.tr.y / 100) * height);
                    ctx.lineTo((currentTrace.br.x / 100) * width, (currentTrace.br.y / 100) * height);
                    ctx.lineTo((currentTrace.bl.x / 100) * width, (currentTrace.bl.y / 100) * height);
                    ctx.closePath();
                    
                    ctx.strokeStyle = '#818cf8';
                    ctx.lineWidth = 4;
                    ctx.lineJoin = 'round';
                    
                    // Outer glow
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'rgba(129, 140, 248, 0.8)';
                    ctx.stroke();
                    
                    // Inner sharp line
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.shadowBlur = 0;

                    // Neon Pulse effect
                    const pulse = (Math.sin(time / 200) + 1) / 2;
                    ctx.strokeStyle = `rgba(129, 140, 248, ${0.2 + pulse * 0.3})`;
                    ctx.lineWidth = 15;
                    ctx.stroke();
                }
            }

            // PHASE 2: PREVIEW (Manual Handles)
            if (previewImage) {
                // ... same drawing logic, but let's ensure it's stable ...
                const m = corners; // Use current state for handles
                ctx.beginPath();
                ctx.moveTo((m.tl.x / 100) * width, (m.tl.y / 100) * height);
                ctx.lineTo((m.tr.x / 100) * width, (m.tr.y / 100) * height);
                ctx.lineTo((m.br.x / 100) * width, (m.br.y / 100) * height);
                ctx.lineTo((m.bl.x / 100) * width, (m.bl.y / 100) * height);
                ctx.closePath();
                
                ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
                ctx.fill();
                ctx.strokeStyle = '#818cf8';
                ctx.lineWidth = 2;
                ctx.stroke();

                Object.values(m).forEach(c => {
                    ctx.beginPath();
                    ctx.arc((c.x / 100) * width, (c.y / 100) * height, 12, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.3)';
                    ctx.fill();
                    ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                });
            }

            animationHandle = requestAnimationFrame(render);
        };

        animationHandle = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animationHandle);
    }, [isOpen, previewImage]); // Reduced dependencies! corners removed to stop constant loop restarts

    // Dragging Handlers (ONLY IN PREVIEW/ADJUST MODE)
    const handleDragStart = (e) => {
        if (!previewImage) return; // Disable dragging during live trace
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;

        // Find nearest corner within threshold (e.g., 5%)
        let minDist = 10;
        let nearestKey = null;

        Object.entries(corners).forEach(([key, c]) => {
            const dist = Math.hypot(c.x - x, c.y - y);
            if (dist < minDist) {
                minDist = dist;
                nearestKey = key;
            }
        });

        if (nearestKey) draggingCorner.current = nearestKey;
    };

    const handleDragging = (e) => {
        if (!draggingCorner.current) return;
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

        setCorners(prev => ({
            ...prev,
            [draggingCorner.current]: { x, y }
        }));
    };

    const handleDragEnd = () => {
        draggingCorner.current = null;
    };

    const captureEngine = useMemo(() => createCaptureEngine(), []);
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
        captureEngine.stop();
        activeStreamRef.current = null;
        setStream(null);
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    const toggleCamera = () => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');

    const capturePhoto = async () => {
        if (!videoRef.current) return;

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

        setPreviewImage(captured.dataUrl);

        // 2. Snap manual handles to the last auto-detected position (or default)
        if (lastDetectedRef.current) {
            setCorners(lastDetectedRef.current);
        }

        setCapturedFile(captured.file);
        setIsCapturing(false);
        setScannerStatus('crop_confirm');
        stopCamera(); // Stop camera once captured for adjustment
    };

    const processFinalWarp = () => {
        if (!capturedFile || !window.cv) return;
        
        setScannerStatus('ocr_processing');
        setIsCapturing(true);
        const cv = window.cv;
        
        const img = new Image();
        img.src = URL.createObjectURL(capturedFile);
        img.onload = () => {
            const src = cv.imread(img);
            
            // Source points from manual adjustment
            const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
                (corners.tl.x / 100) * src.cols, (corners.tl.y / 100) * src.rows,
                (corners.tr.x / 100) * src.cols, (corners.tr.y / 100) * src.rows,
                (corners.br.x / 100) * src.cols, (corners.br.y / 100) * src.rows,
                (corners.bl.x / 100) * src.cols, (corners.bl.y / 100) * src.rows
            ]);

            const dstWidth = 900;
            const dstHeight = 1200;
            const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dstWidth, 0, dstWidth, dstHeight, 0, dstHeight]);

            const M = cv.getPerspectiveTransform(srcPts, dstPts);
            const dst = new cv.Mat();
            cv.warpPerspective(src, dst, M, new cv.Size(dstWidth, dstHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

            const outputCanvas = document.createElement('canvas');
            cv.imshow(outputCanvas, dst);
            
            outputCanvas.toBlob((blob) => {
                const file = new File([blob], capturedFile.name, { type: 'image/jpeg' });
                onCapture(file);
                onClose();
                setIsCapturing(false);
            }, 'image/jpeg', 0.9);

            src.delete(); srcPts.delete(); dstPts.delete(); M.delete(); dst.delete();
        };
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
        setScannerStatus('preview');
        captureEngine.retake({ videoElement: videoRef.current, facingMode }).then((newStream) => {
            activeStreamRef.current = newStream;
            setStream(newStream);
            setHasPermission(true);
        }).catch(() => setHasPermission(false)); // Restart camera on retake
    };

    const handleRotate = () => setRotation(prev => (prev + 90) % 360);
    const toggleGrayscale = () => setIsGrayscale(prev => !prev);
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
            quality: cvLoaded ? 'Enhanced' : 'Standard'
        };
    }, [autoCorners, cvLoaded, facingMode, stream]);

    useEffect(() => {
        if (!isOpen || previewImage || isCapturing) return;
        setScannerStatus(autoCorners ? 'edge_lock' : 'preview');
    }, [autoCorners, isCapturing, isOpen, previewImage]);

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[10000] flex bg-slate-950 transition-colors duration-500 touch-none overflow-hidden"
            >
                <div className="hidden lg:flex w-72 shrink-0 border-r border-white/10 bg-white/[0.04] p-6 z-10">
                    <div className="space-y-6 text-white/80">
                        <h3 className="text-xs uppercase tracking-[0.25em] text-indigo-300 font-black">Scanner tips</h3>
                        <ul className="space-y-3 text-sm leading-relaxed text-white/70">
                            <li>• Keep paper flat and fill at least 70% of the frame.</li>
                            <li>• Hold still for edge lock before capture.</li>
                            <li>• Use crop confirm to fine tune corners.</li>
                            <li>• OCR works best with clear, bright text.</li>
                        </ul>
                        <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-indigo-200 font-bold mb-1">Status</p>
                            <p className="text-sm text-white">{currentStep.label}</p>
                            <p className="text-xs text-white/60 mt-1">{currentStep.message}</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-w-0 flex flex-col relative">
                    <div className="absolute top-0 left-0 right-0 p-4 lg:p-6 flex items-center justify-between z-20 pointer-events-none">
                        <motion.button onClick={onClose} whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} className="p-3 text-white/70 hover:text-white bg-black/30 backdrop-blur-md rounded-2xl transition-all pointer-events-auto">
                            <XMarkIcon className="w-7 h-7" />
                        </motion.button>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-full backdrop-blur-md">
                            <SparklesIcon className="w-4 h-4 text-indigo-300 animate-pulse" />
                            <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">{captureEngine.environment} Capture Engine</span>
                        </div>
                        <button onClick={toggleCamera} className="p-3 text-white/70 hover:text-white bg-black/30 backdrop-blur-md rounded-2xl transition-all active:scale-95 pointer-events-auto">
                            <ArrowsRightLeftIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 w-full flex items-center justify-center p-0 lg:p-8 overflow-hidden">
                        <div className="relative w-full h-full lg:max-w-xl lg:aspect-[9/16] lg:max-h-full lg:rounded-3xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10">
                            <AnimatePresence mode="wait">
                                {previewImage ? (
                                    <motion.div key="preview" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full h-full flex items-center justify-center relative p-4">
                                        <motion.div className="relative flex items-center justify-center w-full h-full" animate={{ rotate: rotation }} transition={{ type: 'spring', stiffness: 200, damping: 25 }}>
                                            <img src={previewImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-white/10" style={{ filter: isGrayscale ? 'grayscale(100%)' : 'none' }} alt="Preview" />
                                        </motion.div>
                                        <canvas ref={overlayCanvasRef} onMouseDown={handleDragStart} onMouseMove={handleDragging} onMouseUp={handleDragEnd} onMouseLeave={handleDragEnd} onTouchStart={handleDragStart} onTouchMove={handleDragging} onTouchEnd={handleDragEnd} className="absolute inset-0 w-full h-full cursor-crosshair touch-none" />
                                    </motion.div>
                                ) : (
                                    <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full relative">
                                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                        <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="absolute left-3 right-3 top-16 lg:top-auto lg:bottom-4 z-20 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md px-4 py-3">
                                <div className="flex items-center justify-between text-xs text-white/80">
                                    <span className="uppercase tracking-[0.18em] font-bold">Step {Math.max(activeStepIndex, 0) + 1} / {sharedSteps.length}</span>
                                    <span className="text-indigo-200 font-semibold">{currentStep.label}</span>
                                </div>
                                <p className="text-xs text-white/70 mt-1">{currentStep.message}</p>
                            </div>
                        </div>
                    </div>

                    <div className="lg:hidden border-t border-white/10 bg-black/70 backdrop-blur-xl p-4 pb-6">
                        <div className="flex items-center justify-between gap-2">
                            {previewImage ? (
                                <>
                                    <button onClick={handleRetake} className="h-14 px-4 rounded-2xl bg-white/10 text-white font-semibold text-sm">Retake</button>
                                    <button onClick={handleRotate} className="h-14 px-4 rounded-2xl bg-white/10 text-white font-semibold text-sm">Rotate</button>
                                    <button onClick={toggleGrayscale} className={`h-14 px-4 rounded-2xl font-semibold text-sm ${isGrayscale ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white'}`}>B&W</button>
                                    <button onClick={handleConfirm} className="h-14 px-5 rounded-2xl bg-white text-slate-900 font-black text-sm">Confirm</button>
                                </>
                            ) : (
                                <>
                                    <button onClick={capturePhoto} disabled={!stream || isCapturing} className="flex-1 h-16 rounded-3xl bg-white text-slate-900 font-black text-base disabled:opacity-50">
                                        {isInitializing ? 'Initializing...' : 'Capture'}
                                    </button>
                                    <button onClick={toggleCamera} className="h-16 w-16 rounded-3xl bg-white/10 text-white flex items-center justify-center">
                                        <ArrowsRightLeftIcon className="w-7 h-7" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="hidden lg:flex w-72 shrink-0 border-l border-white/10 bg-white/[0.04] p-6 z-10">
                    <div className="w-full space-y-5">
                        <h3 className="text-xs uppercase tracking-[0.25em] text-indigo-300 font-black">Live metrics</h3>
                        {Object.entries(liveMetrics).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between text-sm rounded-xl border border-white/10 px-4 py-3 bg-black/20">
                                <span className="capitalize text-white/60">{key.replace(/([A-Z])/g, ' $1')}</span>
                                <span className="text-white font-semibold">{value}</span>
                            </div>
                        ))}
                        <div className="pt-2">
                            <AnimatePresence mode="wait">
                                {previewImage ? (
                                    <motion.div key="desktop-confirm-actions" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="space-y-3">
                                        <button onClick={handleConfirm} className="w-full h-12 rounded-xl bg-white text-slate-900 font-black">Confirm crop</button>
                                        <button onClick={handleRetake} className="w-full h-12 rounded-xl bg-white/10 text-white font-semibold">Retake</button>
                                        <button onClick={handleRotate} className="w-full h-12 rounded-xl bg-white/10 text-white font-semibold">Rotate</button>
                                        <button onClick={toggleGrayscale} className={`w-full h-12 rounded-xl font-semibold ${isGrayscale ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white'}`}>B&W filter</button>
                                    </motion.div>
                                ) : (
                                    <motion.button key="desktop-capture-action" onClick={capturePhoto} disabled={!stream || isCapturing} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full h-14 rounded-2xl bg-white text-slate-900 font-black disabled:opacity-50">
                                        {isInitializing ? (
                                            <span className="inline-flex items-center gap-2"><CpuChipIcon className="w-5 h-5 animate-spin" />Preparing...</span>
                                        ) : 'Capture'}
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Hidden Processing Canvas */}
                <canvas ref={canvasRef} className="hidden" />
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

export default CameraModal;
