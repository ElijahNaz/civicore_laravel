import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PrinterIcon, DocumentMinusIcon,
    MagnifyingGlassIcon, PlusCircleIcon,
    AdjustmentsHorizontalIcon, EyeIcon,
    TrashIcon, CheckCircleIcon, ClockIcon, ArrowDownTrayIcon,
    PencilSquareIcon, ShieldCheckIcon, XMarkIcon, ArrowPathIcon,
    ChevronDownIcon, ChevronUpIcon
} from '@heroicons/react/24/outline';
import { useModal } from './ModalContext.jsx';
import SkeletonLoader from './SkeletonLoader.jsx';
import { useData } from './DataContext.jsx';
import OcrFormPanel from './OcrFormPanel.jsx';
import PasswordConfirmModal from './PasswordConfirmModal.jsx';
import ActionConfirmModal from './ActionConfirmModal.jsx';
import axios from 'axios';

const NAIC_BARANGAYS = [
    'Gomez-Zamora (Pob.)', 'Capt. C. Nazareno (Pob.)', 'Ibayo Silangan', 'Ibayo Estacion', 'Kanluran',
    'Makina', 'Sapa', 'Bucana Malaki', 'Bucana Sasahan', 'Bagong Karsada',
    'Balsahan', 'Bancaan', 'Muzon', 'Latoria', 'Labac',
    'Mabolo', 'San Roque', 'Santulan', 'Molino', 'Calubcob',
    'Halang', 'Malainen Bago', 'Malainen Luma', 'Palangue 1', 'Palangue 2 & 3',
    'Humbac', 'Munting Mapino', 'Sabang', 'Timalan Balsahan', 'Timalan Concepcion'
].sort();

const Issuances = () => {
    const { showAlert } = useModal();
    const {
        issuances: rawIssuances,
        documents: rawDocuments,
        loading: dataLoading,
        backgroundTasks,
        runBackgroundTask,
        refreshIssuances,
        refreshDocuments,
        refreshStats,
        refreshAll
    } = useData();

    const isLoading = dataLoading.issuances || dataLoading.documents;
    const [selectedType, setSelectedType] = useState('all');
    const [selectedBarangay, setSelectedBarangay] = useState('all');
    const [selectedEncoder, setSelectedEncoder] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('database');

    // Unified state
    const [certificates, setCertificates] = useState([]);
    const [activityLogs, setActivityLogs] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState([]);
    const [isBarMinimized, setIsBarMinimized] = useState(false);

    // Activity History Search/Filter
    const [historySearch, setHistorySearch] = useState('');
    const [historyActionFilter, setHistoryActionFilter] = useState('all');
    const [historyUserFilter, setHistoryUserFilter] = useState('all');
    const [historyStartDate, setHistoryStartDate] = useState('');
    const [historyEndDate, setHistoryEndDate] = useState('');

    // Confirmation State
    const [confirmAction, setConfirmAction] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null,
        type: 'info'
    });

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = (idsToToggle) => {
        const allSelected = idsToToggle.every(id => selectedIds.includes(id));
        if (allSelected) {
            setSelectedIds(prev => prev.filter(id => !idsToToggle.includes(id)));
        } else {
            setSelectedIds(prev => [...new Set([...prev, ...idsToToggle])]);
        }
    };

    // Helper to wrap actions with confirmation
    const withConfirmation = (actionData) => {
        setConfirmAction({
            isOpen: true,
            title: actionData.title,
            message: actionData.message,
            type: actionData.type || 'info',
            onConfirm: () => {
                actionData.action();
                setConfirmAction(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    // Security Modal State
    const [passwordModal, setPasswordModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    // Editing State
    const [editingCert, setEditingCert] = useState(null);

    useEffect(() => {
        // Create a set of IDs that are already issued to prevent duplicates
        // Use Number() to ensure type consistency across database drivers
        const issuedDocIds = new Set(rawIssuances.map(i => i.document_id ? Number(i.document_id) : null).filter(id => id !== null));

        const combined = [
            // Finalized Issuances (The main records)
            ...rawIssuances.map(i => ({
                id: `iss-${i.id}`,
                realId: i.id,
                number: i.certNumber || i.number || ('ISS-' + i.id),
                type: (i.type || 'unknown').toLowerCase(),
                name: i.name || 'Unnamed Record',
                barangay: i.barangay || '—',
                date: i.issuanceDate || i.date,
                status: 'Issued',
                encoded_by: i.encoded_by,
                source: 'issuance',
                raw: {
                    ...i,
                    // Normalize data structure for the edit form panel
                    extracted_fields: i.extracted_data || i.extracted_fields
                }
            }))
        ];
        // Sort by date descending
        combined.sort((a, b) => new Date(b.date) - new Date(a.date));
        setCertificates(combined);
    }, [rawIssuances, rawDocuments]);

    // Initial Data Fetching
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get('/api/users', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
                // The API returns paginated data: { data: [...], meta: {...} }
                setAllUsers(res.data.data || []);
            } catch (e) {
                console.error("Error fetching users:", e);
                setAllUsers([]);
            }
        };
        fetchUsers();
    }, []);

    // Fetch Activity Logs when History tab is active
    useEffect(() => {
        if (activeTab === 'history') {
            fetchActivityLogs();
        }
    }, [activeTab]);

    const fetchActivityLogs = async () => {
        setLogsLoading(true);
        try {
            const res = await axios.get('/api/activity-logs');
            setActivityLogs(res.data);
        } catch (e) {
            console.error("Error fetching logs:", e);
        } finally {
            setLogsLoading(false);
        }
    };

    const logActivity = async (action, cert, details = '') => {
        try {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            await axios.post('/api/activity-logs', {
                user_name: user.name || 'System',
                action,
                record_type: cert.source === 'issuance' ? 'Issuance' : 'Document',
                record_id: cert.realId,
                details: details || `${action} ${cert.type} certificate for ${cert.name}`
            });
            if (activeTab === 'history') fetchActivityLogs();
        } catch (e) {
            console.error("Failed to log activity:", e);
        }
    };


    const handleEdit = (cert) => {
        setPasswordModal({
            isOpen: true,
            title: 'Authorize Edit',
            message: `Enter password to edit ${cert.type} record for ${cert.name}.`,
            onConfirm: () => {
                setEditingCert(cert);
                setPasswordModal(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const saveEdit = async ({ fields, ocr_text, parentalConsent, detectedType }) => {
        if (!editingCert) return;
        const fileId = editingCert.realId;
        const personName = fields.full_name || fields.husbands_name || fields.wifes_name || '';
        const barangay = fields.barangay || '';
        
        const certToClear = editingCert;
        setEditingCert(null);

        runBackgroundTask(`Updating: ${personName}`, async () => {
            const endpoint = certToClear.source === 'issuance' ? `/api/issuances/${fileId}` : `/api/documents/${fileId}`;
            const res = await axios.put(endpoint, {
                extracted_fields: fields,
                ocr_text: ocr_text,
                personName,
                barangay,
                parental_consent: parentalConsent,
                detectedType
            });

            if (res.data.success) {
                logActivity('Edited', certToClear);
                refreshAll();
                return { success: true };
            }
            throw new Error('Update failed');
        }, { silent: true });
    };

    const handleDelete = (cert) => {
        setPasswordModal({
            isOpen: true,
            title: 'Authorize Deletion',
            message: `Remove record for ${cert.name}? This can be undone later.`,
            onConfirm: () => {
                setPasswordModal(prev => ({ ...prev, isOpen: false }));
                runBackgroundTask(`${cert.name}`, async () => {
                    const endpoint = cert.source === 'issuance' ? `/api/issuances/${cert.realId}` : `/api/documents/${cert.realId}`;
                    const res = await axios.delete(endpoint);
                    if (res.data.success) {
                        logActivity('Deleted', cert);
                        refreshAll();
                        return { success: true, type: 'delete' };
                    }
                    throw new Error('Delete failed');
                }, { 
                    type: 'delete', 
                    undoFn: () => axios.post(`/api/documents/${cert.realId}/undo`) 
                });
            }
        });
    };

    const handleAction = async (action, cert) => {
        const baseUrl = cert.source === 'issuance' ? '/api/issuances' : '/api/documents';
        const endpoint = action === 'Download' ? 'download' : 'view';
        const url = `${baseUrl}/${endpoint}/${cert.realId}`;

        const perform = () => {
            if (action === 'Print') {
                const iframeId = 'print-frame-' + cert.id;
                let iframe = document.getElementById(iframeId);
                if (!iframe) {
                    iframe = document.createElement('iframe');
                    iframe.id = iframeId;
                    iframe.style.display = 'none';
                    document.body.appendChild(iframe);
                }
                iframe.src = url;
                iframe.onload = () => {
                    try {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                        logActivity('Printed', cert);
                    } catch (e) {
                        window.open(url, '_blank');
                    }
                };
            } else {
                window.open(url, '_blank');
                logActivity(action === 'View' ? 'Viewed' : 'Downloaded', cert);
            }
        };

        if (action === 'View') {
            perform(); // View stays direct for quick navigation
        } else {
            withConfirmation({
                title: `${action} Document?`,
                message: `Are you sure you want to ${action.toLowerCase()} the ${cert.type} certificate for ${cert.name}?`,
                action: perform
            });
        }
    };

    // --- Bulk Action Handlers ---
    const handleBulkDelete = () => {
        setPasswordModal({
            isOpen: true,
            title: `Delete ${selectedIds.length} Records?`,
            message: `Remove all ${selectedIds.length} selected records? They can be restored from the Activity Center.`,
            onConfirm: () => {
                setPasswordModal(prev => ({ ...prev, isOpen: false }));
                const idsToDelete = [...selectedIds];
                setSelectedIds([]);
                
                runBackgroundTask(`Bulk Delete: ${idsToDelete.length} Records`, async () => {
                    let ok = 0;
                    for (const fullId of idsToDelete) {
                        const cert = certificates.find(c => c.id === fullId);
                        if (!cert) continue;
                        const endpoint = cert.source === 'issuance' ? `/api/issuances/${cert.realId}` : `/api/documents/${cert.realId}`;
                        const res = await axios.delete(endpoint);
                        if (res.data.success) {
                            logActivity('Deleted (Bulk)', cert);
                            ok++;
                        }
                    }
                    refreshAll();
                    return { success: true, message: `Successfully removed ${ok} records.`, type: 'bulk-delete' };
                }, {
                    type: 'bulk-delete',
                    undoFn: async () => {
                        for (const fullId of idsToDelete) {
                            const realId = fullId.split('-')[1];
                            await axios.post(`/api/documents/${realId}/undo`);
                        }
                    }
                });
            }
        });
    };

    const handleBulkDownload = () => {
        withConfirmation({
            title: `Download ${selectedIds.length} Files?`,
            message: `Initiate sequential download for all ${selectedIds.length} selected documents?`,
            type: 'info',
            action: async () => {
                for (const fullId of selectedIds) {
                    const cert = certificates.find(c => c.id === fullId);
                    if (!cert) continue;
                    const url = cert.source === 'issuance' ? `/api/issuances/download/${cert.realId}` : `/api/documents/download/${cert.realId}`;
                    window.open(url, '_blank');
                    logActivity('Downloaded (Bulk)', cert);
                    await new Promise(r => setTimeout(r, 800)); // Stagger to prevent browser block
                }
                setSelectedIds([]);
            }
        });
    };

    const handleBulkIssue = () => {
        const documentsOnly = selectedIds.filter(id => id.startsWith('doc-'));
        if (documentsOnly.length === 0) return;

        withConfirmation({
            title: `Issue ${documentsOnly.length} Certificates?`,
            message: `Finalize and issue for all ${documentsOnly.length} selected ready documents?`,
            type: 'success',
            action: () => {
                const idsToIssue = [...documentsOnly];
                setSelectedIds([]);
                runBackgroundTask(`Mass Issuance: ${idsToIssue.length} Records`, async () => {
                    // Immediate visual feedback locally
                    setCertificates(prev => prev.map(c => idsToIssue.includes(c.id) ? { ...c, status: 'uploading' } : c));

                    let ok = 0;
                    try {
                        for (const fullId of idsToIssue) {
                            const cert = certificates.find(c => c.id === fullId);
                            if (!cert) continue;
                            const res = await axios.post(`/api/documents/${cert.realId}/quick-approve`);
                            if (res.data.success) {
                                logActivity('Issued (Bulk)', cert);
                                ok++;
                            }
                        }
                        refreshAll();
                        return { success: true, message: `Successfully issued ${ok} certificates.` };
                    } catch (err) {
                        refreshAll();
                        throw err;
                    }
                });
            }
        });
    };

    const uniqueBarangays = NAIC_BARANGAYS;
    const uniqueEncoders = Array.isArray(allUsers) ? [...new Set(allUsers.map(u => u.name))].sort() : [];

    const filteredCertificates = certificates.filter(cert => {
        const matchesType = selectedType === 'all' || cert.type.toLowerCase() === selectedType.toLowerCase();
        const matchesBarangay = selectedBarangay === 'all' || cert.barangay === selectedBarangay;
        const matchesEncoder = selectedEncoder === 'all' || cert.encoded_by === selectedEncoder;
        const matchesSearch = cert.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cert.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cert.barangay.toLowerCase().includes(searchTerm.toLowerCase());

        return matchesType && matchesBarangay && matchesEncoder && matchesSearch;
    });

    const filteredLogs = activityLogs.filter(log => {
        const matchesSearch = !historySearch || 
            (log.details || '').toLowerCase().includes(historySearch.toLowerCase()) ||
            (log.user_name || '').toLowerCase().includes(historySearch.toLowerCase()) ||
            (log.action || '').toLowerCase().includes(historySearch.toLowerCase());
        
        const matchesAction = historyActionFilter === 'all' || log.action === historyActionFilter;
        const matchesUser = historyUserFilter === 'all' || log.user_name === historyUserFilter;

        // Date Range filtering
        const logDate = new Date(log.created_at).setHours(0,0,0,0);
        const start = historyStartDate ? new Date(historyStartDate).setHours(0,0,0,0) : null;
        const end = historyEndDate ? new Date(historyEndDate).setHours(0,0,0,0) : null;
        const matchesDate = (!start || logDate >= start) && (!end || logDate <= end);
        
        return matchesSearch && matchesAction && matchesUser && matchesDate;
    });

    const resetFilters = () => {
        setSelectedType('all');
        setSelectedBarangay('all');
        setSelectedEncoder('all');
        setSearchTerm('');
    };

    const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
    const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 max-w-7xl mx-auto">
            {/* Confirmation Modals */}
            <PasswordConfirmModal
                isOpen={passwordModal.isOpen}
                onConfirm={passwordModal.onConfirm}
                onCancel={() => setPasswordModal(p => ({ ...p, isOpen: false }))}
                title={passwordModal.title}
                message={passwordModal.message}
            />

            <ActionConfirmModal
                isOpen={confirmAction.isOpen}
                onConfirm={confirmAction.onConfirm}
                onCancel={() => setConfirmAction(p => ({ ...p, isOpen: false }))}
                title={confirmAction.title}
                message={confirmAction.message}
                type={confirmAction.type}
            />

            {/* Editor Overlay */}
            <AnimatePresence>
                {editingCert && (
                    <OcrFormPanel
                        file={editingCert.raw}
                        docType={editingCert.type}
                        ocrResult={{
                            extracted_fields: typeof editingCert.raw.extracted_fields === 'string'
                                ? JSON.parse(editingCert.raw.extracted_fields)
                                : (editingCert.raw.extracted_fields || {}),
                            text: editingCert.raw.ocr_text || '',
                            detected_type: editingCert.type
                        }}
                        onSave={saveEdit}
                        onClose={() => setEditingCert(null)}
                    />
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {isLoading ? (
                    <div className="col-span-4"><SkeletonLoader type="cards" rows={1} /></div>
                ) : (
                    <>
                        <motion.div variants={itemVariants} className="bg-white/60 backdrop-blur-xl p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex items-center justify-between">
                            <div>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Master Database</p>
                                <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{certificates.length}</h3>
                            </div>
                            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm"><DocumentMinusIcon className="w-6 h-6" /></div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="bg-white/60 backdrop-blur-xl p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex items-center justify-between">
                            <div>
                                <p className="text-[#d4a574] text-[10px] font-black uppercase tracking-widest mb-1">Birth Documents Issued</p>
                                <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{certificates.filter(c => (c.type || '').toLowerCase() === 'birth').length}</h3>
                            </div>
                            <div className="w-12 h-12 bg-[#d4a574]/10 rounded-2xl flex items-center justify-center text-[#d4a574] border border-[#d4a574]/20 shadow-sm">👶</div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="bg-white/60 backdrop-blur-xl p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex items-center justify-between">
                            <div>
                                <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mb-1">Death Certificates Issued</p>
                                <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{certificates.filter(c => (c.type || '').toLowerCase() === 'death').length}</h3>
                            </div>
                            <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 border border-rose-100 shadow-sm">📋</div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="bg-white/60 backdrop-blur-xl p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex items-center justify-between">
                            <div>
                                <p className="text-indigo-500 text-[10px] font-black uppercase tracking-widest mb-1">Marriage Certificates Issued</p>
                                <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{certificates.filter(c => (c.type || '').toLowerCase().includes('marriage')).length}</h3>
                            </div>
                            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 border border-indigo-100 shadow-sm">💍</div>
                        </motion.div>
                    </>
                )}
            </div>

            <motion.div variants={itemVariants} className="flex space-x-1 bg-slate-100 p-1.5 rounded-xl w-fit">
                <button onClick={() => setActiveTab('database')} className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${activeTab === 'database' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Master Database</button>
                <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${activeTab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Activity Log History</button>
            </motion.div>

            <motion.div variants={itemVariants} className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 overflow-hidden min-h-[500px]">
                {activeTab === 'database' ? (
                    <>
                        <div className="p-6 border-b border-slate-100 bg-slate-50/30 space-y-4">
                            <div className="flex flex-col lg:flex-row justify-between gap-4">
                                <div className="relative max-w-md w-full">
                                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                    <input type="text" placeholder="Search by Cert No, Name or Barangay..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] sm:text-sm transition-all shadow-sm" />
                                </div>

                                <div className="flex items-center gap-2">
                                    {(selectedType !== 'all' || selectedBarangay !== 'all' || selectedEncoder !== 'all' || searchTerm !== '') && (
                                        <button
                                            onClick={resetFilters}
                                            className="px-4 py-2 text-xs font-bold text-rose-500 hover:text-white bg-rose-50 hover:bg-rose-500 border border-rose-100 rounded-xl transition-all cursor-pointer flex items-center gap-2 group"
                                        >
                                            <XMarkIcon className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                                            Reset Filters
                                        </button>
                                    )}
                                    <div className="flex bg-slate-100 p-1 rounded-xl">
                                        {['all', 'birth', 'death', 'marriage'].map(type => (
                                            <button key={type} onClick={() => setSelectedType(type)} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${selectedType === type ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{type}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100/50">
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barangay</label>
                                    <select
                                        value={selectedBarangay}
                                        onChange={(e) => setSelectedBarangay(e.target.value)}
                                        className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 block p-2 cursor-pointer transition-all outline-none"
                                    >
                                        <option value="all">All Barangays</option>
                                        {uniqueBarangays.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Encoder</label>
                                    <select
                                        value={selectedEncoder}
                                        onChange={(e) => setSelectedEncoder(e.target.value)}
                                        className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 block p-2 cursor-pointer transition-all outline-none"
                                    >
                                        <option value="all">All Encoders</option>
                                        {uniqueEncoders.map(e => <option key={e} value={e}>{e}</option>)}
                                    </select>
                                </div>

                                <div className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Showing {filteredCertificates.length} of {certificates.length} Records
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest font-black border-b border-slate-200">
                                        <th className="p-4 pl-6 w-10">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                                                checked={filteredCertificates.length > 0 && filteredCertificates.every(c => selectedIds.includes(c.id))}
                                                onChange={() => toggleSelectAll(filteredCertificates.map(c => c.id))}
                                            />
                                        </th>
                                        <th className="p-4">Ref/Cert No.</th>
                                        <th className="p-4">Type</th>
                                        <th className="p-4">Recipient Name</th>
                                        <th className="p-4">Barangay</th>
                                        <th className="p-4">Encoded By</th>
                                        <th className="p-4 pr-6 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {isLoading ? (
                                        <tr><td colSpan="8"><SkeletonLoader type="table" rows={8} /></td></tr>
                                    ) : filteredCertificates.length === 0 ? (
                                        <tr><td colSpan="8" className="p-12 text-center text-slate-400"><DocumentMinusIcon className="w-12 h-12 mx-auto mb-2 opacity-20" /><p className="font-semibold">No records found in database</p></td></tr>
                                    ) : (
                                        filteredCertificates.map((cert) => (
                                            <tr key={cert.id} className={`hover:bg-slate-50/50 transition-colors group ${selectedIds.includes(cert.id) ? 'bg-indigo-50/30' : ''}`}>
                                                <td className="p-4 pl-6">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                                                        checked={selectedIds.includes(cert.id)}
                                                        onChange={() => toggleSelect(cert.id)}
                                                    />
                                                </td>
                                                <td className="p-4"><span className="font-bold text-slate-800 text-sm tracking-tight">{cert.number}</span></td>
                                                <td className="p-4"><span className="inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-500 border border-slate-200">{cert.type}</span></td>
                                                <td className="p-4 font-semibold text-slate-700 text-sm">{cert.name}</td>
                                                <td className="p-4 text-slate-500 text-xs font-medium">{cert.barangay}</td>
                                                <td className="p-4 text-slate-400 text-xs">{cert.encoded_by || 'System'}</td>
                                                <td className="p-4 pr-6 text-right">
                                                    <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleAction('View', cert)} title="View Document" className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded-lg transition-all border border-indigo-100 cursor-pointer"><EyeIcon className="w-4 h-4" /></button>
                                                        <button onClick={() => handleEdit(cert)} title="Edit Record" className="p-2 text-amber-600 bg-amber-50 hover:bg-amber-600 hover:text-white rounded-lg transition-all border border-amber-100 cursor-pointer"><PencilSquareIcon className="w-4 h-4" /></button>
                                                        <button onClick={() => handleAction('Print', cert)} title="Print" className="p-2 text-slate-600 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-lg transition-all border border-slate-200 cursor-pointer"><PrinterIcon className="w-4 h-4" /></button>
                                                        <button onClick={() => handleAction('Download', cert)} title="Download" className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white rounded-lg transition-all border border-blue-100 cursor-pointer"><ArrowDownTrayIcon className="w-4 h-4" /></button>
                                                        <button onClick={() => handleDelete(cert)} title="Delete" className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-600 hover:text-white rounded-lg transition-all border border-rose-100 cursor-pointer"><TrashIcon className="w-4 h-4" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="p-0">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/10">
                            {/* Top Row: Title & Action */}
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 shadow-sm">
                                            <ClockIcon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none">Activity & Audit Trail</h3>
                                            <p className="text-[11px] text-slate-400 mt-1 font-bold uppercase tracking-wider">Tracking all system events and modifications</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="bg-slate-100/50 px-3 py-1.5 rounded-xl border border-slate-200/50">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest tabular-nums italic">
                                            {filteredLogs.length} of {activityLogs.length} Entries
                                        </span>
                                    </div>
                                    <button 
                                        onClick={fetchActivityLogs} 
                                        disabled={logsLoading}
                                        className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-indigo-600 px-4 py-2 bg-white hover:bg-indigo-50 rounded-xl border border-slate-200 hover:border-indigo-100 transition-all cursor-pointer shadow-sm active:scale-95 whitespace-nowrap group"
                                    >
                                        <ArrowPathIcon className={`w-4 h-4 group-hover:rotate-180 transition-transform duration-500 ${logsLoading ? 'animate-spin' : ''}`} />
                                        Refresh Log
                                    </button>
                                </div>
                            </div>

                            {/* Filter Row: Search & Dropdowns */}
                            <div className="space-y-4 pt-6 border-t border-slate-200/50">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
                                    {/* Search Field */}
                                    <div className="lg:col-span-4 space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Search Details</label>
                                        <div className="relative">
                                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Recipient name, action, or comment..."
                                                value={historySearch}
                                                onChange={(e) => setHistorySearch(e.target.value)}
                                                className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Action Type */}
                                    <div className="lg:col-span-2 space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Action Type</label>
                                        <select
                                            value={historyActionFilter}
                                            onChange={(e) => setHistoryActionFilter(e.target.value)}
                                            className="w-full bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 block p-2.5 cursor-pointer transition-all outline-none"
                                        >
                                            <option value="all">Any Action</option>
                                            <option value="Printed">Printed</option>
                                            <option value="Downloaded">Downloaded</option>
                                            <option value="Edited">Edited</option>
                                            <option value="Viewed">Viewed</option>
                                            <option value="Issued">Issued</option>
                                            <option value="Deleted">Deleted</option>
                                            <option value="Deleted (Bulk)">Deleted (Bulk)</option>
                                            <option value="Issued (Bulk)">Issued (Bulk)</option>
                                        </select>
                                    </div>

                                    {/* Staff Selection */}
                                    <div className="lg:col-span-2 space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Encoder / Staff</label>
                                        <select
                                            value={historyUserFilter}
                                            onChange={(e) => setHistoryUserFilter(e.target.value)}
                                            className="w-full bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 block p-2.5 cursor-pointer transition-all outline-none"
                                        >
                                            <option value="all">Any Staff member</option>
                                            {uniqueEncoders.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>

                                    {/* Date Range Fields */}
                                    <div className="lg:col-span-4 grid grid-cols-2 gap-2 space-y-0">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">From Date</label>
                                            <input 
                                                type="date" 
                                                value={historyStartDate} 
                                                onChange={(e) => setHistoryStartDate(e.target.value)}
                                                className="w-full bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl p-2.5 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">To Date</label>
                                            <input 
                                                type="date" 
                                                value={historyEndDate} 
                                                onChange={(e) => setHistoryEndDate(e.target.value)}
                                                className="w-full bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl p-2.5 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Active Filters & Clear */}
                                {(historySearch || historyActionFilter !== 'all' || historyUserFilter !== 'all' || historyStartDate || historyEndDate) && (
                                    <div className="flex items-center justify-between bg-indigo-50/50 p-2 rounded-xl border border-indigo-100/50 animate-in fade-in slide-in-from-top-1">
                                        <p className="text-[10px] font-bold text-indigo-600 pl-2">Filtering results...</p>
                                        <button
                                            onClick={() => { 
                                                setHistorySearch(''); 
                                                setHistoryActionFilter('all'); 
                                                setHistoryUserFilter('all');
                                                setHistoryStartDate('');
                                                setHistoryEndDate('');
                                            }}
                                            className="text-[10px] font-black text-rose-500 hover:text-white hover:bg-rose-500 px-3 py-1.5 rounded-lg border border-rose-200 hover:border-rose-500 uppercase tracking-widest transition-all glass-effect cursor-pointer"
                                        >
                                            Clear All Filters
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {logsLoading ? (
                            <div className="p-6"><SkeletonLoader type="table" rows={10} /></div>
                        ) : activityLogs.length === 0 ? (
                            <div className="py-20 text-center text-slate-400 border-2 border-dashed border-slate-100 m-6 rounded-3xl">
                                <ShieldCheckIcon className="w-16 h-16 mx-auto mb-4 opacity-10" />
                                <p className="font-bold text-slate-600">No activity logged yet</p>
                                <p className="text-xs mt-1">Actions like Print, Download, and Edit will appear here.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
                                            <th className="p-4 pl-8">Timestamp</th>
                                            <th className="p-4">Encoder</th>
                                            <th className="p-4">Action</th>
                                            <th className="p-4">Record Info</th>
                                            <th className="p-4 pr-8">Log Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-slate-50/30 transition-colors">
                                                <td className="p-4 pl-8 font-bold text-slate-400 text-[10px] tabular-nums tracking-tighter">
                                                    {new Date(log.created_at).toLocaleString()}
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-xs font-black text-slate-700 uppercase tracking-tight bg-slate-100 px-2 py-0.5 rounded">
                                                        {log.user_name}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${log.action?.includes('Edit') ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                            log.action?.includes('Delete') ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                                log.action?.includes('Print') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                                    'bg-indigo-50 text-indigo-600 border-indigo-100'
                                                        }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${log.action?.includes('Edit') ? 'bg-amber-500' :
                                                                log.action?.includes('Delete') ? 'bg-rose-500' :
                                                                    log.action?.includes('Print') ? 'bg-emerald-500' : 'bg-indigo-500'
                                                            }`}></span>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-[10px] font-bold text-slate-500 font-mono">
                                                        {log.record_type} #{log.record_id}
                                                    </span>
                                                </td>
                                                <td className="p-4 pr-8 text-xs font-medium text-slate-600 italic">
                                                    {log.details}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>

            {/* Floating Bulk Action Bar */}
            <AnimatePresence>
                {selectedIds.length > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ 
                            y: isBarMinimized ? 80 : 0, 
                            opacity: 1,
                            scale: isBarMinimized ? 0.95 : 1
                        }}
                        exit={{ y: 100, opacity: 0 }}
                        transition={{ type: 'tween', duration: 0.1, ease: 'circOut' }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
                    >
                        <div className={`bg-slate-900 border border-slate-800 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-4 flex items-center justify-between relative transition-all ${isBarMinimized ? 'opacity-50 hover:opacity-100' : ''}`}>
                            {/* Toggle Button */}
                            <button 
                                onClick={() => setIsBarMinimized(!isBarMinimized)}
                                className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 text-slate-400 hover:text-white p-1.5 rounded-full shadow-lg transition-all cursor-pointer z-10"
                                title={isBarMinimized ? "Expand Toolbar" : "Minimize Toolbar"}
                            >
                                {isBarMinimized ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
                            </button>

                            <div className="flex items-center gap-4 pl-4">
                                <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-white text-xs font-black transition-all ${isBarMinimized ? 'scale-75' : ''}`}>
                                    {selectedIds.length}
                                </span>
                                {!isBarMinimized && (
                                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                                        <p className="text-white text-sm font-bold leading-none tracking-tight">Records Selected</p>
                                        <button onClick={() => setSelectedIds([])} className="text-[10px] text-slate-400 hover:text-white font-bold uppercase tracking-widest mt-1 transition-colors">Clear Selection</button>
                                    </motion.div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 pr-2">
                                {isBarMinimized ? (
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pr-4">Selection active</span>
                                ) : (
                                    <>
                                        <button onClick={handleBulkIssue} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl transition-all shadow-lg shadow-emerald-900/20 active:scale-95 cursor-pointer">
                                            <CheckCircleIcon className="w-4 h-4" />
                                            Mass Issue
                                        </button>
                                        <button onClick={handleBulkDownload} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl transition-all shadow-lg shadow-indigo-900/20 active:scale-95 cursor-pointer">
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                            Download
                                        </button>
                                        <button onClick={handleBulkDelete} className="p-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl transition-all shadow-lg shadow-rose-900/20 active:scale-95 cursor-pointer">
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default Issuances;
