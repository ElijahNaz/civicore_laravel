import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    InboxIcon,
    MagnifyingGlassIcon,
    DocumentMagnifyingGlassIcon,
    LinkIcon,
    SparklesIcon,
    UserIcon,
    CalendarIcon,
    ArrowPathIcon,
    MapPinIcon,
    CheckCircleIcon,
    EyeIcon,
    XMarkIcon,
    ExclamationTriangleIcon,
    ClockIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline';
import axios from 'axios';

export default function PendingRequests({ showAlert, refreshCounter, viewSelectors }) {
    const [tickets, setTickets] = useState([]);
    const [stats, setStats] = useState({ pending_inbox: 0, attached_today: 0, completed_today: 0 });
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [purposeFilter, setPurposeFilter] = useState('all');
    const [isLoading, setIsLoading] = useState(false);

    // OCR Document search state
    const [ocrQuery, setOcrQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearchingOcr, setIsSearchingOcr] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [isLinking, setIsLinking] = useState(false);

    // Decline ticket modal state
    const [isDeclineOpen, setIsDeclineOpen] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [sendDeclineEmail, setSendDeclineEmail] = useState(false);
    const [isDeclining, setIsDeclining] = useState(false);

    useEffect(() => {
        fetchPendingTickets();
    }, [purposeFilter]);

    const fetchPendingTickets = async () => {
        try {
            setIsLoading(true);
            const [ticketsRes, statsRes] = await Promise.all([
                axios.get('/api/v1/tickets', {
                    params: {
                        request_status: 'pending',
                        purpose: purposeFilter,
                    }
                }),
                axios.get('/api/v1/staff/tickets/digital-stats')
            ]);
            setTickets(ticketsRes.data);
            setStats(statsRes.data);
            if (ticketsRes.data.length > 0) {
                // Keep selected ticket in sync or select first
                if (selectedTicket) {
                    const matched = ticketsRes.data.find(t => t.id === selectedTicket.id);
                    setSelectedTicket(matched || ticketsRes.data[0]);
                } else {
                    setSelectedTicket(res.data[0]);
                }
            } else {
                setSelectedTicket(null);
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Could not retrieve digital requests.', type: 'danger' });
        } finally {
            setIsLoading(false);
        }
    };

    // Pre-populate OCR search query with client name or details
    useEffect(() => {
        if (selectedTicket) {
            let suggestedQuery = selectedTicket.client_name;
            if (selectedTicket.purpose === 'birth' && selectedTicket.details?.last_name) {
                suggestedQuery = `${selectedTicket.details.first_name} ${selectedTicket.details.last_name}`;
            } else if (selectedTicket.purpose === 'death' && selectedTicket.details?.deceased_last_name) {
                suggestedQuery = `${selectedTicket.details.deceased_first_name} ${selectedTicket.details.deceased_last_name}`;
            } else if (selectedTicket.purpose === 'marriage' && selectedTicket.details?.husband_last_name) {
                suggestedQuery = `${selectedTicket.details.husband_last_name}`;
            }
            setOcrQuery(suggestedQuery);
            setSelectedDoc(null);
            setSearchResults([]);
            handleOcrSearch(suggestedQuery, selectedTicket.purpose);
        }
    }, [selectedTicket]);

    const handleOcrSearch = async (queryText, purposeType) => {
        const term = queryText || ocrQuery;
        const type = purposeType || selectedTicket?.purpose;
        if (!term.trim()) return;

        setIsSearchingOcr(true);
        try {
            // Retrieve documents from system
            const res = await axios.get('/api/documents', {
                params: {
                    search: term,
                    type: type === 'marriage' ? 'marriage' : type
                }
            });
            setSearchResults(res.data.data || res.data.documents || (Array.isArray(res.data) ? res.data : []));
        } catch (err) {
            console.error(err);
        } finally {
            setIsSearchingOcr(false);
        }
    };

    const handleAttachAndConfirm = async () => {
        if (!selectedTicket || !selectedDoc) return;

        setIsLinking(true);
        try {
            const res = await axios.patch(`/api/v1/tickets/${selectedTicket.id}/attach`, {
                document_id: selectedDoc.id
            });
            if (res.data.success) {
                showAlert({
                    title: 'Document Attached!',
                    message: `Ticket ${selectedTicket.ticket_number} is now marked Ready for Pickup. Citizen notified.`,
                    type: 'success'
                });
                setSelectedDoc(null);
                fetchPendingTickets();
                if (refreshCounter) refreshCounter();
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Failed to link document and issue request.', type: 'danger' });
        } finally {
            setIsLinking(false);
        }
    };

    const handleDeclineTicket = async () => {
        if (!declineReason.trim()) {
            showAlert({ title: 'Error', message: 'Please provide a reason for cancellation.', type: 'warning' });
            return;
        }
        setIsDeclining(true);
        try {
            const res = await axios.patch(`/api/v1/tickets/${selectedTicket.id}/cancel`, {
                reason: declineReason,
                send_email: sendDeclineEmail
            });
            if (res.data.success) {
                showAlert({ title: 'Ticket Declined', message: 'The ticket has been cancelled successfully.', type: 'success' });
                setIsDeclineOpen(false);
                setSelectedTicket(null);
                setDeclineReason('');
                setSendDeclineEmail(false);
                fetchPendingTickets();
                if (refreshCounter) refreshCounter();
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Failed to cancel the ticket.', type: 'danger' });
        } finally {
            setIsDeclining(false);
        }
    };

    const filteredTickets = tickets.filter(t =>
        t.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.client_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col space-y-4 h-full min-h-0 overflow-hidden">
            
            {/* Stats Cards Row & View Selectors */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1 w-full xl:w-auto">
                    <div className="bg-white/70 backdrop-blur-xl p-3 border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest mb-1">Pending Inbox</p>
                            <h3 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">{stats.pending_inbox}</h3>
                        </div>
                        <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 border border-amber-100 shadow-sm">
                            <ClockIcon className="w-4 h-4" />
                        </div>
                    </div>

                    <div className="bg-white/70 backdrop-blur-xl p-3 border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-indigo-500 text-[10px] font-black uppercase tracking-widest mb-1">Attached Today</p>
                            <h3 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">{stats.attached_today}</h3>
                        </div>
                        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 border border-indigo-100 shadow-sm">
                            <DocumentTextIcon className="w-4 h-4" />
                        </div>
                    </div>

                    <div className="bg-white/70 backdrop-blur-xl p-3 border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest mb-1">Completed Today</p>
                            <h3 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">{stats.completed_today}</h3>
                        </div>
                        <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500 border border-emerald-100 shadow-sm">
                            <CheckCircleIcon className="w-4 h-4" />
                        </div>
                    </div>
                </div>
                
                {viewSelectors && (
                    <div className="hidden xl:block">
                        {viewSelectors}
                    </div>
                )}
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Left: Pending Tickets List */}
            <div className="lg:col-span-1 bg-white/70 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col h-full overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                        <InboxIcon className="w-5 h-5 text-[#d4a574]" />
                        Digital Inbox
                        <span className="bg-[#d4a574]/20 text-[#c49a67] px-2 py-0.5 rounded-full text-xs font-bold leading-none">
                            {tickets.length}
                        </span>
                    </h3>
                    <button
                        onClick={fetchPendingTickets}
                        className="p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
                        title="Reload inbox"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="space-y-3 mb-4">
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search inbox..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#d4a574]/20"
                        />
                    </div>

                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {[
                            { id: 'all', label: 'All' },
                            { id: 'birth', label: '👶 Birth' },
                            { id: 'death', label: '📋 Death' },
                            { id: 'marriage', label: '💍 Marriage' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setPurposeFilter(tab.id)}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all border ${
                                    purposeFilter === tab.id
                                        ? 'bg-[#d4a574] text-[#0f172a] border-[#d4a574] shadow-sm'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List Container */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                    {isLoading && tickets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <ArrowPathIcon className="w-8 h-8 animate-spin text-[#d4a574] mb-2" />
                            <p className="text-xs font-semibold">Loading requests...</p>
                        </div>
                    ) : filteredTickets.length === 0 ? (
                        <div className="text-center py-20 text-slate-400">
                            <InboxIcon className="w-10 h-10 mx-auto mb-2 opacity-20 text-slate-600" />
                            <p className="text-xs font-bold">No requests in queue</p>
                            <p className="text-[10px] text-slate-400 mt-1">Pending online requests will appear here.</p>
                        </div>
                    ) : (
                        filteredTickets.map(t => {
                            const isSelected = selectedTicket?.id === t.id;
                            const badgeClass = t.purpose === 'birth'
                                ? 'bg-blue-50 text-blue-700 border-blue-100'
                                : t.purpose === 'death'
                                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-100';

                            return (
                                <motion.div
                                    key={t.id}
                                    layoutId={`ticket-${t.id}`}
                                    onClick={() => setSelectedTicket(t)}
                                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                                        isSelected
                                            ? 'border-[#d4a574] bg-[#d4a574]/5 shadow-sm ring-1 ring-[#d4a574]/30'
                                            : 'border-slate-150 bg-white hover:bg-slate-50'
                                    }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="text-[9px] font-mono font-black text-slate-400 tracking-wider">ONLINE SUBMISSION</span>
                                            <h4 className="font-black text-slate-800 text-sm tracking-tight">{t.ticket_number}</h4>
                                        </div>
                                        <span className={`px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${badgeClass}`}>
                                            {t.purpose}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <div className="font-semibold text-slate-600 truncate max-w-[16ch]">
                                            {t.client_name}
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                            {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Middle & Right: Selected Ticket Detail & CiviCORE OCR module */}
            <div className="lg:col-span-2 flex flex-col gap-6 h-full overflow-hidden">
                {!selectedTicket ? (
                    <div className="flex-1 bg-white/70 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-12 flex flex-col items-center justify-center text-slate-400 text-center shadow-sm">
                        <SparklesIcon className="w-12 h-12 text-[#d4a574] opacity-20 mb-3" />
                        <h4 className="font-black text-sm text-slate-700">Digital Request Processor</h4>
                        <p className="text-xs max-w-sm mt-1">Select an online submission ticket on the left panel to begin searching registry records using CiviCORE OCR intelligence.</p>
                    </div>
                ) : (
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 h-full overflow-hidden">
                        
                        {/* Detail Panel */}
                        <div className="bg-white/70 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col h-full overflow-y-auto">
                            <div className="border-b border-slate-100 pb-3 mb-4">
                                <span className="text-[10px] font-mono font-black text-[#c49a67] tracking-widest bg-[#d4a574]/10 px-2 py-0.5 rounded">TICKET METADATA</span>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight mt-2">{selectedTicket.ticket_number}</h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Submitted at: {new Date(selectedTicket.created_at).toLocaleString()}</p>
                            </div>

                            <div className="space-y-4 flex-1">
                                <div className="space-y-2 bg-slate-50/50 p-4.5 border border-slate-100 rounded-2xl">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requester Information</h4>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between"><span className="text-slate-400">Client Name</span><span className="font-bold text-slate-800">{selectedTicket.client_name}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">Phone</span><span className="font-bold text-slate-800">{selectedTicket.phone || '—'}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">Gmail</span><span className="font-bold text-slate-800 truncate max-w-[20ch]">{selectedTicket.email || '—'}</span></div>
                                    </div>
                                </div>

                                <div className="space-y-2.5 bg-slate-50/50 p-4.5 border border-slate-100 rounded-2xl">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requested Document Details</h4>
                                    <div className="space-y-2 text-xs">
                                        {selectedTicket.purpose === 'birth' && (
                                            <>
                                                <div className="flex justify-between border-b border-slate-100/50 pb-1.5"><span className="text-slate-400 flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> Child's Name</span><span className="font-black text-slate-700">{[selectedTicket.details?.first_name, selectedTicket.details?.middle_name, selectedTicket.details?.last_name].filter(Boolean).join(' ')}</span></div>
                                                <div className="flex justify-between border-b border-slate-100/50 pb-1.5"><span className="text-slate-400 flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" /> Date of Birth</span><span className="font-bold text-slate-700">{selectedTicket.details?.date_of_birth}</span></div>
                                                <div className="flex justify-between border-b border-slate-100/50 pb-1.5"><span className="text-slate-400 flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5" /> Place of Birth</span><span className="font-bold text-slate-700 truncate max-w-[15ch]">{selectedTicket.details?.place_of_birth}</span></div>
                                                <div className="flex justify-between border-b border-slate-100/50 pb-1.5"><span className="text-slate-400">Father's Name</span><span className="font-bold text-slate-700">{selectedTicket.details?.father_name || '—'}</span></div>
                                                <div className="flex justify-between pb-1"><span className="text-slate-400">Mother's Maiden Name</span><span className="font-bold text-slate-700">{selectedTicket.details?.mother_name || '—'}</span></div>
                                            </>
                                        )}

                                        {selectedTicket.purpose === 'death' && (
                                            <>
                                                <div className="flex justify-between border-b border-slate-100/50 pb-1.5"><span className="text-slate-400 flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> Deceased Name</span><span className="font-black text-slate-700">{[selectedTicket.details?.deceased_first_name, selectedTicket.details?.deceased_middle_name, selectedTicket.details?.deceased_last_name].filter(Boolean).join(' ')}</span></div>
                                                <div className="flex justify-between border-b border-slate-100/50 pb-1.5"><span className="text-slate-400 flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" /> Date of Death</span><span className="font-bold text-slate-700">{selectedTicket.details?.date_of_death}</span></div>
                                                <div className="flex justify-between pb-1"><span className="text-slate-400 flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5" /> Place of Death</span><span className="font-bold text-slate-700 truncate max-w-[15ch]">{selectedTicket.details?.place_of_death}</span></div>
                                            </>
                                        )}

                                        {selectedTicket.purpose === 'marriage' && (
                                            <>
                                                <div className="flex justify-between border-b border-slate-100/50 pb-1.5"><span className="text-slate-400 flex items-center gap-1">🕺 Husband's Name</span><span className="font-black text-slate-700">{[selectedTicket.details?.husband_first_name, selectedTicket.details?.husband_middle_name, selectedTicket.details?.husband_last_name].filter(Boolean).join(' ')}</span></div>
                                                <div className="flex justify-between border-b border-slate-100/50 pb-1.5"><span className="text-slate-400 flex items-center gap-1">💃 Wife's Name</span><span className="font-black text-slate-700">{[selectedTicket.details?.wife_first_name, selectedTicket.details?.wife_middle_name, selectedTicket.details?.wife_last_name].filter(Boolean).join(' ')}</span></div>
                                                <div className="flex justify-between border-b border-slate-100/50 pb-1.5"><span className="text-slate-400 flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" /> Date of Marriage</span><span className="font-bold text-slate-700">{selectedTicket.details?.date_of_marriage}</span></div>
                                                <div className="flex justify-between pb-1"><span className="text-slate-400 flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5" /> Place of Marriage</span><span className="font-bold text-slate-700 truncate max-w-[15ch]">{selectedTicket.details?.place_of_marriage}</span></div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* OCR Link Module */}
                        <div className="bg-white/70 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col h-full overflow-hidden">
                            <div className="border-b border-slate-100 pb-3 mb-4 flex justify-between items-center">
                                <div>
                                    <span className="text-[10px] font-mono font-black text-[#c49a67] tracking-widest bg-[#d4a574]/10 px-2 py-0.5 rounded flex items-center gap-1">
                                        <SparklesIcon className="w-3.5 h-3.5 text-[#d4a574] animate-pulse" /> CIVICORE OCR DATABASE
                                    </span>
                                    <h3 className="text-sm font-black text-slate-800 mt-2">Scan & Attach Record</h3>
                                </div>
                            </div>

                            {/* OCR Search Field */}
                            <div className="flex gap-2 mb-3">
                                <div className="relative flex-1">
                                    <DocumentMagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#d4a574]" />
                                    <input
                                        type="text"
                                        placeholder="Search OCR records..."
                                        value={ocrQuery}
                                        onChange={e => setOcrQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#d4a574]/20 font-semibold"
                                    />
                                </div>
                                <button
                                    onClick={() => handleOcrSearch()}
                                    disabled={isSearchingOcr}
                                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-850 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    {isSearchingOcr ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
                                </button>
                            </div>

                            {/* Search Results */}
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar mb-4">
                                {isSearchingOcr ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                        <ArrowPathIcon className="w-6 h-6 animate-spin text-[#d4a574] mb-2" />
                                        <p className="text-[10px] font-semibold">Scanning civil registry tables...</p>
                                    </div>
                                ) : searchResults.length === 0 ? (
                                    <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/20">
                                        <DocumentMagnifyingGlassIcon className="w-8 h-8 mx-auto mb-2 opacity-20 text-[#d4a574]" />
                                        <p className="text-[10px] font-bold">No matching records found</p>
                                        <p className="text-[9px] text-slate-400 mt-1">Adjust search parameters or upload files.</p>
                                    </div>
                                ) : (
                                    searchResults.map(doc => {
                                        const isDocSelected = selectedDoc?.id === doc.id;
                                        return (
                                            <div
                                                key={doc.id}
                                                onClick={() => setSelectedDoc(doc)}
                                                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                                    isDocSelected
                                                        ? 'border-indigo-500 bg-indigo-50/15 shadow-sm'
                                                        : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-extrabold text-slate-700 truncate">{doc.name}</p>
                                                    <p className="text-[9px] text-slate-400 mt-0.5">Person: {doc.personName || 'Unspecified'} | Barangay: {doc.barangay || 'Naic'}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                                                        doc.status === 'processed' || doc.status === 'issued'
                                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                            : 'bg-amber-50 text-amber-600 border-amber-100'
                                                    }`}>
                                                        {doc.status || 'Extracted'}
                                                    </span>
                                                    <a href={`/api/documents/view/${doc.id}?raw=1`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700 cursor-pointer p-1" title="View Document" onClick={(e) => e.stopPropagation()}>
                                                        <EyeIcon className="w-4 h-4" />
                                                    </a>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-2 mt-4">
                                <button
                                    onClick={handleAttachAndConfirm}
                                    disabled={!selectedDoc || isLinking}
                                    className={`w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                                        selectedDoc
                                            ? 'bg-[#1a2f4a] hover:bg-[#112033] text-white'
                                            : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                    }`}
                                >
                                    {isLinking ? (
                                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <LinkIcon className="w-4 h-4" />
                                    )}
                                    Attach & Mark Ready
                                </button>
                                
                                <button
                                    onClick={() => setIsDeclineOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-100 transition-all cursor-pointer"
                                >
                                    <XMarkIcon className="w-4 h-4" />
                                    Decline Request
                                </button>
                            </div>
                        </div>

                    </div>
                )}
            </div>
            {/* Decline Modal */}
            <AnimatePresence>
                {isDeclineOpen && selectedTicket && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-slate-900 leading-normal">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-100"
                        >
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3.5 mb-4">
                                <h3 className="font-extrabold text-rose-600 text-lg flex items-center gap-2">
                                    <ExclamationTriangleIcon className="w-5 h-5" /> Decline Ticket
                                </h3>
                                <button onClick={() => setIsDeclineOpen(false)} className="text-slate-400 hover:text-slate-650 cursor-pointer">
                                    <XMarkIcon className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Reason for Cancellation *</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-3 text-sm focus:border-rose-400 focus:ring focus:ring-rose-200 focus:ring-opacity-50 transition-all"
                                        rows="3"
                                        placeholder="E.g., Invalid ID, Information mismatched, Not found in registry..."
                                        value={declineReason}
                                        onChange={(e) => setDeclineReason(e.target.value)}
                                        disabled={isDeclining}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="checkbox" 
                                        id="sendEmail" 
                                        className="w-4 h-4 text-rose-600 border-slate-300 rounded focus:ring-rose-500"
                                        checked={sendDeclineEmail}
                                        onChange={(e) => setSendDeclineEmail(e.target.checked)}
                                        disabled={isDeclining || !selectedTicket.email}
                                    />
                                    <label htmlFor="sendEmail" className={`text-xs font-semibold ${selectedTicket.email ? 'text-slate-700' : 'text-slate-400'}`}>
                                        Send email notification to citizen {selectedTicket.email ? `(${selectedTicket.email})` : '(No email provided)'}
                                    </label>
                                </div>
                                
                                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsDeclineOpen(false)}
                                        className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-colors cursor-pointer"
                                        disabled={isDeclining}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeclineTicket}
                                        disabled={isDeclining || !declineReason.trim()}
                                        className="px-5 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-700 shadow-md shadow-rose-200 transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        {isDeclining ? 'Declining...' : 'Confirm Decline'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
        </div>
    );
}
