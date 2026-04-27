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

const SUFFIX_OPTIONS = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'M.D.', 'Esq.', 'Ph.D.'];

const NAME_FIELDS = (prefix = '') => [
    { key: `${prefix}last_name`, label: 'Surname', type: 'text', required: true, width: 'sm:col-span-1' },
    { key: `${prefix}first_name`, label: 'First Name', type: 'text', required: true, width: 'sm:col-span-1' },
    { key: `${prefix}middle_name`, label: 'Middle Name', type: 'text', required: false, width: 'sm:col-span-1' },
    { key: `${prefix}suffix`, label: 'Suffix', type: 'select', options: SUFFIX_OPTIONS, required: false, width: 'sm:col-span-1' },
];

const FIELD_CONFIG = {
    birth: [
        { section: 'Child Identity', fields: NAME_FIELDS('') },
        { fields: [
            { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
            { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'], required: true },
            { key: 'place_of_birth', label: 'Place of Birth', type: 'text', required: false },
            { key: 'barangay', label: 'Barangay', type: 'select', options: NAIC_BARANGAYS, required: true },
        ]},
        { section: "Father's Lineage", fields: NAME_FIELDS('father_') },
        { section: "Mother's Lineage", fields: NAME_FIELDS('mother_') },
    ],
    death: [
        { section: 'Deceased Person', fields: NAME_FIELDS('') },
        { fields: [
            { key: 'date_of_death', label: 'Date of Death', type: 'date', required: true },
            { key: 'age', label: 'Age', type: 'text', required: false, width: 'sm:col-span-1' },
            { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'], required: true, width: 'sm:col-span-1' },
            { key: 'place_of_death', label: 'Place of Death', type: 'text', required: false },
            { key: 'cause_of_death', label: 'Cause of Death', type: 'text', required: false },
            { key: 'barangay', label: 'Barangay', type: 'select', options: NAIC_BARANGAYS, required: true },
        ]}
    ],
    marriage: [
        { section: "Husband's Profile", fields: NAME_FIELDS('husband_') },
        { section: "Wife's Profile", fields: NAME_FIELDS('wife_') },
        { section: 'Registry Details', fields: [
            { key: 'date_of_marriage', label: 'Date of Marriage', type: 'date', required: false },
            { key: 'place_of_marriage', label: 'Place of Marriage', type: 'text', required: false },
            { key: 'barangay', label: 'Barangay', type: 'select', options: NAIC_BARANGAYS, required: true },
        ]}
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
        const configSections = FIELD_CONFIG[effectiveType] || FIELD_CONFIG.birth;
        
        configSections.forEach(section => {
            section.fields.forEach(f => {
                let val = ef[f.key] || '';
                if (f.type === 'date' && val) {
                    const d = new Date(val.replace(/[^0-9a-zA-Z/-]/g, ' '));
                    if (!isNaN(d.getTime())) {
                        val = d.toISOString().split('T')[0];
                    }
                }
                init[f.key] = val;
            });
        });
        return init;
    });

    const [ocrText, setOcrText] = useState(file.ocr_text || ocrResult?.text || '');
    const [viewMode, setViewMode] = useState('text');
    const [showConsent, setShowConsent] = useState(false);
    const [consentGiven, setConsentGiven] = useState(false);
    const [savePending, setSavePending] = useState(false);
    const fieldConfidence = ocrResult?.field_confidence || {};
    const quickFillUsed = !!ocrResult?.quick_fill_used;
    const templateOverlay = ocrResult?.template_overlay || null;

    // Sync form data if background extraction finishes while modal is open
    useEffect(() => {
        const latestFields = ocrResult?.extracted_fields || file.extracted_fields;
        if (latestFields && Object.keys(latestFields).length > 0) {
            setFormData(prev => {
                const next = { ...prev };
                let changed = false;
                
                const configSections = FIELD_CONFIG[effectiveType] || FIELD_CONFIG.birth;
                configSections.forEach(section => {
                    section.fields.forEach(f => {
                        // Only fill if the current value is empty to avoid overwriting user typing
                        if (!next[f.key] && latestFields[f.key]) {
                            let val = latestFields[f.key];
                            if (f.type === 'date' && val) {
                                const d = new Date(val.replace(/[^0-9a-zA-Z/-]/g, ' '));
                                if (!isNaN(d.getTime())) {
                                    val = d.toISOString().split('T')[0];
                                }
                            }
                            next[f.key] = val;
                            changed = true;
                        }
                    });
                });
                
                return changed ? next : prev;
            });
            
            if (!ocrText && (file.ocr_text || ocrResult?.text)) {
                setOcrText(file.ocr_text || ocrResult?.text);
            }
        }
    }, [file.extracted_fields, ocrResult, effectiveType]);

    const typeMismatch = ocrResult?.type_mismatch;
    const mismatchMessage = ocrResult?.mismatch_message;

    const age = effectiveType === 'birth' ? computeAge(formData.date_of_birth) : null;
    const isMinor = age !== null && age < 18;

    const [errors, setErrors] = useState({});
    const fieldLabelMap = {};
    (FIELD_CONFIG[effectiveType] || FIELD_CONFIG.birth).forEach(section => {
        section.fields.forEach(f => {
            fieldLabelMap[f.key] = f.label;
        });
    });

    const handleSubmit = (e, minimize = false) => {
        if (e) e.preventDefault();
        
        // --- Strict Validation ---
        const configSections = FIELD_CONFIG[effectiveType] || FIELD_CONFIG.birth;
        const newErrors = {};
        let firstErrorField = null;

        configSections.forEach(section => {
            section.fields.forEach(f => {
                if (f.required && !formData[f.key]) {
                    newErrors[f.key] = true;
                    if (!firstErrorField) firstErrorField = f.label;
                }
            });
        });

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            // Focus the first error field automatically
            setTimeout(() => {
                const firstError = document.querySelector('.border-rose-300');
                if (firstError) firstError.focus();
            }, 100);
            return;
        }

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
                        <button onClick={onClose} className="text-slate-400 hover:text-rose-600 p-2 rounded-xl hover:bg-rose-50 transition-all cursor-pointer group">
                            <XMarkIcon className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-[35%] border-r border-slate-100 bg-slate-50 p-4 flex flex-col">
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
                            <button
                                onClick={() => setViewMode('template')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${viewMode === 'template' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Template Preview
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

                                <div className="space-y-12">
                                    {(FIELD_CONFIG[effectiveType] || FIELD_CONFIG.birth).map((section, sIdx) => (
                                        <div key={sIdx} className="space-y-4">
                                            {section.section && (
                                                <div className="flex items-center gap-3 mb-6">
                                                    <h4 className="text-base font-black text-slate-900 uppercase tracking-wider">{section.section}</h4>
                                                    <div className="flex-1 h-px bg-slate-100"></div>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                                                {section.fields.map(field => (
                                                    <div key={field.key} className={field.width || 'sm:col-span-1'}>
                                                        <label className={`block text-[11px] font-black uppercase tracking-widest mb-2.5 transition-colors ${errors[field.key] ? 'text-rose-500' : 'text-slate-500'}`}>
                                                            {field.label} {field.required && <span className="text-rose-400">*</span>}
                                                        </label>
                                                        {field.type === 'select' ? (
                                                            <select
                                                                value={formData[field.key] || ''}
                                                                onChange={e => {
                                                                    setFormData(p => ({ ...p, [field.key]: e.target.value }));
                                                                    if (errors[field.key]) setErrors(p => ({ ...p, [field.key]: false }));
                                                                }}
                                                                className={`w-full px-4 py-3.5 text-[15px] font-medium border rounded-2xl bg-white focus:outline-none focus:ring-4 transition-all ${errors[field.key] ? 'border-rose-300 bg-rose-50/20 focus:ring-rose-100' : 'border-slate-200 focus:ring-slate-100 focus:border-slate-400 shadow-sm'}`}
                                                            >
                                                                <option value="">Select…</option>
                                                                {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                                                            </select>
                                                        ) : (
                                                            <input
                                                                type={field.type === 'date' ? 'date' : 'text'}
                                                                value={formData[field.key] || ''}
                                                                onChange={e => {
                                                                    setFormData(p => ({ ...p, [field.key]: e.target.value }));
                                                                    if (errors[field.key]) setErrors(p => ({ ...p, [field.key]: false }));
                                                                }}
                                                                required={field.required}
                                                                placeholder={`…`}
                                                                className={`w-full px-4 py-3.5 text-[15px] font-medium border rounded-2xl bg-white focus:outline-none focus:ring-4 transition-all placeholder-slate-300 ${errors[field.key] ? 'border-rose-300 bg-rose-50/20 focus:ring-rose-100' : 'border-slate-200 focus:ring-slate-100 focus:border-slate-400 shadow-sm'}`}
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {viewMode === 'template' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-wider text-slate-600">
                                            Template Overlay Preview
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-1">
                                            Background scan + positioned field layers for real-time validation/editing.
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-[11px] font-bold ${quickFillUsed ? 'text-emerald-600' : 'text-amber-600'}`}>
                                            {quickFillUsed ? 'Quick-fill Active' : 'Fallback OCR Active'}
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                            Template: {templateOverlay?.family || ocrResult?.template_family_detected || 'not detected'}
                                        </p>
                                    </div>
                                </div>

                                {!file.name?.toLowerCase().endsWith('.pdf') && templateOverlay?.enabled ? (
                                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                                        <div className="relative w-full">
                                            <img
                                                src={`/api/documents/download/${file.id}?raw=1&t=${new Date(file.updated_at || Date.now()).getTime()}`}
                                                className="w-full h-auto block"
                                                alt="Template Background"
                                            />

                                            {templateOverlay.fields.map((item) => {
                                                const roi = item.roi || [];
                                                const [x1, y1, x2, y2] = roi;
                                                const conf = Number(item.confidence || 0);
                                                const isValid = !!item.validation_passed;
                                                const value = formData[item.key] || item.value || '';
                                                const label = fieldLabelMap[item.key] || item.key;
                                                return (
                                                    <div
                                                        key={item.key}
                                                        className={`absolute border-2 rounded-lg text-[10px] p-1 backdrop-blur-[1px] ${
                                                            isValid ? 'border-emerald-400 bg-emerald-100/50' : 'border-rose-400 bg-rose-100/60'
                                                        }`}
                                                        style={{
                                                            left: `${(x1 || 0) * 100}%`,
                                                            top: `${(y1 || 0) * 100}%`,
                                                            width: `${Math.max(((x2 || 0) - (x1 || 0)) * 100, 6)}%`,
                                                            minHeight: `${Math.max(((y2 || 0) - (y1 || 0)) * 100, 4)}%`,
                                                        }}
                                                        title={`${label} (${Math.round(conf * 100)}%)`}
                                                    >
                                                        <div className="font-bold uppercase tracking-wide text-[9px]">{label}</div>
                                                        <div className="font-semibold truncate">{value || '—'}</div>
                                                        <div className="text-[9px] opacity-80">{Math.round(conf * 100)}%</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                                        {file.name?.toLowerCase().endsWith('.pdf')
                                            ? 'Template overlay for PDF preview is not enabled in this first version. Use image scan files for overlay, or continue with Structured Fields.'
                                            : 'No ROI overlay data available yet. Run OCR on a recognized template family to generate positioned field boxes.'}
                                    </div>
                                )}

                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-xs font-bold text-slate-700 mb-2">Field Confidence</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {Object.entries(fieldConfidence).map(([key, meta]) => (
                                            <div key={key} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-xs flex items-center justify-between gap-2">
                                                <span className="font-semibold text-slate-700">{fieldLabelMap[key] || key}</span>
                                                <span className={`font-bold ${meta?.validation_passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {Math.round(Number(meta?.confidence || 0) * 100)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pt-6 border-t border-slate-100">
                              <button
                                onClick={handleSubmit}
                                disabled={isSaving}
                                className={`w-full py-4 rounded-xl font-extrabold text-base shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer ${isSaving ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#0f172a] hover:bg-slate-800 text-white shadow-slate-200'}`}
                            >
                                {isSaving ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <DocumentCheckIcon className="w-6 h-6 text-emerald-400" />
                                        Save & Sync Changes
                                    </>
                                )}
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
