import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    XMarkIcon, CameraIcon, ArrowsRightLeftIcon,
    SparklesIcon, ViewfinderCircleIcon, CheckIcon,
    ArrowPathIcon, CpuChipIcon, SwatchIcon,
    AdjustmentsHorizontalIcon
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
        stopCamera(); // Stop camera once captured for adjustment
    };

    const processFinalWarp = () => {
        if (!capturedFile || !window.cv) return;
        
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
            const finalDataUrl = outputCanvas.toDataURL('image/jpeg', 0.9);
            
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
        captureEngine.retake({ videoElement: videoRef.current, facingMode }).then((newStream) => {
            activeStreamRef.current = newStream;
            setStream(newStream);
            setHasPermission(true);
        }).catch(() => setHasPermission(false)); // Restart camera on retake
    };

    const handleRotate = () => setRotation(prev => (prev + 90) % 360);
    const toggleGrayscale = () => setIsGrayscale(prev => !prev);

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[10000] flex flex-row bg-slate-950 transition-colors duration-500 touch-none overflow-hidden"
            >
                {/* Left Side: Viewfinder Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Floating Header Actions (over viewer) */}
                    <div className="absolute top-0 left-0 right-48 p-6 flex items-center justify-between z-20 pointer-events-none">
                        <motion.button
                            onClick={onClose}
                            whileHover={{ rotate: 90 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-3 text-white/50 hover:text-white bg-white/10 backdrop-blur-md rounded-2xl transition-all pointer-events-auto"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </motion.button>

                        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full backdrop-blur-md">
                            <SparklesIcon className="w-4 h-4 text-indigo-400 animate-pulse" />
                            <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">
                                {captureEngine.environment} Capture Engine
                            </span>
                        </div>

                        <button onClick={toggleCamera} className="p-3 text-white/50 hover:text-white bg-white/10 backdrop-blur-md rounded-2xl transition-all active:scale-95 pointer-events-auto">
                            <ArrowsRightLeftIcon className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Main Viewfinder */}
                    <div className="flex-1 w-full flex items-center justify-center p-8 overflow-hidden relative">
                        <div className="relative w-full max-w-md aspect-[9/16] max-h-full rounded-3xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10">
                            <AnimatePresence mode="wait">
                                {previewImage ? (
                                    <motion.div
                                        key="preview" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                        className="w-full h-full flex items-center justify-center relative p-4"
                                    >
                                        <motion.div
                                            className="relative flex items-center justify-center w-full h-full"
                                            animate={{ rotate: rotation }}
                                            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                                        >
                                            <img
                                                src={previewImage}
                                                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-white/10"
                                                style={{ filter: isGrayscale ? 'grayscale(100%)' : 'none' }}
                                                alt="Preview"
                                            />
                                        </motion.div>
                                        {/* Interactive Draggable Overlay (ONLY IN PREVIEW) */}
                                        <canvas 
                                            ref={overlayCanvasRef}
                                            onMouseDown={handleDragStart}
                                            onMouseMove={handleDragging}
                                            onMouseUp={handleDragEnd}
                                            onMouseLeave={handleDragEnd}
                                            onTouchStart={handleDragStart}
                                            onTouchMove={handleDragging}
                                            onTouchEnd={handleDragEnd}
                                            className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                                        />
                                    </motion.div>
                                ) : (
                                    <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full relative">
                                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                        
                                        {/* Live Tracing Overlay */}
                                        <canvas 
                                            ref={overlayCanvasRef}
                                            className="absolute inset-0 w-full h-full pointer-events-none"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Right Side: Control Panel Area */}
                <div className="w-48 flex flex-col items-center justify-center bg-white/[0.02] border-l border-white/5 backdrop-blur-sm z-30 p-8 shrink-0">
                    <AnimatePresence mode="wait">
                        {previewImage ? (
                            <motion.div
                                key="confirm-actions" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }}
                                className="flex flex-col gap-10 items-center"
                            >
                                <button onClick={handleConfirm} className="flex flex-col items-center gap-2 group">
                                    <div className="w-20 h-20 bg-white hover:scale-105 active:scale-95 rounded-full flex items-center justify-center text-slate-900 shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all">
                                        <CheckIcon className="w-10 h-10" />
                                    </div>
                                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Confirm</span>
                                </button>

                                <div className="w-12 h-[1px] bg-white/10" />

                                <div className="flex flex-col gap-8">
                                    <button onClick={handleRotate} className="flex flex-col items-center gap-2 group">
                                        <div className="w-14 h-14 bg-white/5 hover:bg-indigo-500/20 rounded-full flex items-center justify-center text-white/50 group-hover:text-indigo-400 transition-all active:scale-95">
                                            <ArrowPathIcon className="w-6 h-6 rotate-90" />
                                        </div>
                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Rotate</span>
                                    </button>

                                    <button onClick={toggleGrayscale} className="flex flex-col items-center gap-2 group">
                                        <div className={`w-14 h-14 ${isGrayscale ? 'bg-indigo-500 text-white' : 'bg-white/5 text-white/50 hover:bg-indigo-500/20 group-hover:text-indigo-400'} rounded-full flex items-center justify-center transition-all active:scale-95`}>
                                            <SwatchIcon className="w-6 h-6" />
                                        </div>
                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">B&W</span>
                                    </button>

                                    <button onClick={handleRetake} className="flex flex-col items-center gap-2 group">
                                        <div className="w-14 h-14 bg-white/5 hover:bg-rose-500/20 rounded-full flex items-center justify-center text-white/50 group-hover:text-rose-400 transition-all">
                                            <ArrowPathIcon className="w-6 h-6" />
                                        </div>
                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Retake</span>
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="shutter" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                className="flex flex-col items-center gap-10"
                            >
                                <button
                                    onClick={capturePhoto}
                                    disabled={!stream || isCapturing}
                                    className="group relative flex items-center justify-center active:scale-90 transition-all"
                                >
                                    <div className="absolute -inset-8 border-2 border-indigo-500/10 rounded-full animate-ping" />
                                    <div className="absolute -inset-4 border border-white/10 rounded-full" />

                                    <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.1)] relative overflow-hidden">
                                        {isInitializing ? (
                                            <CpuChipIcon className="w-12 h-12 text-indigo-500 animate-spin" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-1">
                                                <div className="w-8 h-8 border-2 border-indigo-500 rounded-lg flex items-center justify-center bg-indigo-500/10">
                                                    <SparklesIcon className="w-4 h-4 text-indigo-500 animate-pulse" />
                                                </div>
                                                <span className="text-[12px] font-black text-indigo-600 uppercase tracking-tighter">Snap</span>
                                            </div>
                                        )}
                                    </div>

                                    {isCapturing && (
                                        <svg className="absolute w-32 h-32 animate-spin text-indigo-500" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                    )}
                                </button>

                                <div className="[writing-mode:vertical-lr] text-[10px] font-black text-indigo-400/50 uppercase tracking-[0.4em] flex items-center gap-4">
                                    <AdjustmentsHorizontalIcon className="w-4 h-4 rotate-90" />
                                    <span>Drag Corners</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Hidden Processing Canvas */}
                <canvas ref={canvasRef} className="hidden" />
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

export default CameraModal;