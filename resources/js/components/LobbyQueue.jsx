import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ClockIcon,
    PlayIcon,
    CheckCircleIcon,
    PlusCircleIcon,
    MegaphoneIcon,
    ArrowPathIcon,
    IdentificationIcon,
    XMarkIcon,
    UserIcon,
    DocumentTextIcon,
    MagnifyingGlassIcon,
    QrCodeIcon,
    LinkIcon,
    SparklesIcon,
    ExclamationTriangleIcon,
    EyeIcon,
    TrashIcon
} from '@heroicons/react/24/outline';
import axios from 'axios';
import AttachDocumentModal from './AttachDocumentModal';

export default function LobbyQueue({ showAlert, refreshCounter, viewSelectors, counter }) {
    const [tickets, setTickets] = useState([]);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('in_queue'); // 'in_queue', 'ready', or 'completed'
    const [purposeFilter, setPurposeFilter] = useState('all');

    // Walk-in modal state
    const [isWalkInOpen, setIsWalkInOpen] = useState(false);
    const [walkInName, setWalkInName] = useState('');
    const [walkInPurpose, setWalkInPurpose] = useState('birth');
    const [walkInPhone, setWalkInPhone] = useState('');
    const [walkInEmail, setWalkInEmail] = useState('');
    const [walkInResult, setWalkInResult] = useState(null);
    const [isRegisteringWalkIn, setIsRegisteringWalkIn] = useState(false);

    // Verification Issue modal
    const [isVerifyOpen, setIsVerifyOpen] = useState(false);
    const [isIssuing, setIsIssuing] = useState(false);

    // Scan Ticket QR state
    const [isScanOpen, setIsScanOpen] = useState(false);
    const [scanToken, setScanToken] = useState('');
    const [isScanningToken, setIsScanningToken] = useState(false);
    const [scanErrorMsg, setScanErrorMsg] = useState('');
    const [isScanningSim, setIsScanningSim] = useState(false);

    // Decline ticket modal state
    const [isDeclineOpen, setIsDeclineOpen] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [sendDeclineEmail, setSendDeclineEmail] = useState(false);
    const [isDeclining, setIsDeclining] = useState(false);

    // Attach Document Modal state
    const [isAttachOpen, setIsAttachOpen] = useState(false);

    // Caching (SWR) on mount
    useEffect(() => {
        const cachedTickets = sessionStorage.getItem('civicore_lobby_tickets');
        if (cachedTickets) {
            setTickets(JSON.parse(cachedTickets));
        }

        fetchLobbyTickets(!cachedTickets);

        // Keep updating queue in background every 10s
        const interval = setInterval(() => {
            fetchLobbyTickets(false);
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    // Refresh tickets silently when parent counter updates
    useEffect(() => {
        if (counter > 0) {
            fetchLobbyTickets(false);
        }
    }, [counter]);

    const handleScanCheckIn = async (overrideToken) => {
        const tokenVal = overrideToken || scanToken;
        if (!tokenVal.trim()) return;

        setIsScanningToken(true);
        setScanErrorMsg(null);
        try {
            const res = await axios.post('/api/v1/tickets/scan', {
                qr_code_token: tokenVal
            });
            if (res.data.success) {
                showAlert({
                    title: 'Check-In Successful!',
                    message: `Lobby number ${res.data.ticket.queue_number} has been allocated to ${res.data.ticket.client_name}.`,
                    type: 'success'
                });
                setIsScanOpen(false);
                setScanToken('');
                fetchLobbyTickets(false);
                setSelectedTicket(res.data.ticket);
                if (refreshCounter) refreshCounter();
            }
        } catch (err) {
            console.error(err);
            const msg = err.response?.data?.error || 'Check-in failed. Please verify the ticket QR token.';
            setScanErrorMsg(msg);
        } finally {
            setIsScanningToken(false);
        }
    };

    const triggerSimulatedScan = () => {
        setIsScanningSim(true);
        setScanErrorMsg(null);

        // Find a ticket that is not yet checked in
        const unqueued = tickets.filter(t => t.queue_status === 'not_in_lobby' && ['pending', 'ready_for_pickup'].includes(t.request_status));
        setTimeout(() => {
            setIsScanningSim(false);
            if (unqueued.length > 0) {
                const targetToken = unqueued[0].qr_code_token || unqueued[0].token;
                showAlert({
                    title: 'QR Code Scanned!',
                    message: `Simulating QR scan for Ticket ${unqueued[0].ticket_number}`,
                    type: 'success'
                });
                handleScanCheckIn(targetToken);
            } else {
                setScanErrorMsg("Simulation Error: No unqueued online tickets exist in database to scan.");
            }
        }, 1500);
    };

    const handleAttachAndConfirm = async (docId, printRemarks = '') => {
        if (!selectedTicket || !docId) return;
        try {
            const res = await axios.patch(`/api/v1/tickets/${selectedTicket.id}/attach`, {
                document_id: docId,
                print_remarks: printRemarks
            });
            if (res.data.success) {
                showAlert({
                    title: 'File Attached!',
                    message: `Ticket ${selectedTicket.ticket_number} was sent to the print approval queue.`,
                    type: 'success'
                });
                fetchLobbyTickets(false);
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Could not attach document record.', type: 'danger' });
            throw err;
        }
    };

    const fetchLobbyTickets = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const res = await axios.get('/api/v1/tickets', {
                params: {
                    _: Date.now()
                }
            });
            setTickets(res.data);
            sessionStorage.setItem('civicore_lobby_tickets', JSON.stringify(res.data));
            if (res.data.length > 0) {
                if (selectedTicket) {
                    const matched = res.data.find(t => t.id === selectedTicket.id);
                    setSelectedTicket(matched || null);
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCallNext = async () => {
        const waiting = tickets.filter(t => t.queue_status === 'waiting');
        if (waiting.length === 0) {
            showAlert({ title: 'Queue Empty', message: 'No waiting citizens in the lobby.', type: 'info' });
            return;
        }

        const next = waiting[0];
        try {
            const res = await axios.put(`/api/tickets/${next.id}/status`, { status: 'Serving' });
            if (res.data.success) {
                showAlert({ title: 'Ticket Called', message: `Now serving lobby number: ${next.queue_number}`, type: 'success' });
                fetchLobbyTickets(false);
                setSelectedTicket(next);

                // Play Audio Text to Speech Voice call
                if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const rawPurpose = next.purpose === 'birth' ? 'Birth Certificate' : next.purpose === 'death' ? 'Death Certificate' : 'Marriage Certificate';
                    const speakNum = next.ticket_number.replace('T-', 'Ticket ').replace('WI-', 'Walk In ');
                    const utterance = new SpeechSynthesisUtterance(`Now serving, lobby number ${next.queue_number}, ${speakNum}, for ${rawPurpose}. Please proceed to counter.`);
                    utterance.rate = 0.95;
                    window.speechSynthesis.speak(utterance);
                }
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Could not serve ticket.', type: 'danger' });
        }
    };

    const handleCreateWalkIn = async (e) => {
        e.preventDefault();
        if (!walkInName.trim() || isRegisteringWalkIn) return;

        setIsRegisteringWalkIn(true);
        try {
            const res = await axios.post('/api/v1/tickets/walk-in', {
                client_name: walkInName,
                phone: walkInPhone,
                email: walkInEmail,
                purpose: walkInPurpose,
                details: {}
            });
            if (res.data.success) {
                setWalkInResult({
                    ticket_number: res.data.ticket.ticket_number,
                    queue_number: res.data.ticket.queue_number,
                    qr_code_url: res.data.qr_code_url,
                });
                setWalkInName('');
                setWalkInPhone('');
                setWalkInEmail('');
                fetchLobbyTickets(false);
                if (refreshCounter) refreshCounter();
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Could not generate walk-in ticket.', type: 'danger' });
        } finally {
            setIsRegisteringWalkIn(false);
        }
    };

    const handleFinalIssue = async () => {
        if (!selectedTicket) return;
        setIsIssuing(true);
        try {
            const res = await axios.post(`/api/v1/tickets/${selectedTicket.id}/issue`);
            if (res.data.success) {
                showAlert({
                    title: 'Document Issued!',
                    message: `Lobby ticket ${selectedTicket.queue_number} has been checked out successfully.`,
                    type: 'success'
                });
                setIsVerifyOpen(false);
                setSelectedTicket(null);
                fetchLobbyTickets(false);
                if (refreshCounter) refreshCounter();
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Could not complete final issuance.', type: 'danger' });
        } finally {
            setIsIssuing(false);
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
                fetchLobbyTickets(false);
                if (refreshCounter) refreshCounter();
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Failed to cancel the ticket.', type: 'danger' });
        } finally {
            setIsDeclining(false);
        }
    };

    const handleForceDeleteTicket = async () => {
        setIsDeclining(true);
        try {
            const res = await axios.delete(`/api/tickets/${selectedTicket.id}`);
            if (res.data.success) {
                showAlert({ title: 'Ticket Deleted', message: 'The ticket has been forcefully deleted.', type: 'success' });
                setIsDeclineOpen(false);
                setSelectedTicket(null);
                setDeclineReason('');
                setSendDeclineEmail(false);
                fetchLobbyTickets(false);
                if (refreshCounter) refreshCounter();
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Failed to delete the ticket.', type: 'danger' });
        } finally {
            setIsDeclining(false);
        }
    };



    const handleReannounce = (t) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const rawPurpose = t.purpose === 'birth' ? 'Birth Certificate' : t.purpose === 'death' ? 'Death Certificate' : 'Marriage Certificate';
            const speakNum = t.ticket_number.replace('T-', 'Ticket ').replace('WI-', 'Walk In ');
            const utterance = new SpeechSynthesisUtterance(`Re announcing, lobby number ${t.queue_number}, ${speakNum}, for ${rawPurpose}. Please proceed to counter.`);
            utterance.rate = 0.95;
            window.speechSynthesis.speak(utterance);
        }
    };

    // Filter tickets
    const waitingList = tickets.filter(t => t.queue_status === 'waiting');
    const servingList = tickets.filter(t => t.queue_status === 'serving');
    const inQueueList = tickets.filter(t => ['waiting', 'serving'].includes(t.queue_status) && t.request_status === 'pending');
    const waitingForApprovalList = tickets.filter(t => ['waiting', 'serving'].includes(t.queue_status) && t.request_status === 'waiting_for_approval');
    const readyList = tickets.filter(t => t.request_status === 'ready_for_pickup' && ['waiting', 'serving'].includes(t.queue_status));
    const completedList = tickets.filter(t => t.request_status === 'completed');

    const displayedTickets = statusFilter === 'in_queue'
        ? inQueueList
        : statusFilter === 'waiting'
            ? waitingForApprovalList
            : statusFilter === 'ready'
                ? readyList
                : completedList;

    const purposeFiltered = purposeFilter === 'all'
        ? displayedTickets
        : displayedTickets.filter(t => t.purpose === purposeFilter);

    const filteredTickets = purposeFiltered.filter(t =>
        t.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.client_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-4 h-full min-h-0 overflow-hidden flex flex-col">

            {/* Stats Cards Row & View Selectors */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 flex-1 w-full xl:w-auto">
                    <div className="bg-white/70 backdrop-blur-xl p-3 border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest mb-1">In Queue</p>
                            <h3 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">{inQueueList.length}</h3>
                        </div>
                        <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 border border-amber-100 shadow-sm">
                            <ClockIcon className="w-4 h-4" />
                        </div>
                    </div>

                    <div className="bg-white/70 backdrop-blur-xl p-3 border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-indigo-500 text-[10px] font-black uppercase tracking-widest mb-1">Waiting</p>
                            <h3 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">{waitingForApprovalList.length}</h3>
                        </div>
                        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 border border-indigo-100 shadow-sm">
                            <ClockIcon className="w-4 h-4" />
                        </div>
                    </div>

                    <div className="bg-white/70 backdrop-blur-xl p-3 border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest mb-1">Ready for Pickup</p>
                            <h3 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">{readyList.length}</h3>
                        </div>
                        <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500 border border-emerald-100 shadow-sm">
                            <DocumentTextIcon className="w-4 h-4" />
                        </div>
                    </div>

                    <div className="bg-white/70 backdrop-blur-xl p-3 border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-teal-500 text-[10px] font-black uppercase tracking-widest mb-1">Completed Today</p>
                            <h3 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">{completedList.length}</h3>
                        </div>
                        <div className="w-8 h-8 bg-teal-50 rounded-xl flex items-center justify-center text-teal-500 border border-teal-100 shadow-sm">
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

            {/* Action Buttons Row */}
            <div className="flex justify-between items-center shrink-0">
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsScanOpen(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#1a2f4a] hover:bg-[#112033] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm cursor-pointer"
                    >
                        <QrCodeIcon className="w-4 h-4 text-[#d4a574]" />
                        Scan Ticket QR
                    </button>
                    <button
                        onClick={() => setIsWalkInOpen(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-850 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm cursor-pointer"
                    >
                        <PlusCircleIcon className="w-4 h-4 text-[#d4a574]" />
                        Walk-in Register
                    </button>
                    <button
                        onClick={handleCallNext}
                        disabled={waitingList.length === 0}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#d4a574] text-[#0f172a] hover:bg-[#c49a67] font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
                    >
                        <MegaphoneIcon className="w-4 h-4" />
                        Call Next
                    </button>
                </div>
            </div>

            {/* Split View */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-0">
                {/* Left: Queue Management */}
                <div className="lg:col-span-3 bg-white/70 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col h-full overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <MegaphoneIcon className="w-5 h-5 text-[#d4a574]" />
                            Lobby Live Queue
                            <span className="bg-[#d4a574]/20 text-[#c49a67] px-2 py-0.5 rounded-full text-xs font-bold leading-none">
                                {purposeFiltered.length}
                            </span>
                        </h3>
                        <button
                            onClick={() => fetchLobbyTickets(false)}
                            className="p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-650 transition-colors"
                            title="Reload queue"
                        >
                            <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    <div className="space-y-3 mb-4">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search lobby..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#d4a574]/20"
                            />
                        </div>

                        {/* Status Switcher Tabs */}
                        <div className="flex bg-slate-100 p-1 gap-1 rounded-xl w-full border border-slate-200/40 shadow-sm">
                            <button
                                onClick={() => setStatusFilter('in_queue')}
                                className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                                    statusFilter === 'in_queue'
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-750'
                                }`}
                            >
                                In Queue
                            </button>
                            <button
                                onClick={() => setStatusFilter('waiting')}
                                className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                                    statusFilter === 'waiting'
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-750'
                                }`}
                            >
                                Waiting
                            </button>
                            <button
                                onClick={() => setStatusFilter('ready')}
                                className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                                    statusFilter === 'ready'
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-750'
                                }`}
                            >
                                Ready
                            </button>
                            <button
                                onClick={() => setStatusFilter('completed')}
                                className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                                    statusFilter === 'completed'
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-750'
                                }`}
                            >
                                Completed
                            </button>
                        </div>

                        {/* Purpose Filter Pills */}
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
                                            ? 'bg-white text-slate-800 border-slate-200 shadow-sm'
                                            : 'bg-transparent text-slate-450 border-transparent hover:text-slate-650'
                                    } cursor-pointer whitespace-nowrap`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table View */}
                    <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase tracking-widest font-black border-b border-slate-200/50">
                                    <th className="p-3 pl-4">No.</th>
                                    <th className="p-3">Ticket ID</th>
                                    <th className="p-3">Client</th>
                                    <th className="p-3">Purpose</th>
                                    <th className="p-3">Type</th>
                                    <th className="p-3">{statusFilter === 'completed' ? 'Issued At' : 'Time'}</th>
                                    <th className="p-3 text-right pr-4">{statusFilter === 'in_queue' ? 'Call' : 'Status'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                                {isLoading && tickets.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="p-12 text-center text-slate-400">
                                            <ArrowPathIcon className="w-8 h-8 animate-spin text-[#d4a574] mx-auto mb-2" />
                                            <p className="font-semibold">Loading queue list...</p>
                                        </td>
                                    </tr>
                                ) : filteredTickets.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="p-12 text-center text-slate-450">
                                            <ClockIcon className="w-10 h-10 mx-auto mb-2 opacity-10" />
                                            <p className="font-semibold">
                                                {statusFilter === 'in_queue' ? 'No active tickets in lobby' : statusFilter === 'waiting' ? 'No tickets waiting for approval' : statusFilter === 'ready' ? 'No tickets ready for pickup' : 'No completed tickets today'}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                {statusFilter === 'in_queue' ? 'Checked-in citizens will appear here.' : statusFilter === 'waiting' ? 'Tickets waiting for print approval will appear here.' : statusFilter === 'ready' ? 'Tickets with attached documents will appear here.' : 'Issued tickets will appear here.'}
                                            </p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTickets.map(t => {
                                        const isSelected = selectedTicket?.id === t.id;
                                        const getPurposeColor = (purpose) => {
                                            const map = {
                                                birth: 'bg-blue-50 text-blue-700 border-blue-100',
                                                death: 'bg-slate-100 text-slate-600 border-slate-200',
                                                marriage: 'bg-rose-50 text-rose-700 border-rose-100'
                                            };
                                            return map[purpose] || 'bg-slate-50 text-slate-500';
                                        };

                                        return (
                                            <tr
                                                key={t.id}
                                                onClick={() => setSelectedTicket(t)}
                                                className={`hover:bg-slate-50/60 transition-colors cursor-pointer ${
                                                    isSelected ? 'bg-[#d4a574]/5' : ''
                                                }`}
                                            >
                                                <td className="p-3 pl-4 font-black text-[#c49a67] text-sm tabular-nums">
                                                    {t.queue_number || '—'}
                                                </td>
                                                <td className="p-3 font-extrabold text-slate-800">{t.ticket_number}</td>
                                                <td className="p-3 font-semibold text-slate-700 truncate max-w-[16ch]">{t.client_name}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${getPurposeColor(t.purpose)}`}>
                                                        {t.purpose}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${
                                                        t.source === 'walk_in'
                                                            ? 'bg-violet-50 text-violet-700 border-violet-100'
                                                            : 'bg-sky-50 text-sky-700 border-sky-100'
                                                    }`}>
                                                        {t.source === 'walk_in' ? 'Walk-in' : 'Online'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-slate-400 font-mono">
                                                    {t.request_status === 'completed' && t.issued_at
                                                        ? new Date(t.issued_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                        : new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="p-3 text-right pr-4 shrink-0">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {t.request_status === 'completed' ? (
                                                            <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                                                                Completed
                                                            </span>
                                                        ) : t.queue_status === 'serving' ? (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleReannounce(t); }}
                                                                className="p-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-650 text-indigo-500 hover:text-white transition-all cursor-pointer"
                                                                title="Speak Announcement"
                                                            >
                                                                📣
                                                            </button>
                                                        ) : (
                                                            <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                                                                Waiting
                                                            </span>
                                                        )}
                                                        {t.request_status !== 'completed' && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedTicket(t);
                                                                    setIsDeclineOpen(true);
                                                                }}
                                                                className="p-1 border border-rose-200 rounded hover:bg-rose-600 text-rose-500 hover:text-white transition-all cursor-pointer"
                                                                title="Decline Request"
                                                            >
                                                                <XMarkIcon className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right: Lobby Counter Console */}
                <div className="lg:col-span-2 bg-white/70 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col h-full overflow-hidden justify-between">
                    {!selectedTicket ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center py-20">
                            <IdentificationIcon className="w-12 h-12 opacity-15 mb-3 text-[#d4a574]" />
                            <h4 className="font-black text-sm text-slate-700">Lobby Counter Console</h4>
                            <p className="text-xs max-w-[200px] mt-1">Select a checked-in lobby citizen to call voice announces or verify document pickup eligibility.</p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-between h-full min-h-0">
                            <div className="space-y-5 overflow-y-auto pr-1 custom-scrollbar">
                                <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <span className="bg-[#d4a574]/15 text-[#c49a67] px-2 py-0.5 rounded text-[8px] font-black uppercase">
                                                LOBBY NO. {selectedTicket.queue_number || '—'}
                                            </span>
                                            <span className={`inline-flex px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${
                                                selectedTicket.source === 'walk_in'
                                                    ? 'bg-violet-50 text-violet-600 border-violet-100'
                                                    : 'bg-sky-50 text-sky-600 border-sky-100'
                                            }`}>
                                                {selectedTicket.source === 'walk_in' ? 'Walk-in' : 'Online'}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none">{selectedTicket.ticket_number}</h3>
                                    </div>
                                    <button
                                        onClick={() => setSelectedTicket(null)}
                                        className="text-slate-400 hover:text-slate-650 cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="space-y-3.5 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl text-xs">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Queue Status Information</h4>
                                    <div className="flex justify-between"><span className="text-slate-400">Recipient</span><span className="font-bold text-slate-800">{selectedTicket.client_name}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Queue State</span><span className="font-bold uppercase text-indigo-650">{selectedTicket.queue_status}</span></div>
                                    {selectedTicket.verified_at && (
                                        <div className="flex justify-between"><span className="text-slate-400">Checked In</span><span className="font-mono text-slate-500">{new Date(selectedTicket.verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
                                    )}
                                </div>

                                <div className="space-y-3 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl text-xs">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                        <DocumentTextIcon className="w-4 h-4 text-[#d4a574]" /> Linked Registry Document
                                    </h4>
                                    {selectedTicket.document ? (
                                        <div className="space-y-1.5 mt-2">
                                            <div className="flex items-center justify-between">
                                                <div className="min-w-0 pr-2">
                                                    <p className="font-extrabold text-slate-800 truncate">{selectedTicket.document.name}</p>
                                                    <p className="text-[10px] text-slate-400">Person Name: {selectedTicket.document.personName || 'Unspecified'}</p>
                                                </div>
                                                <a href={`/api/documents/view/${selectedTicket.document_id}?raw=1`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black uppercase transition-colors shrink-0 cursor-pointer">
                                                    <EyeIcon className="w-3.5 h-3.5" /> View
                                                </a>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-2">
                                            <p className="text-[10px] text-slate-450 italic">⚠️ No pre-attached document record found.</p>
                                            <button
                                                onClick={() => setIsAttachOpen(true)}
                                                className="w-full mt-3 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-50 border border-indigo-150 text-indigo-700 rounded-xl text-xs font-black uppercase hover:bg-indigo-100 transition-all cursor-pointer"
                                            >
                                                <LinkIcon className="w-4 h-4" />
                                                Attach Registry Document
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2 mt-6">
                                {selectedTicket.request_status === 'completed' ? (
                                    <div className="border-t border-slate-150 pt-6 mt-6 text-center text-xs text-slate-450 font-medium">
                                        This ticket has been verified and the document was officially issued.
                                    </div>
                                ) : (
                                    <div className="border-t border-slate-150 pt-6 mt-6 flex flex-col sm:flex-row gap-3 shrink-0">
                                        {selectedTicket.queue_status === 'waiting' ? (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const res = await axios.put(`/api/tickets/${selectedTicket.id}/status`, { status: 'Serving' });
                                                        if (res.data.success) {
                                                            showAlert({ title: 'Ticket Called', message: `Now serving lobby number: ${selectedTicket.queue_number}`, type: 'success' });
                                                            fetchLobbyTickets(false);
                                                            setSelectedTicket(res.data.ticket);
                                                            handleReannounce(res.data.ticket);
                                                        }
                                                    } catch (err) {
                                                        console.error(err);
                                                        showAlert({ title: 'Error', message: 'Could not serve ticket.', type: 'danger' });
                                                    }
                                                }}
                                                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer animate-pulse"
                                            >
                                                <MegaphoneIcon className="w-4.5 h-4.5" />
                                                Call & Serve Ticket
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => setIsAttachOpen(true)}
                                                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                >
                                                    <LinkIcon className="w-4.5 h-4.5" />
                                                    {selectedTicket.document_id ? 'Change Attached File' : 'Attach File'}
                                                </button>
                                                {selectedTicket.request_status === 'ready_for_pickup' && (
                                                    <button
                                                        onClick={() => setIsVerifyOpen(true)}
                                                        className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                    >
                                                        <CheckCircleIcon className="w-4.5 h-4.5" />
                                                        Verify ID & Issue
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleReannounce(selectedTicket)}
                                                    className="px-4 py-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                    title="Reannounce Voice"
                                                >
                                                    <MegaphoneIcon className="w-4.5 h-4.5 text-indigo-500" />
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => setIsDeclineOpen(true)}
                                            disabled={isDeclining}
                                            className="px-6 py-4 bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                        >
                                            <XMarkIcon className="w-4.5 h-4.5" />
                                            Decline
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Attach Document Modal */}
            <AttachDocumentModal
                isOpen={isAttachOpen}
                onClose={() => setIsAttachOpen(false)}
                ticket={selectedTicket}
                onAttach={handleAttachAndConfirm}
            />

            {/* Scan QR Modal */}
            <AnimatePresence>
                {isScanOpen && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-slate-900 leading-normal">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-100"
                        >
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3.5 mb-4">
                                <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                                    <QrCodeIcon className="w-5 h-5 text-[#d4a574]" /> Scan QR
                                </h3>
                                <button onClick={() => setIsScanOpen(false)} className="text-slate-400 hover:text-slate-650 cursor-pointer">
                                    <XMarkIcon className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {scanErrorMsg && (
                                    <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl text-xs text-rose-600 flex items-start gap-2 font-semibold">
                                        <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                                        <span>{scanErrorMsg}</span>
                                    </div>
                                )}
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Enter Ticket Token / QR Data</label>
                                    <input
                                        type="text"
                                        value={scanToken}
                                        onChange={e => setScanToken(e.target.value)}
                                        className="w-full p-3 border border-slate-200 rounded-xl text-sm font-semibold"
                                        placeholder="Paste token or scan..."
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleScanCheckIn();
                                            }
                                        }}
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleScanCheckIn()}
                                        disabled={isScanningToken || !scanToken.trim()}
                                        className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white bg-slate-900 hover:bg-slate-850 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                                    >
                                        {isScanningToken ? 'Processing...' : 'Verify & Queue'}
                                    </button>
                                </div>

                                <div className="pt-3 border-t border-slate-100 text-center">
                                    <button
                                        onClick={triggerSimulatedScan}
                                        disabled={isScanningSim}
                                        className="text-[10px] uppercase font-bold text-indigo-500 hover:text-indigo-600 cursor-pointer disabled:opacity-50"
                                    >
                                        {isScanningSim ? 'Simulating...' : 'Simulate Scanner Input'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Walk-in Register Modal */}
            <AnimatePresence>
                {isWalkInOpen && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-slate-900 leading-normal">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-100"
                        >
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3.5 mb-4">
                                <h3 className="font-extrabold text-slate-800 text-lg">Register Walk-in Queue</h3>
                                <button onClick={() => { setIsWalkInOpen(false); setWalkInResult(null); }} className="text-slate-400 hover:text-slate-650 cursor-pointer">
                                    <XMarkIcon className="w-6 h-6" />
                                </button>
                            </div>

                            {!walkInResult ? (
                                <form onSubmit={handleCreateWalkIn} className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Client Full Name</label>
                                        <input
                                            type="text"
                                            required
                                            value={walkInName}
                                            onChange={e => setWalkInName(e.target.value)}
                                            className="w-full p-3 border border-slate-200 rounded-xl text-sm font-semibold"
                                            placeholder="e.g. Maria Clara"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Purpose / Document</label>
                                            <select
                                                value={walkInPurpose}
                                                onChange={e => setWalkInPurpose(e.target.value)}
                                                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider"
                                            >
                                                <option value="birth">👶 Birth Certificate</option>
                                                <option value="death">📋 Death Certificate</option>
                                                <option value="marriage">💍 Marriage Certificate</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Contact Number</label>
                                            <input
                                                type="text"
                                                value={walkInPhone}
                                                onChange={e => setWalkInPhone(e.target.value)}
                                                className="w-full p-3 border border-slate-200 rounded-xl text-sm font-semibold"
                                                placeholder="e.g. 09123456789"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Email Address (Optional)</label>
                                        <input
                                            type="email"
                                            value={walkInEmail}
                                            onChange={e => setWalkInEmail(e.target.value)}
                                            className="w-full p-3 border border-slate-200 rounded-xl text-sm font-semibold"
                                            placeholder="e.g. client@gmail.com"
                                        />
                                    </div>

                                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                                        <button
                                            type="button"
                                            onClick={() => setIsWalkInOpen(false)}
                                            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-650 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-colors cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isRegisteringWalkIn}
                                            className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-850 shadow-md transition-all cursor-pointer disabled:opacity-50"
                                        >
                                            {isRegisteringWalkIn ? (
                                                <span className="flex items-center gap-1.5">
                                                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                                    Registering...
                                                </span>
                                            ) : (
                                                'Register Lobby Ticket'
                                            )}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="text-center py-6 space-y-4">
                                    <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                                        <CheckCircleIcon className="w-9 h-9" />
                                    </div>
                                    <div>
                                        <h4 className="font-extrabold text-slate-800 text-md">Lobby Check-in Successful!</h4>
                                        <p className="text-xs text-slate-400 mt-1">Walk-in queue ticket number issued</p>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl w-fit mx-auto text-center space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase">Daily Lobby Number</p>
                                        <p className="text-4xl font-black text-[#c49a67] tracking-tighter">{walkInResult.queue_number}</p>
                                        <p className="text-xs font-bold text-slate-600 mt-2">{walkInResult.ticket_number}</p>
                                    </div>
                                    <button
                                        onClick={() => { setIsWalkInOpen(false); setWalkInResult(null); }}
                                        className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-850 transition-all cursor-pointer"
                                    >
                                        Done
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Verify ID & Checkout Modal */}
            <AnimatePresence>
                {isVerifyOpen && selectedTicket && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-slate-900 leading-normal">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-100"
                        >
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                                <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-1.5">
                                    <IdentificationIcon className="w-6 h-6 text-[#d4a574]" /> Final Verification
                                </h3>
                                <button onClick={() => setIsVerifyOpen(false)} className="text-slate-400 hover:text-slate-650 cursor-pointer">
                                    <XMarkIcon className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-4 mb-6">
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    Please verify the citizen's physical identification card (e.g. National ID, Driver's License) matches the requester profile before final checkout.
                                </p>

                                <div className="bg-slate-50 p-4 border border-slate-100 rounded-2xl text-xs space-y-2">
                                    <div className="flex justify-between"><span className="text-slate-400">Client Name:</span><span className="font-extrabold text-slate-800">{selectedTicket.client_name}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Attached Record:</span><span className="font-bold text-slate-700 truncate max-w-[18ch]">{selectedTicket.document?.name}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Lobby Sequence:</span><span className="font-black text-[#c49a67]">{selectedTicket.queue_number}</span></div>
                                </div>

                                <div className="border border-amber-100 bg-amber-50/40 p-3 rounded-xl flex gap-2 items-start text-[10px] text-amber-700">
                                    <span>⚠️</span>
                                    <span>Proceeding will complete this ticket request, mark it as completed, and remove it from active queue columns.</span>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsVerifyOpen(false)}
                                    className="flex-1 py-3 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-255 transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleFinalIssue}
                                    disabled={isIssuing}
                                    className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    {isIssuing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Confirm & Issue'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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

                                <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsDeclineOpen(false)}
                                            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-650 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-colors cursor-pointer"
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
                                    <button
                                        type="button"
                                        onClick={handleForceDeleteTicket}
                                        disabled={isDeclining}
                                        className="w-full py-2 bg-red-900/10 text-red-700 border border-red-900/20 hover:bg-red-900/20 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                        Force Delete Ticket Completely
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
