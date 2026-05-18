import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    DocumentCheckIcon, XMarkIcon, ChevronDoubleDownIcon,
    ExclamationTriangleIcon, ShieldExclamationIcon,
    CloudArrowUpIcon, SparklesIcon
} from '@heroicons/react/24/outline';
import { useData } from './DataContext.jsx';

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

import { BirthConfig, BirthTemplateOverlayFields } from './forms/BirthCertificateConfig.js';
import { DeathConfig } from './forms/DeathCertificateConfig.js';
import { MarriageConfig } from './forms/MarriageCertificateConfig.js';

const FIELD_CONFIG = {
    birth: BirthConfig,
    death: DeathConfig,
    marriage: MarriageConfig
};

const OcrFormPanel = ({ file, docType, ocrResult, onSave, onClose, isViewOnly = false, hideBoxes = false }) => {
    const [isSaving, setIsSaving] = useState(false);
    
    const effectiveType = ocrResult?.detected_type !== 'unknown' ? ocrResult.detected_type : (docType || file.type || 'unknown');
    
    // Normalize and parse extracted fields
    const [formData, setFormData] = useState(() => {
        let ef = ocrResult?.extracted_fields || file.extracted_fields || {};
        if (typeof ef === 'string') {
            try { ef = JSON.parse(ef); } catch (e) { ef = {}; }
        }

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
    const [viewMode, setViewMode] = useState('fields');
    const [showDiagnosticBoxes, setShowDiagnosticBoxes] = useState(hideBoxes); // Toggle state for green grid
    const [showConsent, setShowConsent] = useState(false);
    const [consentGiven, setConsentGiven] = useState(false);
    const [savePending, setSavePending] = useState(false);
    const fieldConfidence = ocrResult?.field_confidence || {};

    /**
     * Returns Tailwind classes for field confidence:
     * - Low confidence  (<0.65) → amber border + faint yellow bg
     * - Medium          (<0.85) → slate border (default)
     * - High            (>=0.85) → emerald ring flash (only on first load)
     */
    const getConfidenceClass = (fieldKey, hasError) => {
        if (hasError) return 'border-rose-300 bg-rose-50/20 focus:ring-rose-100';
        const meta = fieldConfidence[fieldKey];
        if (!meta) return 'border-slate-200 focus:ring-slate-100 focus:border-slate-400 shadow-sm';
        if (meta.low_confidence || meta.confidence < 0.65) {
            return 'border-amber-300 bg-amber-50/30 focus:ring-amber-100 focus:border-amber-400 shadow-sm';
        }
        return 'border-slate-200 focus:ring-slate-100 focus:border-slate-400 shadow-sm';
    };

    const isLowConf = (fieldKey) => {
        const meta = fieldConfidence[fieldKey];
        return meta && (meta.low_confidence || meta.confidence < 0.65);
    };

    const meta = useMemo(() => {
        try { return typeof file.metadata === 'string' ? JSON.parse(file.metadata) : (file.metadata || {}); }
        catch (e) { return {}; }
    }, [file.metadata]);

    const quickFillUsed = !!(ocrResult?.quick_fill_used || meta.quick_fill_used);
    const templateFamilyDetected = ocrResult?.template_family_detected || meta.template_family_detected || 'Not Detected';
    const templateOverlay = ocrResult?.template_overlay || null;

    const { templates } = useData();
    
    // Find a matching professional template for this document type
    const matchedTemplate = templates.find(t => {
        const tType = (t.type || '').toLowerCase();
        const eType = (effectiveType || '').toLowerCase();
        return (tType === eType || tType.includes(eType) || eType.includes(tType)) && t.config;
    }) || templates.find(t => {
        const tType = (t.type || '').toLowerCase();
        const eType = (effectiveType || '').toLowerCase();
        return tType === eType || tType.includes(eType) || eType.includes(tType);
    });

    // Sync form data if background extraction finishes while modal is open
    useEffect(() => {
        // --- FIELD SYNC ---
        // Prioritize ocrResult (fresh from server) over file.extracted_fields (saved in DB)
        const rawFields = ocrResult?.extracted_fields || file.extracted_fields;
        if (rawFields) {
            let parsed = rawFields;
            if (typeof rawFields === 'string') {
                try { parsed = JSON.parse(rawFields); } catch (e) { console.error("Parse error", e); }
            }
            
            if (parsed && typeof parsed === 'object') {
                setFormData(prev => {
                    const next = { ...prev };
                    let changed = false;
                    
                    // We loop through our known field configuration to map the incoming data
                    const configSections = FIELD_CONFIG[effectiveType] || FIELD_CONFIG.birth;
                    configSections.forEach(section => {
                        section.fields.forEach(f => {
                            // Only fill if current value is empty OR if this is a fresh OCR result
                            const newValue = parsed[f.key];
                            if (newValue && newValue !== prev[f.key]) {
                                let val = newValue;
                                // Basic date normalization
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
            }
        }

        // --- TEXT SYNC ---
        const newText = ocrResult?.text || file.ocr_text;
        if (newText && newText !== ocrText) {
            setOcrText(newText);
        }
    }, [file.extracted_fields, ocrResult, file.ocr_text, effectiveType]);

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
                            
                            {!isViewOnly && (
                                <button 
                                    onClick={(e) => handleSubmit(e, true)}
                                    className="mt-8 px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
                                >
                                    Minimize & Continue Working
                                </button>
                            )}
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
                        {!isViewOnly && (
                            <button 
                                onClick={(e) => handleSubmit(e, true)}
                                title="Minimize to Tray"
                                className="text-slate-400 hover:text-indigo-600 p-2 rounded-xl hover:bg-indigo-50 transition-all cursor-pointer"
                            >
                                <ChevronDoubleDownIcon className="w-6 h-6" />
                            </button>
                        )}
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
                        <div className="flex-1 rounded-xl bg-white border border-slate-200 overflow-hidden relative flex items-center justify-center">
                            <img
                                src={`/api/documents/view/${file.id || file.file_id || file.document_id || file.realId}?raw=1&t=${new Date().getTime()}`}
                                className="w-full h-full object-contain"
                                alt="Original Scan"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    const iframe = document.createElement('iframe');
                                    iframe.src = e.target.src;
                                    iframe.className = "w-full h-full border-0";
                                    e.target.parentNode.appendChild(iframe);
                                }}
                            />
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
                                                                className={`w-full px-4 py-3.5 text-[15px] font-medium border rounded-2xl bg-white focus:outline-none focus:ring-4 transition-all ${getConfidenceClass(field.key, errors[field.key])}`}
                                                            >
                                                                <option value="">Select…</option>
                                                                {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                                                            </select>
                                                        ) : (
                                                            <div className="relative">
                                                                <input
                                                                    type={field.type === 'date' ? 'date' : 'text'}
                                                                    value={formData[field.key] || ''}
                                                                    onChange={e => {
                                                                        setFormData(p => ({ ...p, [field.key]: e.target.value }));
                                                                        if (errors[field.key]) setErrors(p => ({ ...p, [field.key]: false }));
                                                                    }}
                                                                    required={field.required}
                                                                    placeholder={`…`}
                                                                    className={`w-full px-4 py-3.5 text-[15px] font-medium border rounded-2xl bg-white focus:outline-none focus:ring-4 transition-all placeholder-slate-300 ${getConfidenceClass(field.key, errors[field.key])}`}
                                                                />
                                                                {isLowConf(field.key) && (
                                                                    <span
                                                                        title="Low OCR confidence — please verify this value"
                                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400"
                                                                    >
                                                                        <ExclamationTriangleIcon className="w-4 h-4" />
                                                                    </span>
                                                                )}
                                                            </div>
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
                                            Professional layout using calibrated clean templates.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 bg-slate-100 p-1 rounded-xl">
                                        <button 
                                            onClick={() => setShowDiagnosticBoxes(false)}
                                            className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${!showDiagnosticBoxes ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Clean View
                                        </button>
                                        <button 
                                            onClick={() => setShowDiagnosticBoxes(true)}
                                            className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${showDiagnosticBoxes ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Diagnostic Grid
                                        </button>
                                    </div>
                                </div>

                                {matchedTemplate ? (
                                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-inner">
                                        <div className="relative w-full overflow-hidden" style={{ minHeight: '600px' }}>
                                            <img
                                                src={`/api/templates/preview?file=${matchedTemplate.file_path}`}
                                                className="w-full h-auto block"
                                                alt="Professional Template Background"
                                            />

                                            {(effectiveType === 'birth' ? BirthTemplateOverlayFields : matchedTemplate?.config?.fields)?.map((item) => {
                                                const value = formData[item.key] || '';
                                                const label = item.label || item.key;
                                                return (
                                                    <div
                                                        key={item.key}
                                                        className={`absolute flex flex-col justify-center px-0.5 rounded-px shadow-sm transition-all ${!showDiagnosticBoxes ? '' : 'border border-emerald-400/50 bg-emerald-50/30 shadow-sm backdrop-blur-[0.5px]'}`}
                                                        style={{
                                                            left: `${(item.x || 0) * 100}%`,
                                                            top: `${(item.y || 0) * 100}%`,
                                                            width: `${(item.w || 0) * 100}%`,
                                                            height: `${(item.h || 0) * 80}%`, // Scaling down height slightly
                                                        }}
                                                        title={`${label}`}
                                                    >
                                                        {showDiagnosticBoxes && (
                                                            <div className="text-[4px] font-black text-emerald-800/80 uppercase tracking-tighter absolute -top-1 left-0 whitespace-nowrap bg-white/90 px-0.5 rounded-px shadow-xs z-10 leading-none py-0.2">
                                                                {label}
                                                            </div>
                                                        )}
                                                        <div className={`font-black text-slate-950 tracking-tight truncate px-0.5 leading-none ${!showDiagnosticBoxes ? 'text-[8px] md:text-[10px]' : 'text-[6px] md:text-[7px]'}`}>
                                                            {value || (!showDiagnosticBoxes ? '' : '—')}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : !file.name?.toLowerCase().endsWith('.pdf') && templateOverlay?.enabled ? (
                                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                                        <div className="relative w-full">
                                            <img
                                                src={`/api/documents/view/${file.id}?raw=1&t=${new Date(file.updated_at || Date.now()).getTime()}`}
                                                className="w-full h-auto block"
                                                alt="Scan Overlay"
                                            />
                                            {effectiveType === 'birth' ? (
                                                BirthTemplateOverlayFields.map((item) => {
                                                    const value = formData[item.key] || '';
                                                    return (
                                                        <div
                                                            key={item.key}
                                                            className="absolute border-2 border-emerald-400 bg-emerald-100/50 rounded-lg text-[10px] p-1 backdrop-blur-[1px]"
                                                            style={{
                                                                left: `${item.x * 100}%`,
                                                                top: `${item.y * 100}%`,
                                                                width: `${item.w * 100}%`,
                                                                minHeight: `${item.h * 100}%`,
                                                            }}
                                                            title={item.label}
                                                        >
                                                            <div className="font-bold uppercase tracking-wide text-[9px] truncate">{item.label}</div>
                                                            <div className="font-semibold truncate text-slate-800">{value || '—'}</div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                templateOverlay.fields.map((item) => {
                                                    const roi = item.roi || [];
                                                    const [x1, y1, x2, y2] = roi;
                                                    
                                                    // Map backend overlay keys to our structured form data so the preview updates live
                                                    let derivedValue = '';
                                                    const k = item.key?.toLowerCase() || '';
                                                    
                                                    if (k.includes('child name')) {
                                                        derivedValue = [formData.first_name, formData.middle_name, formData.last_name].filter(Boolean).join(' ');
                                                    } else if (k.includes('mother name')) {
                                                        derivedValue = [formData.mother_first_name, formData.mother_middle_name, formData.mother_last_name].filter(Boolean).join(' ');
                                                    } else if (k.includes('father name')) {
                                                        derivedValue = [formData.father_first_name, formData.father_middle_name, formData.father_last_name].filter(Boolean).join(' ');
                                                    } else if (k.includes('place of birth')) {
                                                        derivedValue = [formData.place_of_birth_hospital, formData.place_of_birth_city, formData.place_of_birth_province].filter(Boolean).join(', ');
                                                    } else if (k.includes('type of birth')) {
                                                        derivedValue = formData.type_of_birth || '';
                                                    } else if (k.includes('sex')) {
                                                        derivedValue = formData.sex || '';
                                                    } else {
                                                        derivedValue = formData[item.key] || item.value || '';
                                                    }

                                                    const value = derivedValue || item.value || '';
                                                    const label = fieldLabelMap[item.key] || item.key;
                                                    return (
                                                    <div
                                                        key={item.key}
                                                        className={`absolute rounded-lg transition-all ${!showDiagnosticBoxes ? '' : 'border-2 border-emerald-400 bg-emerald-100/50 p-1 backdrop-blur-[1px]'}`}
                                                        style={{
                                                            left: `${(x1 || 0) * 100}%`,
                                                            top: `${(y1 || 0) * 100}%`,
                                                            width: `${Math.max(((x2 || 0) - (x1 || 0)) * 100, 6)}%`,
                                                            minHeight: `${Math.max(((y2 || 0) - (y1 || 0)) * 100, 4)}%`,
                                                        }}
                                                        title={`${label}`}
                                                    >
                                                        {showDiagnosticBoxes && (
                                                            <div className="font-bold uppercase tracking-wide text-[9px]">
                                                                {label}
                                                            </div>
                                                        )}
                                                        <div className={`font-black text-slate-950 truncate leading-none ${!showDiagnosticBoxes ? 'text-[8px] md:text-[10px]' : 'text-[6px] md:text-[7px] font-semibold'}`}>
                                                            {value || (!showDiagnosticBoxes ? '' : '—')}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                                        <div className="text-4xl mb-4 grayscale opacity-40">📄</div>
                                        <p className="text-sm font-bold text-slate-700">No Overlay Configured</p>
                                        <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto">
                                            To see a professional preview, please configure the <b>{effectiveType}</b> template in the Template Registry.
                                        </p>
                                    </div>
                                )}

                                {ocrResult?.field_confidence && (
                                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                                        <p className="text-xs font-bold text-slate-700 mb-2">Extraction Confidence</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {Object.entries(ocrResult.field_confidence).map(([key, meta]) => (
                                                <div key={key} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-xs flex items-center justify-between gap-2">
                                                    <span className="font-semibold text-slate-700">{fieldLabelMap[key] || key}</span>
                                                    <span className={`font-bold ${meta?.validation_passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {Math.round(Number(meta?.confidence || 0) * 100)}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="pt-6 border-t border-slate-100">
                                {isViewOnly ? (
                                    <button
                                        onClick={onClose}
                                        className="w-full py-4 rounded-xl font-extrabold text-base shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white shadow-slate-200"
                                    >
                                        <XMarkIcon className="w-6 h-6" />
                                        Close Professional Preview
                                    </button>
                                ) : (
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
                                )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

export default OcrFormPanel;
