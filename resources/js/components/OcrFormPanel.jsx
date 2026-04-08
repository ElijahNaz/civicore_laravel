import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    DocumentCheckIcon, XMarkIcon, ChevronDoubleDownIcon,
    ExclamationTriangleIcon, ShieldExclamationIcon,
    CloudArrowUpIcon
} from '@heroicons/react/24/outline';

// ── Helper: compute age from a date string ───────────────────────────────────
export function computeAge(dobString) {
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
export const ParentalConsentModal = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-slate-900 leading-normal">
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
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
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
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors cursor-pointer"
                >
                    Confirm & Continue
                </button>
            </div>
        </motion.div>
    </div>
);

const NAIC_BARANGAYS = [
    'Gomez-Zamora (Pob.)', 'Capt. C. Nazareno (Pob.)', 'Ibayo Silangan', 'Ibayo Estacion', 'Kanluran',
    'Makina', 'Sapa', 'Bucana Malaki', 'Bucana Sasahan', 'Bagong Karsada',
    'Balsahan', 'Bancaan', 'Muzon', 'Latoria', 'Labac',
    'Mabolo', 'San Roque', 'Santulan', 'Molino', 'Calubcob',
    'Halang', 'Malainen Bago', 'Malainen Luma', 'Palangue 1', 'Palangue 2 & 3',
    'Humbac', 'Munting Mapino', 'Sabang', 'Timalan Balsahan', 'Timalan Concepcion'
].sort();

const FIELD_CONFIG = {
    birth: [
        { key: 'full_name', label: 'Full Name', type: 'text', required: true },
        { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
        { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'], required: false },
        { key: 'place_of_birth', label: 'Place of Birth', type: 'text', required: false },
        { key: 'fathers_name', label: "Father's Name", type: 'text', required: false },
        { key: 'mothers_name', label: "Mother's Name", type: 'text', required: false },
        { key: 'barangay', label: 'Barangay', type: 'select', options: NAIC_BARANGAYS, required: false },
    ],
    death: [
        { key: 'full_name', label: 'Full Name', type: 'text', required: true },
        { key: 'date_of_death', label: 'Date of Death', type: 'date', required: true },
        { key: 'age', label: 'Age', type: 'text', required: false },
        { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'], required: false },
        { key: 'place_of_death', label: 'Place of Death', type: 'text', required: false },
        { key: 'cause_of_death', label: 'Cause of Death', type: 'text', required: false },
        { key: 'barangay', label: 'Barangay', type: 'select', options: NAIC_BARANGAYS, required: false },
    ],
    marriage: [
        { key: 'husbands_name', label: "Husband's Name", type: 'text', required: true },
        { key: 'wifes_name', label: "Wife's Name", type: 'text', required: true },
        { key: 'date_of_marriage', label: 'Date of Marriage', type: 'date', required: false },
        { key: 'place_of_marriage', label: 'Place of Marriage', type: 'text', required: false },
        { key: 'barangay', label: 'Barangay', type: 'select', options: NAIC_BARANGAYS, required: false },
    ],
};

const OcrFormPanel = ({ file, docType, ocrResult, onSave, onClose }) => {
    const [isSaving, setIsSaving] = useState(false);
    
    const effectiveType = ocrResult?.detected_type !== 'unknown' ? ocrResult.detected_type : (docType || file.type || 'birth');
    const fields = FIELD_CONFIG[effectiveType] || FIELD_CONFIG.birth;
    
    // Normalize extracted fields
    const ef = ocrResult?.extracted_fields || file.extracted_fields || {};

    const [formData, setFormData] = useState(() => {
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

    const [ocrText, setOcrText] = useState(file.ocr_text || ocrResult?.text || '');
    const [viewMode, setViewMode] = useState('text');
    const [showConsent, setShowConsent] = useState(false);
    const [consentGiven, setConsentGiven] = useState(false);
    const [savePending, setSavePending] = useState(false);

    const typeMismatch = ocrResult?.type_mismatch;
    const mismatchMessage = ocrResult?.mismatch_message;

    const age = effectiveType === 'birth' ? computeAge(formData.date_of_birth) : null;
    const isMinor = age !== null && age < 18;

    const handleSubmit = (e, minimize = false) => {
        if (e) e.preventDefault();
        if (isMinor && !consentGiven) {
            setShowConsent(true);
            return;
        }
        setIsSaving(true);
        onSave({ 
            fields: formData, 
            ocr_text: ocrText, 
            parentalConsent: consentGiven, 
            detectedType: effectiveType,
            minimizeRequested: minimize
        });
    };

    useEffect(() => {
        if (savePending && consentGiven) {
            setSavePending(false);
            setIsSaving(true);
            onSave({ 
                fields: formData, 
                ocr_text: ocrText, 
                parentalConsent: true, 
                detectedType: effectiveType,
                minimizeRequested: false
            });
        }
    }, [savePending, consentGiven]);

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <AnimatePresence>
                {showConsent && (
                    <ParentalConsentModal
                        onConfirm={() => { setConsentGiven(true); setShowConsent(false); setSavePending(true); }}
                        onCancel={() => setShowConsent(false)}
                    />
                )}
            </AnimatePresence>

            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col relative"
            >
                {/* Saving Overlay */}
                <AnimatePresence>
                    {isSaving && (
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[100] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center"
                        >
                            <div className="relative">
                                <div className="w-24 h-24 border-4 border-indigo-100 rounded-full animate-spin border-t-indigo-500" />
                                <CloudArrowUpIcon className="w-10 h-10 text-indigo-500 absolute inset-0 m-auto animate-pulse" />
                            </div>
                            <h3 className="mt-6 text-xl font-black text-slate-900 tracking-tight">Securing Data to Registry...</h3>
                            <p className="text-sm text-slate-400 mt-2">Almost there! We're syncing your changes now.</p>
                            
                            <button 
                                onClick={(e) => handleSubmit(e, true)}
                                className="mt-8 px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
                            >
                                Minimize & Continue Working
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex items-center justify-between px-8 py-7 border-b border-slate-100 bg-slate-50/90 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shadow-sm">
                            <DocumentCheckIcon className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight leading-none">Extracted Document Data</h3>
                            <p className="text-xs font-semibold text-slate-400 mt-1.5 flex items-center gap-1.5 backdrop-blur-sm">
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                {file?.name}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={(e) => handleSubmit(e, true)}
                            title="Minimize to Tray"
                            className="text-slate-400 hover:text-indigo-600 p-2 rounded-xl hover:bg-indigo-50 transition-all cursor-pointer"
                        >
                            <ChevronDoubleDownIcon className="w-6 h-6" />
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-rose-600 p-2 rounded-xl hover:bg-rose-50 transition-all cursor-pointer">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-1/2 border-r border-slate-100 bg-slate-50 p-4 flex flex-col">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Original Document</span>
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase">Reference Only</span>
                        </div>
                        <div className="flex-1 rounded-xl bg-white border border-slate-200 overflow-hidden relative">
                            {file.name?.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                    src={`/api/documents/download/${file.id}?raw=1&t=${new Date(file.updated_at || Date.now()).getTime()}`}
                                    className="w-full h-full border-0"
                                    title="Original PDF"
                                />
                            ) : (
                                <img
                                    src={`/api/documents/download/${file.id}?raw=1&t=${new Date(file.updated_at || Date.now()).getTime()}`}
                                    className="w-full h-full object-contain"
                                    alt="Original Scan"
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-5">
                        <div className="flex p-1 bg-slate-100 rounded-xl w-fit">
                            <button
                                onClick={() => setViewMode('text')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${viewMode === 'text' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Full Extracted Text
                            </button>
                            <button
                                onClick={() => setViewMode('fields')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${viewMode === 'fields' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Structured Fields
                            </button>
                        </div>

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
                                {typeMismatch && (
                                    <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                                        <ExclamationTriangleIcon className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-bold text-rose-700">Document Type Mismatch</p>
                                            <p className="text-sm text-rose-600 mt-0.5">{mismatchMessage}</p>
                                        </div>
                                    </div>
                                )}

                                {isMinor && (
                                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                                        <p className="text-sm font-bold text-amber-700">Minor Person (Age: {age})</p>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                </div>
                            </>
                        )}

                        <div className="pt-6 border-t border-slate-100">
                             <button
                                onClick={handleSubmit}
                                className="w-full py-3.5 bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl font-extrabold text-sm shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <DocumentCheckIcon className="w-5 h-5 text-emerald-400" />
                                Save & Sync Changes
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

export default OcrFormPanel;
