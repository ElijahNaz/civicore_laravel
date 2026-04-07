import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CloudArrowUpIcon, DocumentIcon, TrashIcon, CheckCircleIcon,
    ExclamationTriangleIcon, MagnifyingGlassIcon, XMarkIcon,
    PencilSquareIcon, ShieldExclamationIcon, DocumentCheckIcon,
    EyeIcon, ArrowDownTrayIcon, CameraIcon
} from '@heroicons/react/24/outline';
import { useModal } from './ModalContext.jsx';
import SkeletonLoader from './SkeletonLoader.jsx';

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


// ── Helper: compute age from a date string ───────────────────────────────────
function computeAge(dobString) {
    if (!dobString) return null;
    const dob = new Date(dobString.replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2'));
    if (isNaN(dob)) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
}

// ── Parental Consent Modal ────────────────────────────────────────────────────
const ParentalConsentModal = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-amber-100"
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <ShieldExclamationIcon className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 text-lg">Parental Consent Required</h3>
                    <p className="text-xs text-slate-500">Subject appears to be under 18 years old</p>
                </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-4 mb-5 border border-amber-100 text-sm text-amber-800">
                This document involves a minor. Please confirm that the necessary parental or guardian consent has been obtained before proceeding.
            </div>

            <div className="space-y-3 mb-5">
                <label className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" id="consent-checkbox" className="mt-1 accent-amber-500 w-4 h-4 flex-shrink-0" />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900">
                        I confirm that parental/guardian consent has been obtained and is on file.
                    </span>
                </label>
            </div>

            <div className="flex gap-3">
                <button
                    onClick={onCancel}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={() => {
                        const checked = document.getElementById('consent-checkbox')?.checked;
                        if (!checked) {
                            alert('Please confirm the checkbox before proceeding.');
                            return;
                        }
                        onConfirm();
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors"
                >
                    Confirm & Continue
                </button>
            </div>
        </motion.div>
    </div>
);

// ── Support Data ───────────────────────────────────────────────────────────────
const NAIC_BARANGAYS = [
    'Gomez-Zamora (Pob.)', 'Capt. C. Nazareno (Pob.)', 'Ibayo Silangan', 'Ibayo Estacion', 'Kanluran', 
    'Makina', 'Sapa', 'Bucana Malaki', 'Bucana Sasahan', 'Bagong Karsada', 
    'Balsahan', 'Bancaan', 'Muzon', 'Latoria', 'Labac', 
    'Mabolo', 'San Roque', 'Santulan', 'Molino', 'Calubcob', 
    'Halang', 'Malainen Bago', 'Malainen Luma', 'Palangue 1', 'Palangue 2 & 3', 
    'Humbac', 'Munting Mapino', 'Sabang', 'Timalan Balsahan', 'Timalan Concepcion'
].sort();

// ── Field config per document type ────────────────────────────────────────────
const FIELD_CONFIG = {
    birth: [
        { key: 'full_name',     label: 'Full Name',       type: 'text',   required: true  },
        { key: 'date_of_birth', label: 'Date of Birth',   type: 'date',   required: true  },
        { key: 'sex',           label: 'Sex',              type: 'select', options: ['Male','Female'], required: false },
        { key: 'place_of_birth',label: 'Place of Birth',  type: 'text',   required: false },
        { key: 'fathers_name',  label: "Father's Name",   type: 'text',   required: false },
        { key: 'mothers_name',  label: "Mother's Name",   type: 'text',   required: false },
        { key: 'barangay',      label: 'Barangay',         type: 'select', options: NAIC_BARANGAYS, required: false },
    ],
    death: [
        { key: 'full_name',      label: 'Full Name',       type: 'text', required: true  },
        { key: 'date_of_death',  label: 'Date of Death',   type: 'date', required: true  },
        { key: 'age',            label: 'Age',              type: 'text', required: false },
        { key: 'sex',            label: 'Sex',              type: 'select', options: ['Male','Female'], required: false },
        { key: 'place_of_death', label: 'Place of Death',  type: 'text', required: false },
        { key: 'cause_of_death', label: 'Cause of Death',  type: 'text', required: false },
        { key: 'barangay',       label: 'Barangay',         type: 'select', options: NAIC_BARANGAYS, required: false },
    ],
    marriage: [
        { key: 'husbands_name',    label: "Husband's Name",    type: 'text', required: true  },
        { key: 'wifes_name',       label: "Wife's Name",       type: 'text', required: true  },
        { key: 'date_of_marriage', label: 'Date of Marriage',  type: 'date', required: false },
        { key: 'place_of_marriage',label: 'Place of Marriage', type: 'text', required: false },
        { key: 'barangay',         label: 'Barangay',           type: 'select', options: NAIC_BARANGAYS, required: false },
    ],
};

// ── OcrFormPanel ──────────────────────────────────────────────────────────────
const OcrFormPanel = ({ file, docType, ocrResult, onSave, onClose }) => {
    const effectiveType  = ocrResult?.detected_type !== 'unknown' ? ocrResult.detected_type : docType;
    const fields         = FIELD_CONFIG[effectiveType] || [];
    const [formData, setFormData] = useState(() => {
        const ef = ocrResult?.extracted_fields || {};
        const init = {};
        fields.forEach(f => {
            let val = ef[f.key] || '';
            if (f.type === 'date' && val) {
                const d = new Date(val.replace(/[^0-9a-zA-Z/-]/g, ' '));
                if (!isNaN(d.getTime())) {
                    val = d.toISOString().split('T')[0];
                }
            }
            init[f.key] = val;
        });
        return init;
    });

    // NEW: Full OCR Text editing
    const [ocrText, setOcrText] = useState(file.ocr_text || ocrResult?.text || '');
    const [viewMode, setViewMode] = useState('text'); // 'text' or 'fields'
    
    const [showConsent, setShowConsent] = useState(false);
    const [consentGiven, setConsentGiven] = useState(false);
    const [savePending, setSavePending] = useState(false);

    const typeMismatch    = ocrResult?.type_mismatch;
    const mismatchMessage = ocrResult?.mismatch_message;

    const age = effectiveType === 'birth' ? computeAge(formData.date_of_birth) : null;
    const isMinor = age !== null && age < 18;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isMinor && !consentGiven) {
            setShowConsent(true);
            return;
        }
        onSave({ fields: formData, ocr_text: ocrText, parentalConsent: consentGiven, detectedType: effectiveType });
    };

    // Trigger save after consent is confirmed (avoid side-effects in render)
    useEffect(() => {
        if (savePending && consentGiven) {
            setSavePending(false);
            onSave({ fields: formData, parentalConsent: true, detectedType: effectiveType });
        }
    }, [savePending, consentGiven]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <AnimatePresence>
                {showConsent && (
                    <ParentalConsentModal
                        onConfirm={() => { setConsentGiven(true); setShowConsent(false); setSavePending(true); }}
                        onCancel={() => setShowConsent(false)}
                    />
                )}
            </AnimatePresence>

            <motion.div
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/80">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <DocumentCheckIcon className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Extracted Document Data</h3>
                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{file?.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Original Document Preview */}
                    <div className="w-1/2 border-r border-slate-100 bg-slate-50 p-4 flex flex-col">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Original Document</span>
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase">Reference Only</span>
                        </div>
                        <div className="flex-1 rounded-xl bg-white border border-slate-200 overflow-hidden relative">
                            {file.name?.toLowerCase().endsWith('.pdf') ? (
                                <iframe 
                                    src={`/api/documents/download/${file.id}`} 
                                    className="w-full h-full border-0"
                                    title="Original PDF"
                                />
                            ) : (
                                <img 
                                    src={`/api/documents/download/${file.id}`} 
                                    className="w-full h-full object-contain"
                                    alt="Original Scan"
                                />
                            )}
                        </div>
                    </div>

                    {/* Right: Editor */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-5">
                        {/* View Switcher */}
                        <div className="flex p-1 bg-slate-100 rounded-xl w-fit">
                            <button 
                                onClick={() => setViewMode('text')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'text' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Full Extracted Text
                            </button>
                            <button 
                                onClick={() => setViewMode('fields')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'fields' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Structured Fields
                            </button>
                        </div>

                        {/* Full Text Editor */}
                        {viewMode === 'text' && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        OCR Result (Editable)
                                    </label>
                                    <span className="text-[10px] text-slate-400 italic">Changes are saved to the database</span>
                                </div>
                                <textarea 
                                    value={ocrText}
                                    onChange={(e) => setOcrText(e.target.value)}
                                    className="w-full h-[400px] p-4 text-sm font-mono border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#d4a574]/40 focus:border-[#d4a574] transition-all"
                                    placeholder="Edit the extracted text here..."
                                />
                            </div>
                        )}

                        {viewMode === 'fields' && (
                            <>
                            {/* Type mismatch warning */}
                            {typeMismatch && (
                                <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                                    <ExclamationTriangleIcon className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold text-rose-700">Document Type Mismatch</p>
                                        <p className="text-sm text-rose-600 mt-0.5">{mismatchMessage}</p>
                                        <p className="text-xs text-rose-500 mt-1">Please verify you uploaded the correct file, or correct the extracted data below before saving.</p>
                                    </div>
                                </div>
                            )}

                            {/* Minor warning */}
                            {isMinor && (
                                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                                    <ShieldExclamationIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold text-amber-700">Subject is a Minor (Age: {age})</p>
                                        <p className="text-sm text-amber-600 mt-0.5">Parental or guardian consent will be required before saving.</p>
                                    </div>
                                </div>
                            )}

                            {/* Form fields */}
                            <form id="ocr-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {fields.map(field => (
                                    <div key={field.key} className={field.key === 'full_name' || field.key === 'husbands_name' || field.key === 'wifes_name' ? 'sm:col-span-2' : ''}>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                            {field.label} {field.required && <span className="text-rose-400">*</span>}
                                        </label>
                                        {field.type === 'select' ? (
                                            <select
                                                value={formData[field.key] || ''}
                                                onChange={e => setFormData(p => ({ ...p, [field.key]: e.target.value }))}
                                                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#d4a574]/40 focus:border-[#d4a574] transition-all"
                                            >
                                                <option value="">Select…</option>
                                                {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        ) : (
                                            <input
                                                type={field.type === 'date' ? 'date' : 'text'}
                                                value={formData[field.key] || ''}
                                                onChange={e => setFormData(p => ({ ...p, [field.key]: e.target.value }))}
                                                required={field.required}
                                                placeholder={`Enter ${field.label.toLowerCase()}…`}
                                                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#d4a574]/40 focus:border-[#d4a574] transition-all placeholder-slate-300"
                                            />
                                        )}
                                    </div>
                                ))}
                            </form>
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100 bg-slate-50/60">
                    <button type="button" onClick={onClose}
                        className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        Discard
                    </button>
                    <button type="submit" form="ocr-form"
                        className="px-5 py-2.5 text-sm font-bold text-white bg-[#0f172a] rounded-xl hover:bg-slate-700 transition-colors flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4" />
                        Save Record
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

import { useData } from './DataContext.jsx';

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

    // Use local state initialized from global data to allow for optimistic updates
    const [files, setFiles] = useState([]);
    
    useEffect(() => {
        // Sync with global state but avoid overwriting if we have local optimistic items
        // (This is a bit simplified, but fixes the reference errors)
        const localOptimistic = files.filter(f => f.status === 'uploading' || f.status === 'processing');
        if (localOptimistic.length === 0) {
            setFiles(globalFiles);
        } else {
            // Merge: keep local optimistic ones, add rest from global
            const optimisticIds = new Set(localOptimistic.map(f => f.id));
            const merged = [...localOptimistic, ...globalFiles.filter(f => !optimisticIds.has(f.id))];
            setFiles(merged);
        }
    }, [globalFiles]);
    
    // We already have files from useData, but we can call refresh on mount to be safe, 
    // though the DataProvider already does this.
    
    const [selectedDocType, setSelectedDocType] = useState('birth');
    const [isUploading, setIsUploading]         = useState(false);
    const [dragging, setDragging]               = useState(false);
    const [activeOcr, setActiveOcr]             = useState(null); // { file, ocrResult }
    const [searchQuery, setSearchQuery]         = useState('');
    const [previewFile, setPreviewFile]         = useState(null); // file to preview

    // ── Polling for background OCR jobs ───────────────────────────────────────
    // The DataProvider already polls every 15s, but for OCR we might want faster local updates
    useEffect(() => {
        const hasProcessing = files.some(f => f.status === 'processing' || f.status === 'uploading');
        if (!hasProcessing) return;

        const interval = setInterval(() => {
            refreshDocuments(true); // Force refresh while processing
        }, 3000);

        return () => clearInterval(interval);
    }, [files, refreshDocuments]);

    // ── Upload ────────────────────────────────────────────────────────────────
    const onDrop = useCallback(async (acceptedFiles) => {
        setDragging(false);
        if (!acceptedFiles.length) return;
        const file   = acceptedFiles[0];
        const tempId = Math.random().toString(36).substring(7);

        setFiles(prev => [{ id: tempId, name: file.name, type: selectedDocType,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB', status: 'uploading' }, ...prev]);

        const fd = new FormData();
        fd.append('file',    file);
        fd.append('docType', selectedDocType);

        try {
            const res  = await fetch('/api/documents/upload', { method: 'POST', body: fd, credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                // Refresh global state
                refreshDocuments(true);
                refreshStats(true);
            } else {
                showAlert({ title: 'Upload Failed', message: data.error || 'Upload error.', type: 'error' });
            }
        } catch {
            showAlert({ title: 'Network Error', message: 'A network error occurred during upload.', type: 'error' });
            setFiles(prev => prev.filter(f => f.id !== tempId));
        }
    }, [selectedDocType]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp'] },
        multiple: false,
        onDragEnter: () => setDragging(true),
        onDragLeave: () => setDragging(false),
    });

    // ── OCR Processing ────────────────────────────────────────────────────────
    const processFile = async (fileId, fileObj) => {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'processing' } : f));

        try {
            const res  = await fetch('/api/ocr/process', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ documentId: fileId, docType: fileObj?.type || selectedDocType }),
            });
            const data = await res.json();

            if (data.success) {
                showAlert({ title: 'Processing Started', message: 'The document is now running OCR in the background. It will update when finished.', type: 'info' });
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
        
        showAlert({ title: 'Batch Started', message: `${pending.length} documents queued for background processing.`, type: 'info' });
        setTimeout(() => refreshDocuments(true), 1000);
    };

    const approveRecord = async (fileId) => {
        try {
            const res = await fetch(`/api/documents/${fileId}/quick-approve`, { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'processed' } : f));
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

        if (!window.confirm(`Approve all ${extracted.length} extracted records?`)) return;

        let ok = 0;
        for (const f of extracted) {
            const res = await fetch(`/api/documents/${f.id}/quick-approve`, { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setFiles(prev => prev.map(x => x.id === f.id ? { ...x, status: 'processed' } : x));
                ok++;
            }
        }
        showAlert({ title: 'Batch Approved', message: `Successfully approved ${ok} records.`, type: 'success' });
    };

    // ── Save reviewed form data ───────────────────────────────────────────────
    const saveRecord = async ({ fields, ocr_text, parentalConsent, detectedType }) => {
        if (!activeOcr) return;
        const fileId = activeOcr.file.id;
        const personName = fields.full_name || fields.husbands_name || '';
        const barangay   = fields.barangay  || '';

        const res  = await fetch(`/api/documents/${fileId}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                extracted_fields: fields,
                ocr_text: ocr_text,
                personName,
                barangay,
                status: 'Processed',
                parental_consent: parentalConsent,
            }),
        });
        const data = await res.json();
        if (data.success) {
            refreshDocuments(true);
            refreshStats(true);
            setActiveOcr(null);
            showAlert({ title: 'Record Saved', message: 'The document data has been saved successfully.', type: 'success' });
        } else {
            showAlert({ title: 'Save Failed', message: 'Could not save the extracted data.', type: 'error' });
        }
    };

    const removeFile = async (fileId) => {
        if (!window.confirm('Delete this document?')) return;
        await fetch(`/api/documents/${fileId}`, { method: 'DELETE', credentials: 'include' });
        refreshDocuments(true);
        refreshStats(true);
    };

    const undoDelete = async (fileId) => {
        await fetch(`/api/documents/${fileId}/undo`, { method: 'POST', credentials: 'include' });
        refreshDocuments(true);
        refreshStats(true);
    };

    const docTypes = [
        { type: 'birth',    icon: '👶', name: 'Birth Certificate',  desc: 'Live birth records'     },
        { type: 'death',    icon: '📋', name: 'Death Certificate',   desc: 'Registry of deaths'     },
        { type: 'marriage', icon: '💍', name: 'Marriage License',    desc: 'Marriage contracts'     },
    ];

    const statusBadge = (status) => {
        const map = {
            processed:  'bg-emerald-50 text-emerald-700 border-emerald-100',
            extracted:  'bg-blue-50 text-blue-700 border-blue-100',
            processing: 'bg-indigo-50 text-indigo-700 border-indigo-100',
            uploading:  'bg-slate-50 text-slate-600 border-slate-200',
            failed:     'bg-rose-50 text-rose-700 border-rose-100',
            pending:    'bg-amber-50 text-amber-700 border-amber-100',
            uploaded:   'bg-amber-50 text-amber-700 border-amber-100',
        };
        const labels = {
            processed:  '✓ Saved',
            extracted:  '⚡ Extracted',
            processing: 'Processing…',
            uploading:  'Uploading…',
            failed:     'Failed',
            pending:    'Pending OCR',
            uploaded:   'Pending OCR',
        };
        const cls = map[status] || map.pending;
        return (
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${cls}`}>
                {status === 'processing' || status === 'uploading'
                    ? <svg className="animate-spin w-3 h-3 mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="3" strokeDasharray="32" className="opacity-25" /><path d="M4 12a8 8 0 018-8" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
                    : null}
                {labels[status] || status}
            </span>
        );
    };

    const filtered = files.filter(f =>
        !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            {/* View Modal */}
            <AnimatePresence>
                {previewFile && (
                    <DocumentPreviewModal 
                        file={previewFile} 
                        onClose={() => setPreviewFile(null)} 
                    />
                )}
            </AnimatePresence>

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
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="space-y-6 max-w-7xl mx-auto"
            >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* ── Left: Upload Panel ──────────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white/60 backdrop-blur-xl rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60"
                    >
                        <h2 className="text-xl font-bold text-slate-800 mb-1">Upload Document</h2>
                        <p className="text-xs text-slate-500 mb-5">Select type, then drag & drop or click to upload</p>

                        {/* Doc Type Selector */}
                        <div className="space-y-2.5 mb-5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Document Category</label>
                            {docTypes.map(doc => (
                                <div key={doc.type} onClick={() => setSelectedDocType(doc.type)}
                                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2 ${
                                        selectedDocType === doc.type
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

                        {/* Drop Zone */}
                        <div className="space-y-3">
                            <div {...getRootProps()}
                                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer text-center transition-all ${
                                    isDragActive || dragging
                                        ? 'border-[#d4a574] bg-[#d4a574]/5'
                                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'
                                }`}>
                                <input {...getInputProps()} />
                                <CloudArrowUpIcon className={`w-10 h-10 mb-2 ${isDragActive ? 'text-[#d4a574]' : 'text-slate-300'}`} />
                                <p className="text-sm font-semibold text-slate-600 mb-0.5">Drop file here or click</p>
                                <p className="text-xs text-slate-400">PDF, JPG, PNG, TIFF — max 10 MB</p>
                            </div>

                            {/* Camera Option */}
                            <div className="relative">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment" 
                                    id="camera-input"
                                    className="hidden"
                                    onChange={(e) => {
                                        if (e.target.files?.length) {
                                            onDrop(Array.from(e.target.files));
                                        }
                                    }}
                                />
                                <button 
                                    onClick={() => document.getElementById('camera-input').click()}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors shadow-sm"
                                >
                                    <CameraIcon className="w-5 h-5 text-indigo-500" />
                                    Use Device Camera
                                </button>
                            </div>
                        </div>

                        {/* OCR info block */}
                        <div className="mt-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-xs text-indigo-700 flex gap-2 items-start">
                            <MagnifyingGlassIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>Capture or upload, then click <strong>Extract Data</strong> to run OCR. You can review and edit the full text before saving.</span>
                        </div>
                    </motion.div>

                    {/* ── Right: Queue Table ──────────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
                        className="lg:col-span-2 bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex flex-col overflow-hidden"
                    >
                        {/* Queue header */}
                        <div className="p-5 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Document Queue</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Review and process uploaded files</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Search */}
                                <div className="relative">
                                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Search…"
                                        className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 w-36"
                                    />
                                </div>
                                {files.filter(f => f.status === 'extracted').length > 0 && (
                                    <button onClick={bulkApprove}
                                        className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-600 hover:text-white px-3 py-2 rounded-lg border border-emerald-100 transition-all flex items-center gap-1.5 shadow-sm">
                                        <CheckCircleIcon className="w-3.5 h-3.5" />
                                        Approve All
                                    </button>
                                )}
                                {files.some(f => f.status === 'pending' || f.status === 'failed' || f.status === 'uploaded') && (
                                    <button onClick={bulkProcess} disabled={isUploading}
                                        className="text-xs font-bold text-[#d4a574] bg-[#d4a574]/10 hover:bg-[#d4a574] hover:text-[#0f172a] px-3 py-2 rounded-lg border border-[#d4a574]/20 transition-all flex items-center gap-1.5 disabled:opacity-50">
                                        <CloudArrowUpIcon className="w-3.5 h-3.5" />
                                        Process All
                                    </button>
                                )}
                                <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-100">
                                    {files.length} files
                                </span>
                            </div>
                        </div>

                        {/* Table */}
                        {isLoadingData ? (
                            <div className="p-4"><SkeletonLoader type="table" rows={5} /></div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center flex-1 p-12 text-slate-400">
                                <DocumentIcon className="w-14 h-14 mb-3 opacity-30" />
                                <p className="text-sm font-medium text-slate-600">{searchQuery ? 'No matching documents' : 'No documents uploaded yet'}</p>
                                <p className="text-xs mt-1">{searchQuery ? 'Try a different search term' : 'Upload a file from the left panel'}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto flex-1">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                                            <th className="p-4 pl-5 font-semibold">Document</th>
                                            <th className="p-4 font-semibold">Type</th>
                                            <th className="p-4 font-semibold">Size</th>
                                            <th className="p-4 font-semibold">Encoded By</th>
                                            <th className="p-4 text-center font-semibold">Status</th>
                                            <th className="p-4 pr-5 text-right font-semibold">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filtered.map(file => (
                                            <tr key={file.id} className="hover:bg-slate-50/60 transition-colors">
                                                {file.isDeleted ? (
                                                    <td colSpan="6" className="p-4 text-center">
                                                        <span className="text-sm text-slate-500 mr-3">Document temporarily deleted.</span>
                                                        <button onClick={() => undoDelete(file.id)} className="text-xs font-bold text-[#d4a574] border border-[#d4a574]/30 bg-[#d4a574]/10 hover:bg-[#d4a574] hover:text-[#0f172a] px-3 py-1.5 rounded-lg transition-colors">Undo</button>
                                                    </td>
                                                ) : (
                                                <>
                                                <td className="p-4 pl-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-400 flex items-center justify-center shrink-0">
                                                            <DocumentIcon className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p 
                                                                className="text-sm font-semibold text-slate-700 truncate max-w-[18ch] hover:text-[#d4a574] cursor-pointer" 
                                                                title={file.name}
                                                                onClick={() => setPreviewFile(file)}
                                                            >
                                                                {file.name}
                                                            </p>
                                                            {file.extracted_fields?.full_name && (
                                                                <p className="text-xs text-slate-400 truncate">{file.extracted_fields.full_name}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded capitalize">
                                                        {file.detected_type || file.type}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm text-slate-500">{file.size}</td>
                                                <td className="p-4 text-sm text-slate-500">{file.encoded_by || '—'}</td>
                                                <td className="p-4 text-center">{statusBadge(file.status)}</td>
                                                <td className="p-4 pr-5">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {/* Extract / View form */}
                                                        {(file.status === 'pending' || file.status === 'failed' || file.status === 'uploaded') && (
                                                            <button onClick={() => processFile(file.id, file)}
                                                                className="text-xs font-bold text-white bg-[#0f172a] hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                                                                <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                                                                {file.status === 'failed' ? 'Retry' : 'Process OCR'}
                                                            </button>
                                                        )}
                                                        {(file.status === 'extracted') && (
                                                            <>
                                                            <button onClick={() => approveRecord(file.id)}
                                                                className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                                                                title="Quick Approve">
                                                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                                                Approve
                                                            </button>
                                                            <button onClick={() => setActiveOcr({ file, ocrResult: { extracted_fields: file.extracted_fields, detected_type: file.detected_type } })}
                                                                className="text-xs font-bold text-[#d4a574] bg-[#d4a574]/10 border border-[#d4a574]/20 hover:bg-[#d4a574] hover:text-[#0f172a] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                                                                <PencilSquareIcon className="w-3.5 h-3.5" />
                                                                Preview
                                                            </button>
                                                            </>
                                                        )}
                                                        {file.status === 'processed' && (
                                                            <button onClick={() => setActiveOcr({ file, ocrResult: { extracted_fields: file.extracted_fields, detected_type: file.detected_type } })}
                                                                className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                                                                <DocumentCheckIcon className="w-3.5 h-3.5" />
                                                                View Form
                                                            </button>
                                                        )}
                                                        <button onClick={() => removeFile(file.id)}
                                                            className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                                            <TrashIcon className="w-4 h-4" />
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
                    </motion.div>
                </div>
            </motion.div>
        </>
    );
};

export default Documents;
