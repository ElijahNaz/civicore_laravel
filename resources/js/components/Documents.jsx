import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CloudArrowUpIcon, DocumentIcon, TrashIcon, CheckCircleIcon,
    ExclamationTriangleIcon, MagnifyingGlassIcon, XMarkIcon,
    PencilSquareIcon, ShieldExclamationIcon, DocumentCheckIcon,
    EyeIcon, ArrowDownTrayIcon, CameraIcon, BoltIcon, ArrowPathIcon, StopIcon, PlayIcon
} from '@heroicons/react/24/outline';
import OcrFormPanel from './OcrFormPanel.jsx';
import SkeletonLoader from './SkeletonLoader.jsx';
import { useModal } from './ModalContext.jsx';
import { useData } from './DataContext.jsx';
import CameraModal from './CameraModal.jsx';
import ActionConfirmModal from './ActionConfirmModal.jsx';
import { preprocessUploadFile } from '../utils/uploadPreprocess.js';

// ── Document Preview Modal (via Portal) ──────────────────────────────────────
const DocumentPreviewModal = ({ file, onClose }) => {
    const viewUrl = `/api/documents/view/${file.id}`;
    const isPdf = file.name?.toLowerCase().endsWith('.pdf');

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black/80 backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-700 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                        <DocumentIcon className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-white truncate max-w-xs">{file.name}</p>
                        <p className="text-xs text-slate-400 capitalize">{file.detected_type || file.type} certificate</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {file.ocr_text && (
                        <a
                            href={`/api/documents/download-txt/${file.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-900/50 hover:bg-emerald-800 rounded-lg transition-colors border border-emerald-700/50"
                        >
                            <DocumentIcon className="w-3.5 h-3.5" />
                            Download TXT
                        </a>
                    )}
                    <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
                    >
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                        Download PDF
                    </a>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all group"
                    >
                        <XMarkIcon className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                    </button>
                </div>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
                {file.ocr_text ? (
                    <div className="w-full max-w-4xl h-full bg-white rounded-xl shadow-inner border border-slate-200 overflow-y-auto p-10 font-mono text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Extracted Content Preview</span>
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase">Converted from {file.name}</span>
                        </div>
                        {file.ocr_text}
                    </div>
                ) : isPdf ? (
                    <iframe
                        src={viewUrl}
                        title={file.name}
                        className="w-full h-full rounded-xl border border-slate-700 bg-white"
                        style={{ minHeight: '70vh' }}
                    />
                ) : (
                    <img
                        src={viewUrl}
                        alt={file.name}
                        className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-slate-700"
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                )}
            </div>
        </div>,
        document.body
    );
};

// ── Main Documents Component ──────────────────────────────────────────────────
const Documents = () => {
    const { showAlert } = useModal();
    const {
        documents: globalFiles,
        history: historyLogs,
        loading: dataLoading,
        backgroundTasks,
        runBackgroundTask,
        refreshDocuments,
        refreshHistory,
        refreshStats,
        refreshAll
    } = useData();
    const isLoadingData = dataLoading.documents;

    const [files, setFiles] = useState([]);
    const [archivedIds, setArchivedIds] = useState([]);

    useEffect(() => {
        // Filter out any IDs that were optimistically archived to prevent "flickering" during background refreshes
        setFiles(globalFiles.filter(f => !archivedIds.includes(f.id)));
    }, [globalFiles, archivedIds]);

    const [selectedDocType, setSelectedDocType] = useState('birth');
    const [dragging, setDragging] = useState(false);
    const [activeOcr, setActiveOcr] = useState(null); // { file, ocrResult }
    const [activeTab, setActiveTab] = useState('queue');
    const [queueSearch, setQueueSearch] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const [historyFilters, setHistoryFilters] = useState({
        type: 'all',
        staff: 'all',
        barangay: 'all',
        dateRange: 'all' // all, today, yesterday, week, month
    });

    const [previewFile, setPreviewFile] = useState(null); // file to preview
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '', type: 'info' });

    useEffect(() => {
        const hasProcessing = files.some(f => f.status === 'processing' || f.status === 'uploading');
        if (!hasProcessing) return;

        const interval = setInterval(() => {
            refreshDocuments(true);
        }, 2000);

        return () => clearInterval(interval);
    }, [files, refreshDocuments]);

    const onDrop = useCallback(async (acceptedFiles) => {
        setDragging(false);
        if (!acceptedFiles.length) return;
        
        // Optimistically add files to queue
        const optimisticFiles = acceptedFiles.map((item, index) => {
            const f = item.file || item;
            return {
                id: `uploading-${Date.now()}-${index}`,
                name: f.name || 'Document',
                size: (f.size ? (f.size / (1024 * 1024)).toFixed(2) + ' MB' : '...'),
                type: selectedDocType,
                status: 'uploading',
                encoded_by: 'Uploading...',
                created_at: new Date().toISOString()
            };
        });
        
        setFiles(prev => [...optimisticFiles, ...prev]);

        const isBulk = acceptedFiles.length > 1;
        const firstFile = acceptedFiles[0]?.file || acceptedFiles[0];
        const taskName = isBulk ? `Uploading ${acceptedFiles.length} files` : `Uploading ${firstFile?.name || 'file'}`;

        runBackgroundTask(taskName, async () => {
            let successCount = 0;
            let lastId = null;

            for (const uploadItem of acceptedFiles) {
                const sourceFile = uploadItem?.file || uploadItem;
                if (!(sourceFile instanceof File)) {
                    console.error('Upload item is not a File object', uploadItem);
                    throw new Error('Invalid upload payload; expected a File object.');
                }
                let file = sourceFile;
                let qualityMetadata = null;

                try {
                    const preprocessed = await preprocessUploadFile(sourceFile, {
                        corners: uploadItem?.corners || null,
                        edgeStability: uploadItem?.edgeStability,
                        deviceType: uploadItem?.deviceType
                    });
                    file = preprocessed.file;
                    qualityMetadata = preprocessed.qualityMetadata;
                } catch (preprocessError) {
                    console.warn(`Preprocessing failed for ${sourceFile?.name || 'file'}`, preprocessError);
                }

                const fd = new FormData();
                fd.append('file', file);
                fd.append('docType', selectedDocType);
                if (qualityMetadata) fd.append('quality_metadata', JSON.stringify(qualityMetadata));
                
                try {
                    const res = await fetch('/api/documents/upload', { method: 'POST', body: fd, credentials: 'include' });
                    const data = await res.json();
                    if (data.success) {
                        successCount++;
                        lastId = data.id;
                    }
                } catch (err) {
                    console.error(`Failed to upload ${sourceFile?.name || 'file'}`, err);
                }
            }

            if (successCount > 0) {
                refreshAll();
                const message = isBulk 
                    ? `Successfully uploaded ${successCount} of ${acceptedFiles.length} files` 
                    : 'Document uploaded successfully';
                return { success: true, message, id: lastId };
            }
            refreshDocuments(true);
            throw new Error('Upload failed');
        }, { silent: true });
    }, [selectedDocType, refreshAll, runBackgroundTask, refreshDocuments]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/msword': ['.doc'],
            'text/plain': ['.txt']
        },
        multiple: true,
        onDragEnter: () => setDragging(true),
        onDragLeave: () => setDragging(false),
    });

    const toggleOcrStatus = async (fileId, currentStatus) => {
        const isStopping = ['pending', 'processing'].includes(currentStatus?.toLowerCase());
        const tempStatus = isStopping ? 'stopped' : 'pending';
        
        // Instant local feedback
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: tempStatus } : f));
        
        try {
            const res = await fetch(`/api/documents/${fileId}/toggle-ocr`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'include' 
            });
            const data = await res.json();
            if (!data.success) {
                refreshDocuments(true);
            } else {
                setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: data.new_status } : f));
                refreshDocuments(true);
            }
        } catch (e) {
            refreshDocuments(true);
        }
    };

    const bulkProcess = async () => {
        const pending = globalFiles.filter(f => f.status === 'pending' || f.status === 'failed' || f.status === 'uploaded');

        if (!pending.length) {
            showAlert({ title: 'Nothing to process', message: 'No pending or failed documents found.', type: 'info' });
            return;
        }

        const documentIds = pending.map(f => f.id);

        const result = await runBackgroundTask('Queueing Documents', async () => {
            const response = await fetch('/api/documents/bulk-process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ document_ids: documentIds })
            });

            if (!response.ok) {
                throw new Error('Failed to send documents to the queue.');
            }

            const data = await response.json();
            return { 
                success: true, 
                message: `Sent ${data.queued_count} documents to the OCR queue!` 
            };
        });

        if (result && result.success) {
            showAlert({ 
                title: 'Action Successful', 
                message: result.message, 
                type: 'success' 
            });
            setFiles(prev => prev.map(f => documentIds.includes(f.id) ? { ...f, status: 'processing' } : f));
            refreshDocuments(true);
        }
    };

    const approveRecord = async (fileId) => {
        const file = files.find(f => f.id === fileId);
        // Show immediate local status update
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'uploading' } : f));

        runBackgroundTask(`Approving ${file?.name || 'Record'}`, async () => {
            try {
                const res = await fetch(`/api/documents/${fileId}/quick-approve`, { method: 'POST', credentials: 'include' });
                const data = await res.json();
                if (data.success) {
                    refreshAll();
                    return { success: true };
                }
                throw new Error(data.error || 'Approval failed');
            } catch (err) {
                // Revert status on failure
                refreshDocuments(true);
                throw err;
            }
        });
    };

    const bulkApprove = async () => {
        const extracted = files.filter(f => f.status === 'extracted');
        if (!extracted.length) return;

        setConfirmModal({
            isOpen: true,
            title: 'Mass Approval',
            message: `Approve all ${extracted.length} extracted records and issue them immediately?`,
            type: 'success',
            onConfirm: () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                runBackgroundTask(`Mass Approval: ${extracted.length} Records`, async () => {
                    // Show immediate local status update for all targeted files
                    const idsToUpdate = extracted.map(f => f.id);
                    setFiles(prev => prev.map(f => idsToUpdate.includes(f.id) ? { ...f, status: 'uploading' } : f));

                    let ok = 0;
                    try {
                        for (const f of extracted) {
                            const res = await fetch(`/api/documents/${f.id}/quick-approve`, { method: 'POST', credentials: 'include' });
                            if (res.ok) ok++;
                        }
                        refreshAll();
                        return { success: true, message: `Successfully approved ${ok} records.` };
                    } catch (err) {
                        refreshDocuments(true);
                        throw err;
                    }
                });
            },
            onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    const saveRecord = async ({ fields, ocr_text, parentalConsent, detectedType, minimizeRequested = false }) => {
        if (!activeOcr) return;
        const file = activeOcr.file;
        const fileId = file.id;
        const personName = fields.full_name || fields.husbands_name || fields.wifes_name || 'Document Data';
        const barangay = fields.barangay || '';

        if (minimizeRequested) {
            setActiveOcr(null);
        } else {
            // Keep modal open long enough to see the "Securing" state, then close
            setTimeout(() => setActiveOcr(null), 800);
        }

        // Immediate local status update in the main table
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'uploading' } : f));

        runBackgroundTask(`Saving: ${personName}`, async () => {
            try {
                const res = await fetch(`/api/documents/${fileId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        extracted_fields: fields,
                        ocr_text: ocr_text,
                        personName,
                        barangay,
                        status: 'Processed',
                        parental_consent: parentalConsent,
                        detectedType
                    }),
                });
                const data = await res.json();
                if (data.success) {
                    refreshAll();
                    return { success: true, message: `Data for ${personName} has been secured.` };
                }
                throw new Error(data.message || 'Save failed');
            } catch (err) {
                refreshDocuments(true);
                throw err;
            }
        });
    };

    const removeFile = async (fileId) => {
        const file = files.find(f => f.id === fileId);
        if (!file) return;

        setConfirmModal({
            isOpen: true,
            title: 'Delete Document',
            message: `Archive \"${file.name}\"? This action can be undone from the Activity Center.`,
            type: 'danger',
            onConfirm: () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                // Optimistic UI update: Track this ID to hide it immediately and keep it hidden
                setArchivedIds(prev => [...prev, fileId]);

                runBackgroundTask(`${file.name}`, async () => {
                    const res = await fetch(`/api/documents/${fileId}`, { method: 'DELETE', credentials: 'include' });
                    if (res.ok) {
                        refreshAll();
                        return { success: true, type: 'delete', message: 'Document archived successfully' };
                    }
                    // Revert on failure
                    refreshAll();
                    throw new Error('Deletion failed');
                }, { 
                    type: 'delete', 
                    undoFn: () => fetch(`/api/documents/${fileId}/undo`, { method: 'POST', credentials: 'include' }) 
                });
            },
            onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    const undoDelete = async (fileId) => {
        await fetch(`/api/documents/${fileId}/undo`, { method: 'POST', credentials: 'include' });
        refreshDocuments(true);
        refreshStats(true);
    };

    const docTypes = [
        { type: 'birth', icon: '👶', name: 'Birth Certificate', desc: 'Live birth records' },
        { type: 'death', icon: '📋', name: 'Death Certificate', desc: 'Registry of deaths' },
        { type: 'marriage', icon: '💍', name: 'Marriage License', desc: 'Marriage contracts' },
    ];

    const statusBadge = (file) => {
        const status = file.status;
        const map = {
            processed: 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-[0_0_12px_-4px_rgba(16,185,129,0.3)]',
            extracted: 'bg-blue-50 text-blue-700 border-blue-100 shadow-[0_0_12px_-4px_rgba(59,130,246,0.3)]',
            processing: 'bg-indigo-50 text-indigo-700 border-indigo-100 shadow-[0_0_12px_-4px_rgba(99,102,241,0.3)]',
            uploading: 'bg-slate-50 text-slate-600 border-slate-200',
            failed: 'bg-rose-50 text-rose-700 border-rose-100',
            stopped: 'bg-slate-100 text-slate-500 border-slate-300',
            pending: 'bg-amber-50 text-amber-700 border-amber-100 shadow-[0_0_12px_-4px_rgba(245,158,11,0.3)]',
        };
        
        let labelStr = status;
        if (status?.toLowerCase() === 'processed') labelStr = '✓ Saved';
        else if (status?.toLowerCase() === 'extracted') labelStr = '⚡ Done';
        else if (status?.toLowerCase() === 'processing') {
            if (file.batch_total > 1) {
                labelStr = `Processing ${file.batch_processed}/${file.batch_total}`;
            } else {
                labelStr = 'Processing…';
            }
        }
        else if (status?.toLowerCase() === 'uploading') labelStr = 'Uploading…';
        else if (status?.toLowerCase() === 'failed') labelStr = 'Failed';
        else if (status?.toLowerCase() === 'stopped') labelStr = 'Stopped';
        else if (status?.toLowerCase() === 'pending') labelStr = 'Pending OCR';
        const cls = map[status?.toLowerCase()] || map.pending;

        return (
            <motion.span
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold px-3 py-1 rounded-full border ${cls} uppercase tracking-tight`}
            >
                {status?.toLowerCase() === 'processing' || status?.toLowerCase() === 'uploading'
                    ? <svg className="animate-spin w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="3" strokeDasharray="32" className="opacity-25" /><path d="M4 12a8 8 0 018-8" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
                    : null}
                {labelStr}
            </motion.span>
        );
    };

    // ── Data Splitting & Filtering ──────────────────────────────────────────
    const queueFiles = files.filter(f => 
        f.status?.toLowerCase() !== 'processed' && 
        f.status?.toLowerCase() !== 'issued'
    );
    
    // Map history logs for the UI (using log fields but keeping logic compatible)
    const historyFiles = historyLogs.map(log => ({
        ...log,
        id: log.id,
        name: log.filename,
        personName: log.person_name,
        type: log.type,
        barangay: log.barangay,
        encoded_by: log.encoded_by,
        created_at: log.created_at,
        status: log.action.toLowerCase(),
        isLog: true // flag to indicate this is a log record
    }));

    const filteredQueue = queueFiles.filter(f =>
        !queueSearch || f.name.toLowerCase().includes(queueSearch.toLowerCase())
    );

    const filteredHistory = historyFiles.filter(f => {
        // Search filter
        const matchesSearch = !historySearch || 
            f.name.toLowerCase().includes(historySearch.toLowerCase()) ||
            f.personName?.toLowerCase().includes(historySearch.toLowerCase());
        
        if (!matchesSearch) return false;

        // Type filter
        if (historyFilters.type !== 'all' && (f.detected_type || f.type) !== historyFilters.type) return false;

        // Staff filter
        if (historyFilters.staff !== 'all' && f.encoded_by !== historyFilters.staff) return false;

        // Barangay filter
        if (historyFilters.barangay !== 'all' && f.barangay !== historyFilters.barangay) return false;

        // Date filter
        if (historyFilters.dateRange !== 'all') {
            const docDate = new Date(f.created_at);
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            if (historyFilters.dateRange === 'today') {
                if (docDate < today) return false;
            } else if (historyFilters.dateRange === 'yesterday') {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                if (docDate < yesterday || docDate >= today) return false;
            } else if (historyFilters.dateRange === 'week') {
                const lastWeek = new Date(today);
                lastWeek.setDate(lastWeek.getDate() - 7);
                if (docDate < lastWeek) return false;
            } else if (historyFilters.dateRange === 'month') {
                const lastMonth = new Date(today);
                lastMonth.setMonth(lastMonth.getMonth() - 1);
                if (docDate < lastMonth) return false;
            }
        }

        return true;
    });

    // Extract unique staff and barangays for filters
    const staffList = [...new Set(historyFiles.map(f => f.encoded_by).filter(Boolean))];
    const barangayList = [...new Set(historyFiles.map(f => f.barangay).filter(Boolean))];

    return (
        <div className="p-1 sm:p-4">
            {/* View Modal */}
            <AnimatePresence>
                {previewFile && (
                    <DocumentPreviewModal
                        file={previewFile}
                        onClose={() => setPreviewFile(null)}
                    />
                )}
            </AnimatePresence>

            <ActionConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                onConfirm={confirmModal.onConfirm}
                onCancel={confirmModal.onCancel}
            />

            {/* OCR Form Panel */}
            <AnimatePresence>
                {activeOcr && (
                    <OcrFormPanel
                        file={activeOcr.file}
                        docType={activeOcr.file?.type || selectedDocType}
                        ocrResult={activeOcr.ocrResult}
                        onSave={saveRecord}
                        onClose={() => setActiveOcr(null)}
                    />
                )}
            </AnimatePresence>

            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-8 max-w-[1400px] mx-auto pb-12"
            >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* ── Left: Upload Panel ──────────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white/60 backdrop-blur-xl rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60"
                    >
                        <h2 className="text-xl font-bold text-slate-800 mb-1">Upload Document</h2>
                        <p className="text-xs text-slate-500 mb-5">Select type, then drag & drop or click to upload</p>

                        <div className="space-y-2.5 mb-5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Document Category</label>
                            {docTypes.map(doc => {
                                const tColors = {
                                    birth: 'border-[#d4a574] bg-[#d4a574]/5 text-[#d4a574] ring-[#d4a574]/30',
                                    death: 'border-rose-500 bg-rose-50 text-rose-500 ring-rose-500/30',
                                    marriage: 'border-indigo-500 bg-indigo-50 text-indigo-500 ring-indigo-500/30'
                                }[doc.type] || 'border-slate-500 bg-slate-50 text-slate-500 ring-slate-500/30';
                                
                                const isSelected = selectedDocType === doc.type;
                                
                                return (
                                    <div key={doc.type} onClick={() => setSelectedDocType(doc.type)}
                                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2 ${isSelected
                                            ? `${tColors.split(' ')[0]} ${tColors.split(' ')[1]} shadow-sm`
                                            : 'border-transparent bg-slate-50 hover:bg-slate-100'
                                            }`}>
                                        <div className={`text-xl w-9 h-9 flex items-center justify-center rounded-lg bg-white shadow-sm ${isSelected ? `ring-1 ${tColors.split(' ')[3]}` : ''}`}>
                                            {doc.icon}
                                        </div>
                                        <div>
                                            <div className={`font-semibold text-sm ${isSelected ? tColors.split(' ')[2] : 'text-slate-700'}`}>{doc.name}</div>
                                            <div className="text-xs text-slate-400">{doc.desc}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="space-y-3">
                            <div {...getRootProps()}
                                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer text-center transition-all ${isDragActive || dragging
                                    ? 'border-[#d4a574] bg-[#d4a574]/5'
                                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'
                                    }`}>
                                <input {...getInputProps()} />
                                <CloudArrowUpIcon className={`w-10 h-10 mb-2 ${isDragActive ? 'text-[#d4a574]' : 'text-slate-300'}`} />
                                <p className="text-sm font-semibold text-slate-600 mb-0.5">Drop file here or click</p>
                                <p className="text-xs text-slate-400">PDF, JPG, PNG, TIFF, DOCX — max 10 MB</p>
                            </div>

                            <div className="relative mt-5">
                                <button
                                    onClick={() => setIsCameraOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors shadow-sm active:scale-95 transition-all"
                                >
                                    <CameraIcon className="w-5 h-5 text-indigo-500" />
                                    Use Device Camera
                                </button>

                                <CameraModal
                                    isOpen={isCameraOpen}
                                    onClose={() => setIsCameraOpen(false)}
                                    onCapture={(capturePayload) => onDrop([capturePayload])}
                                />
                            </div>
                        </div>


                    </motion.div>

                    {/* ── Right Panel: Tabs & Tables ─────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
                        className="lg:col-span-2 bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex flex-col overflow-hidden"
                    >
                        {/* Tab Switcher */}
                        <div className="flex bg-slate-100/50 p-1.5 gap-1 border-b border-slate-100">
                            {[
                                { id: 'queue', label: 'Document Queue', count: queueFiles.length, icon: BoltIcon },
                                { id: 'history', label: 'Submission History', count: historyFiles.length, icon: CheckCircleIcon },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === tab.id
                                            ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
                                        }`}
                                >
                                    <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-500' : 'text-slate-400'}`} />
                                    {tab.label}
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {activeTab === 'queue' ? (
                            <>
                                {/* Queue Header */}
                                <div className="p-5 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between bg-slate-50/50">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">Active Queue</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">Documents waiting for extraction or approval</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="relative">
                                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                            <input value={queueSearch} onChange={e => setQueueSearch(e.target.value)}
                                                placeholder="Search Queue…"
                                                className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 w-36"
                                            />
                                        </div>
                                        {queueFiles.filter(f => f.status?.toLowerCase() === 'extracted').length > 0 && (
                                            <button onClick={bulkApprove}
                                                className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-600 hover:text-white px-3 py-2 rounded-lg border border-emerald-100 transition-all flex items-center gap-1.5 shadow-sm">
                                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                                Approve All
                                            </button>
                                        )}
                                        {queueFiles.some(f => ['pending', 'failed', 'uploaded'].includes(f.status?.toLowerCase())) && (
                                            <button onClick={bulkProcess}
                                                className="text-xs font-bold text-[#d4a574] bg-[#d4a574]/10 hover:bg-[#d4a574] hover:text-[#0f172a] px-3 py-2 rounded-lg border border-[#d4a574]/20 transition-all flex items-center gap-1.5 disabled:opacity-50">
                                                <CloudArrowUpIcon className="w-3.5 h-3.5" />
                                                Process All
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isLoadingData ? (
                                    <div className="p-4"><SkeletonLoader type="table" rows={5} /></div>
                                ) : filteredQueue.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center flex-1 p-12 text-slate-400 text-center">
                                        <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                            <BoltIcon className="w-8 h-8 opacity-20" />
                                        </div>
                                        <p className="text-sm font-medium text-slate-600">{queueSearch ? 'No matching queue items' : 'Queue is currently empty'}</p>
                                        <p className="text-xs mt-1 max-w-[200px]">{queueSearch ? 'Adjust your search query' : 'Upload documents to begin processing'}</p>
                                    </div>
                                ) : (
                                <div className="overflow-x-auto custom-scrollbar flex-1 w-full">
                                    <table className="w-full text-left border-collapse table-auto">
                                        <thead>
                                            <tr className="bg-slate-50/50 text-slate-400 text-[9px] uppercase tracking-widest border-b border-slate-100">
                                                <th className="px-3 py-2.5 font-black text-slate-500">Document</th>
                                                <th className="px-2 py-2.5 font-black text-slate-500 w-20">Type</th>
                                                <th className="px-2 py-2.5 font-black text-slate-500 w-16">Size</th>
                                                <th className="px-2 py-2.5 font-black text-slate-500 w-24">Uploader</th>
                                                <th className="px-2 py-2.5 text-center font-black text-slate-500 w-28">Status</th>
                                                <th className="px-3 py-2.5 text-right font-black text-slate-500 w-32">Actions</th>
                                            </tr>
                                        </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {filteredQueue.map(file => (
                                                    <tr key={file.id} className="hover:bg-slate-50/60 transition-colors">
                                                        {file.isDeleted ? (
                                                            <td colSpan="6" className="p-4 text-center">
                                                                <span className="text-sm text-slate-500 mr-3">Document temporarily deleted.</span>
                                                                <button onClick={() => undoDelete(file.id)} className="text-xs font-bold text-[#d4a574] border border-[#d4a574]/30 bg-[#d4a574]/10 hover:bg-[#d4a574] hover:text-[#0f172a] px-3 py-1.5 rounded-lg transition-colors">Undo</button>
                                                            </td>
                                                        ) : (
                                                            <>
                                                                <td className="px-3 py-2.5">
                                                                    <div className="flex items-center">
                                                                        <div className="min-w-0">
                                                                            <p
                                                                                className="text-[11px] font-bold text-slate-800 truncate max-w-[25ch] hover:text-[#d4a574] cursor-pointer transition-colors"
                                                                                title={file.name}
                                                                                onClick={() => setPreviewFile(file)}
                                                                            >
                                                                                {file.name}
                                                                            </p>
                                                                            <p className="text-[9px] text-slate-400 font-medium truncate uppercase tracking-tighter">
                                                                                {file.extracted_fields?.full_name || 'No Extraction'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-2 py-2.5">
                                                                    <span className="text-[9.5px] font-black px-1.5 py-0.5 bg-slate-50 text-slate-400 border border-slate-100 rounded-md uppercase tracking-tighter">
                                                                        {(file.detected_type && file.detected_type.toLowerCase() !== 'unknown') ? file.detected_type : (file.type && file.type.toLowerCase() !== 'unknown' ? file.type : 'birth')}
                                                                    </span>
                                                                </td>
                                                                <td className="px-2 py-2.5 text-[10px] font-bold text-slate-400 tabular-nums whitespace-nowrap">{file.size}</td>
                                                                <td className="px-2 py-2.5 text-[10px] font-bold text-slate-400 truncate max-w-[12ch] uppercase tracking-tighter">{file.encoded_by || '—'}</td>
                                                                <td className="px-2 py-2.5 text-center whitespace-nowrap">{statusBadge(file)}</td>
                                                                <td className="px-3 py-2.5 text-right">
                                                                    <div className="flex items-center justify-end gap-1 px-1">
                                                                        {['pending', 'processing'].includes(file.status?.toLowerCase()) && (
                                                                            <button onClick={() => toggleOcrStatus(file.id, file.status)}
                                                                                className="p-2.5 text-rose-500 hover:text-white hover:bg-rose-500 rounded-xl transition-all shadow-sm active:scale-90 group border border-rose-100"
                                                                                title="Stop Processing">
                                                                                <StopIcon className="w-4 h-4" />
                                                                            </button>
                                                                        )}

                                                                        {['stopped', 'failed', 'uploaded'].includes(file.status?.toLowerCase()) && (
                                                                            <button onClick={() => toggleOcrStatus(file.id, file.status)}
                                                                                className="p-2.5 text-indigo-500 hover:text-white hover:bg-indigo-500 rounded-xl transition-all shadow-sm active:scale-90 group border border-indigo-100"
                                                                                title="Resume / Retry Processing">
                                                                                <PlayIcon className="w-4 h-4" />
                                                                            </button>
                                                                        )}

                                                                        {['extracted', 'processed'].includes(file.status?.toLowerCase()) && (
                                                                            <button onClick={() => setActiveOcr({ file, ocrResult: { extracted_fields: file.extracted_fields, detected_type: file.detected_type, text: file.ocr_text } })}
                                                                                className="p-2.5 text-slate-500 hover:text-[#d4a574] hover:bg-[#d4a574]/10 border border-slate-100 rounded-xl transition-all active:scale-95 group"
                                                                                title={file.status?.toLowerCase() === 'processed' ? 'View Details' : 'Review & Edit'}>
                                                                                <PencilSquareIcon className="w-4 h-4" />
                                                                            </button>
                                                                        )}

                                                                        {file.status?.toLowerCase() === 'extracted' && (
                                                                            <button onClick={() => approveRecord(file.id)}
                                                                                className="p-2.5 text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-lg shadow-emerald-100 active:scale-95 group"
                                                                                title="Direct Approve">
                                                                                <CheckCircleIcon className="w-4 h-4" />
                                                                            </button>
                                                                        )}

                                                                        <button onClick={() => removeFile(file.id)}
                                                                            className="p-2.5 text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 rounded-xl transition-all shadow-sm shadow-rose-100 active:scale-90 group"
                                                                            title="Delete Document">
                                                                            <TrashIcon className="w-4 h-4 transition-transform group-hover:scale-110" />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {/* History Filters */}
                                <div className="p-4 bg-slate-50/80 border-b border-slate-100 space-y-3">
                                    <div className="flex flex-wrap gap-3 items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input
                                                    value={historySearch}
                                                    onChange={e => setHistorySearch(e.target.value)}
                                                    placeholder="Search history by name..."
                                                    className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-64 shadow-sm"
                                                />
                                            </div>
                                            <div className="h-6 w-px bg-slate-200 mx-1" />
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filters:</span>
                                        </div>
                                        <div className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                            Showing {filteredHistory.length} of {historyFiles.length} records
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {/* Date Filter */}
                                        <select
                                            value={historyFilters.dateRange}
                                            onChange={e => setHistoryFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                                            className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-sm"
                                        >
                                            <option value="all">📅 Any Date</option>
                                            <option value="today">Today</option>
                                            <option value="yesterday">Yesterday</option>
                                            <option value="week">Past 7 Days</option>
                                            <option value="month">Past 30 Days</option>
                                        </select>

                                        {/* Type Filter */}
                                        <select
                                            value={historyFilters.type}
                                            onChange={e => setHistoryFilters(prev => ({ ...prev, type: e.target.value }))}
                                            className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-sm capitalize"
                                        >
                                            <option value="all">📂 All Types</option>
                                            <option value="birth">Birth Certificate</option>
                                            <option value="death">Death Certificate</option>
                                            <option value="marriage">Marriage License</option>
                                        </select>

                                        {/* Staff Filter */}
                                        <select
                                            value={historyFilters.staff}
                                            onChange={e => setHistoryFilters(prev => ({ ...prev, staff: e.target.value }))}
                                            className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-sm"
                                        >
                                            <option value="all">👤 All Staff</option>
                                            {staffList.map(name => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                        </select>

                                        {/* Barangay Filter */}
                                        <select
                                            value={historyFilters.barangay}
                                            onChange={e => setHistoryFilters(prev => ({ ...prev, barangay: e.target.value }))}
                                            className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-sm"
                                        >
                                            <option value="all">🏘️ All Barangays</option>
                                            {barangayList.map(brgy => (
                                                <option key={brgy} value={brgy}>{brgy}</option>
                                            ))}
                                        </select>

                                        {/* Reset Filters */}
                                        {(historySearch || historyFilters.type !== 'all' || historyFilters.staff !== 'all' || historyFilters.barangay !== 'all' || historyFilters.dateRange !== 'all') && (
                                            <button
                                                onClick={() => {
                                                    setHistorySearch('');
                                                    setHistoryFilters({ type: 'all', staff: 'all', barangay: 'all', dateRange: 'all' });
                                                }}
                                                className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-tighter px-2 flex items-center gap-1 transition-colors group"
                                            >
                                                <XMarkIcon className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-300" />
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isLoadingData ? (
                                    <div className="p-4"><SkeletonLoader type="table" rows={8} /></div>
                                ) : filteredHistory.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center flex-1 p-16 text-slate-400 text-center">
                                        <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                                            <MagnifyingGlassIcon className="w-10 h-10 opacity-10" />
                                        </div>
                                        <h4 className="text-slate-700 font-bold mb-1">No matching history records</h4>
                                        <p className="text-xs text-slate-400 max-w-xs mx-auto">Try adjusting your search query or filters to find what you're looking for.</p>
                                        {(historySearch || historyFilters.type !== 'all' || historyFilters.staff !== 'all' || historyFilters.barangay !== 'all' || historyFilters.dateRange !== 'all') && (
                                            <button
                                                onClick={() => {
                                                    setHistorySearch('');
                                                    setHistoryFilters({ type: 'all', staff: 'all', barangay: 'all', dateRange: 'all' });
                                                }}
                                                className="mt-6 text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100"
                                            >
                                                Clear all filters
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto flex-1">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                            <tr className="bg-slate-50/50 text-slate-400 text-[9px] uppercase tracking-widest border-b border-slate-100">
                                                <th className="px-3 py-2.5 font-black text-slate-500">Person / Document</th>
                                                <th className="px-2 py-2.5 font-black text-slate-500">Barangay</th>
                                                <th className="px-2 py-2.5 font-black text-slate-500">Process Date</th>
                                                <th className="px-2 py-2.5 font-black text-slate-500">Staff / Admin</th>
                                                <th className="px-3 py-2.5 text-right font-black text-slate-500">Record</th>
                                            </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {filteredHistory.map(file => {
                                                    const dateObj = new Date(file.created_at);
                                                    return (
                                                        <tr key={file.id} className="hover:bg-slate-50/60 transition-colors group">
                                                            <td className="px-3 py-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${
                                                                        file.type === 'birth' ? 'bg-blue-50 text-blue-500' :
                                                                        file.type === 'death' ? 'bg-slate-100 text-slate-600' :
                                                                        'bg-rose-50 text-rose-500'
                                                                    }`}>
                                                                        <DocumentIcon className="w-5 h-5" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-[11px] font-bold text-slate-800 truncate max-w-[20ch]">
                                                                            {(!file.personName || file.personName.toLowerCase().includes('unnamed')) ? file.name : file.personName}
                                                                        </p>
                                                                        <p className="text-[10px] text-slate-400 font-medium truncate flex items-center gap-1.5">
                                                                            <span className="uppercase tracking-tighter">{file.detected_type || file.type}</span>
                                                                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                                                                            <span className="truncate max-w-[15ch]">{file.name}</span>
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-3">
                                                                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#d4a574]" />
                                                                    {file.barangay || '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[11px] font-bold text-slate-700 tabular-nums">
                                                                        {file.created_at ? new Date(file.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400 font-medium tabular-nums">
                                                                        {file.created_at ? new Date(file.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-200">
                                                                        {file.encoded_by ? file.encoded_by.charAt(0).toUpperCase() : '?'}
                                                                    </div>
                                                                    <span className="text-[11px] font-bold text-slate-600 truncate max-w-[10ch]">{file.encoded_by || 'Unknown'}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-3 text-right">
                                                                <div className="flex items-center justify-end">
                                                                    {file.isLog ? (
                                                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100/50 italic">
                                                                            Persistent Record
                                                                        </span>
                                                                    ) : (
                                                                        <button
    onClick={() => setActiveOcr({ file, ocrResult: { extracted_fields: file.extracted_fields, detected_type: file.detected_type, text: file.ocr_text } })}
    className="px-3 py-1.5 text-[10px] font-bold text-white bg-[#d4a574] hover:bg-[#c29463] rounded-lg shadow-sm transition-all active:scale-95 whitespace-nowrap flex items-center gap-1.5"
>
                                                                            <DocumentCheckIcon className="w-4 h-4" />
                                                                            View Details
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
};

export default Documents;
/** System Stabilized: Ghost-Sync & Precision Tracing Engine Active **/
