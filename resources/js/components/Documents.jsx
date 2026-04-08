import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CloudArrowUpIcon, DocumentIcon, TrashIcon, CheckCircleIcon,
    ExclamationTriangleIcon, MagnifyingGlassIcon, XMarkIcon,
    PencilSquareIcon, ShieldExclamationIcon, DocumentCheckIcon,
    EyeIcon, ArrowDownTrayIcon, CameraIcon, BoltIcon
} from '@heroicons/react/24/outline';
import OcrFormPanel from './OcrFormPanel.jsx';
import SkeletonLoader from './SkeletonLoader.jsx';
import { useModal } from './ModalContext.jsx';
import { useData } from './DataContext.jsx';
import CameraModal from './CameraModal.jsx';
import ActionConfirmModal from './ActionConfirmModal.jsx';
import SaveToasts from './SaveToasts.jsx';

// ── Document Preview Modal (via Portal) ──────────────────────────────────────
const DocumentPreviewModal = ({ file, onClose }) => {
    const downloadUrl = `/api/documents/download/${file.id}`;
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
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <XMarkIcon className="w-5 h-5" />
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
                        src={downloadUrl}
                        title={file.name}
                        className="w-full h-full rounded-xl border border-slate-700 bg-white"
                        style={{ minHeight: '70vh' }}
                    />
                ) : (
                    <img
                        src={downloadUrl}
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
        loading: dataLoading,
        refreshDocuments,
        refreshStats
    } = useData();
    const isLoadingData = dataLoading.documents;

    const [files, setFiles] = useState([]);

    useEffect(() => {
        setFiles(globalFiles);
    }, [globalFiles]);

    const [selectedDocType, setSelectedDocType] = useState('birth');
    const [isUploading, setIsUploading] = useState(false);
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
    const [backgroundTasks, setBackgroundTasks] = useState([]);

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
        const file = acceptedFiles[0];
        const tempId = Math.random().toString(36).substring(7);

        setFiles(prev => [{
            id: tempId, name: file.name, type: selectedDocType,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB', status: 'uploading'
        }, ...prev]);

        const fd = new FormData();
        fd.append('file', file);
        fd.append('docType', selectedDocType);

        try {
            const res = await fetch('/api/documents/upload', { method: 'POST', body: fd, credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                refreshDocuments(true);
                refreshStats(true);
            } else {
                showAlert({ title: 'Upload Failed', message: data.error || 'Upload error.', type: 'error' });
            }
        } catch {
            showAlert({ title: 'Network Error', message: 'A network error occurred during upload.', type: 'error' });
            setFiles(prev => prev.filter(f => f.id !== tempId));
        }
    }, [selectedDocType, refreshDocuments, refreshStats, showAlert]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp'] },
        multiple: false,
        onDragEnter: () => setDragging(true),
        onDragLeave: () => setDragging(false),
    });

    const processFile = async (fileId, fileObj) => {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'processing' } : f));

        try {
            const res = await fetch('/api/ocr/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ documentId: fileId, docType: fileObj?.type || selectedDocType }),
            });
            const data = await res.json();

            if (data.success) {
                refreshDocuments(true);
            } else {
                const errMsg = data.error || 'Could not extract data.';
                showAlert({ title: 'OCR Failed', message: errMsg, type: 'error' });
            }
        } catch {
            showAlert({ title: 'Processing Error', message: 'Unexpected error during OCR.', type: 'error' });
        }
    };

    const bulkProcess = async () => {
        const pending = files.filter(f => f.status === 'pending' || f.status === 'failed' || f.status === 'uploaded');
        if (!pending.length) {
            showAlert({ title: 'Nothing to process', message: 'No pending documents.', type: 'info' });
            return;
        }

        for (const f of pending) {
            fetch('/api/ocr/process', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ documentId: f.id, docType: f.type }),
            });
        }

        setTimeout(() => refreshDocuments(true), 1000);
    };

    const approveRecord = async (fileId) => {
        try {
            const res = await fetch(`/api/documents/${fileId}/quick-approve`, { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                refreshDocuments(true);
                showAlert({ title: 'Record Approved', message: 'The extracted data has been saved and issued.', type: 'success' });
            } else {
                showAlert({ title: 'Approval Failed', message: data.error || 'Failed to approve record.', type: 'error' });
            }
        } catch (err) {
            showAlert({ title: 'Network Error', message: 'Could not communicate with the server.', type: 'error' });
        }
    };

    const bulkApprove = async () => {
        const extracted = files.filter(f => f.status === 'extracted');
        if (!extracted.length) {
            showAlert({ title: 'Nothing to approve', message: 'No extracted records to approve.', type: 'info' });
            return;
        }

        setConfirmModal({
            isOpen: true,
            title: 'Mass Approval',
            message: `Are you sure you want to approve all ${extracted.length} extracted records? This will issue them immediately.`,
            type: 'success',
            onConfirm: async () => {
                let ok = 0;
                for (const f of extracted) {
                    const res = await fetch(`/api/documents/${f.id}/quick-approve`, { method: 'POST', credentials: 'include' });
                    const data = await res.json();
                    if (data.success) ok++;
                }
                refreshDocuments(true);
                showAlert({ title: 'Batch Approved', message: `Successfully approved ${ok} records.`, type: 'success' });
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
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

        // 1. Add to Background Tasks immediately
        const taskId = `save-${fileId}-${Date.now()}`;
        const newTask = { id: taskId, name: personName, status: 'saving' };
        setBackgroundTasks(prev => [...prev, newTask]);

        // 2. Clear Modal if requested (Minimize) or after start
        if (minimizeRequested) {
            setActiveOcr(null);
        }

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

            // 3. Update task status on completion
            setBackgroundTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, status: data.success ? 'success' : 'error' } : t
            ));

            if (data.success) {
                if (!minimizeRequested) setActiveOcr(null);
                refreshDocuments(true);
                refreshStats(true);
                // Auto-dismiss success toast after 4s
                setTimeout(() => {
                    setBackgroundTasks(prev => prev.filter(t => t.id !== taskId));
                }, 4000);
            } else {
                showAlert({ title: 'Save Failed', message: data.message || 'Could not save record.', type: 'error' });
            }
        } catch (err) {
            setBackgroundTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error' } : t));
            showAlert({ title: 'Network Error', message: 'Failed to connect to the server.', type: 'error' });
        }
    };

    const removeFile = async (fileId) => {
        const file = files.find(f => f.id === fileId);
        const fileName = file ? file.name : 'Document';

        setConfirmModal({
            isOpen: true,
            title: 'Delete Document',
            message: `Are you sure you want to remove \"${fileName}\" from the queue? This will archive the record.`,
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));

                // 1. Add to Background Tasks
                const taskId = `delete-${fileId}-${Date.now()}`;
                const newTask = { id: taskId, name: fileName, status: 'deleting' };
                setBackgroundTasks(prev => [...prev, newTask]);

                try {
                    const res = await fetch(`/api/documents/${fileId}`, { method: 'DELETE', credentials: 'include' });
                    const data = await res.json();

                    // 2. Update task status
                    setBackgroundTasks(prev => prev.map(t =>
                        t.id === taskId ? { ...t, status: data.success || res.ok ? 'deleted' : 'error' } : t
                    ));

                    if (data.success || res.ok) {
                        refreshDocuments(true);
                        refreshStats(true);
                        // Auto-dismiss after 3s
                        setTimeout(() => {
                            setBackgroundTasks(prev => prev.filter(t => t.id !== taskId));
                        }, 3000);
                    } else {
                        showAlert({ title: 'Delete Failed', message: data.message || 'Could not delete document.', type: 'error' });
                    }
                } catch (err) {
                    setBackgroundTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error' } : t));
                    showAlert({ title: 'Network Error', message: 'Failed to connect to the server.', type: 'error' });
                }
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

    const statusBadge = (status) => {
        const map = {
            processed: 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-[0_0_12px_-4px_rgba(16,185,129,0.3)]',
            extracted: 'bg-blue-50 text-blue-700 border-blue-100 shadow-[0_0_12px_-4px_rgba(59,130,246,0.3)]',
            processing: 'bg-indigo-50 text-indigo-700 border-indigo-100 shadow-[0_0_12px_-4px_rgba(99,102,241,0.3)]',
            uploading: 'bg-slate-50 text-slate-600 border-slate-200',
            failed: 'bg-rose-50 text-rose-700 border-rose-100',
            pending: 'bg-amber-50 text-amber-700 border-amber-100 shadow-[0_0_12px_-4px_rgba(245,158,11,0.3)]',
        };
        const labels = {
            processed: '✓ Saved',
            extracted: '⚡ Done',
            processing: 'Processing…',
            uploading: 'Uploading…',
            failed: 'Failed',
            pending: 'Pending OCR',
        };
        const cls = map[status?.toLowerCase()] || map.pending;
        const labelStr = labels[status?.toLowerCase()] || status;

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
    const queueFiles = files.filter(f => f.status?.toLowerCase() !== 'processed');
    const historyFiles = files.filter(f => f.status?.toLowerCase() === 'processed');

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
            {/* Notifications */}
            <SaveToasts tasks={backgroundTasks} />

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
                            {docTypes.map(doc => (
                                <div key={doc.type} onClick={() => setSelectedDocType(doc.type)}
                                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2 ${selectedDocType === doc.type
                                        ? 'border-[#d4a574] bg-[#d4a574]/5 shadow-sm'
                                        : 'border-transparent bg-slate-50 hover:bg-slate-100'
                                        }`}>
                                    <div className={`text-xl w-9 h-9 flex items-center justify-center rounded-lg bg-white shadow-sm ${selectedDocType === doc.type ? 'ring-1 ring-[#d4a574]/30' : ''}`}>
                                        {doc.icon}
                                    </div>
                                    <div>
                                        <div className={`font-semibold text-sm ${selectedDocType === doc.type ? 'text-[#d4a574]' : 'text-slate-700'}`}>{doc.name}</div>
                                        <div className="text-xs text-slate-400">{doc.desc}</div>
                                    </div>
                                </div>
                            ))}
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
                                <p className="text-xs text-slate-400">PDF, JPG, PNG, TIFF — max 10 MB</p>
                            </div>

                            <div className="relative">
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
                                    onCapture={(file) => onDrop([file])}
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
                                            <button onClick={bulkProcess} disabled={isUploading}
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
                                    <div className="overflow-x-auto flex-1">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest border-b border-slate-100">
                                                    <th className="px-4 py-3 font-extrabold text-slate-500">Document</th>
                                                    <th className="px-2 py-3 font-extrabold text-slate-500">Type</th>
                                                    <th className="px-2 py-3 font-extrabold text-slate-500">Size</th>
                                                    <th className="px-2 py-3 font-extrabold text-slate-500">Uploader</th>
                                                    <th className="px-2 py-3 text-center font-extrabold text-slate-500">Status</th>
                                                    <th className="px-4 py-3 text-right font-extrabold text-slate-500">Actions</th>
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
                                                                <td className="px-4 py-4">
                                                                    <div className="flex items-center">
                                                                        <div className="min-w-0">
                                                                            <p
                                                                                className="text-[12px] font-bold text-slate-800 truncate max-w-[35ch] hover:text-[#d4a574] cursor-pointer transition-colors"
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
                                                                <td className="px-1 py-4">
                                                                    <span className="text-[9.5px] font-black px-1.5 py-0.5 bg-slate-50 text-slate-400 border border-slate-100 rounded-md uppercase tracking-tighter">
                                                                        {file.detected_type || file.type}
                                                                    </span>
                                                                </td>
                                                                <td className="px-1 py-4 text-[10px] font-bold text-slate-400 tabular-nums whitespace-nowrap">{file.size}</td>
                                                                <td className="px-1 py-4 text-[10px] font-bold text-slate-400 truncate max-w-[12ch] uppercase tracking-tighter">{file.encoded_by || '—'}</td>
                                                                <td className="px-2 py-4 text-center whitespace-nowrap">{statusBadge(file.status)}</td>
                                                                <td className="px-4 py-4 text-right">
                                                                    <div className="flex items-center justify-end gap-1.5 px-1">
                                                                        {['pending', 'failed', 'uploaded'].includes(file.status?.toLowerCase()) && (
                                                                            <button onClick={() => processFile(file.id, file)}
                                                                                className="p-2.5 text-slate-600 hover:text-white hover:bg-slate-900 rounded-xl transition-all shadow-sm active:scale-90 group border border-slate-100"
                                                                                title="Process OCR">
                                                                                <BoltIcon className="w-4 h-4" />
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
                                                className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-tighter px-2 flex items-center gap-1 transition-colors"
                                            >
                                                <XMarkIcon className="w-3.5 h-3.5" />
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
                                                <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest border-b border-slate-100">
                                                    <th className="px-5 py-4 font-extrabold text-slate-500">Person / Document</th>
                                                    <th className="px-2 py-4 font-extrabold text-slate-500">Barangay</th>
                                                    <th className="px-2 py-4 font-extrabold text-slate-500">Process Date</th>
                                                    <th className="px-2 py-4 font-extrabold text-slate-500">Staff / Admin</th>
                                                    <th className="px-5 py-4 text-right font-extrabold text-slate-500">Record</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {filteredHistory.map(file => {
                                                    const dateObj = new Date(file.created_at);
                                                    return (
                                                        <tr key={file.id} className="hover:bg-slate-50/60 transition-colors group">
                                                            <td className="px-5 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                                                                        file.type === 'birth' ? 'bg-blue-50 text-blue-500' :
                                                                        file.type === 'death' ? 'bg-slate-100 text-slate-600' :
                                                                        'bg-rose-50 text-rose-500'
                                                                    }`}>
                                                                        {file.type === 'birth' ? <DocumentIcon className="w-5 h-5" /> : 
                                                                         file.type === 'death' ? <ClipboardDocumentListIcon className="w-5 h-5" /> : 
                                                                         <HeartIcon className="w-5 h-5" />}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-[13px] font-bold text-slate-800 truncate max-w-[20ch]">
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
                                                            <td className="px-2 py-4">
                                                                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#d4a574]" />
                                                                    {file.barangay || '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-4">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[11px] font-bold text-slate-700 tabular-nums">
                                                                        {file.created_at ? new Date(file.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400 font-medium tabular-nums">
                                                                        {file.created_at ? new Date(file.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-200">
                                                                        {file.encoded_by ? file.encoded_by.charAt(0).toUpperCase() : '?'}
                                                                    </div>
                                                                    <span className="text-[11px] font-bold text-slate-600 truncate max-w-[10ch]">{file.encoded_by || 'Unknown'}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-5 py-4 text-right">
                                                                <div className="flex items-center justify-end">
                                                                    <button
                                                                        onClick={() => setActiveOcr({ file, ocrResult: { extracted_fields: file.extracted_fields, detected_type: file.detected_type, text: file.ocr_text } })}
                                                                        className="px-5 py-2.5 text-[11px] font-bold text-white bg-[#d4a574] hover:bg-[#c29463] rounded-xl shadow-sm transition-all active:scale-95 whitespace-nowrap flex items-center gap-2"
                                                                    >
                                                                        <DocumentCheckIcon className="w-4 h-4" />
                                                                        View Details
                                                                    </button>
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
