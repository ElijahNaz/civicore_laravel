import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
    TicketIcon,
    UserIcon,
    EnvelopeIcon,
    PhoneIcon,
    DocumentTextIcon,
    CheckCircleIcon,
    ClockIcon,
    XCircleIcon,
    PlayIcon,
    ArrowPathIcon,
    PlusCircleIcon,
    MegaphoneIcon,
    LinkIcon,
    PrinterIcon,
    ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import { useData } from './DataContext.jsx';
import { useModal } from './ModalContext.jsx';
import axios from 'axios';

const NAIC_BARANGAYS = [
    'Gomez-Zamora (Pob.)', 'Capt. C. Nazareno (Pob.)', 'Ibayo Silangan', 'Ibayo Estacion', 'Kanluran',
    'Makina', 'Sapa', 'Bucana Malaki', 'Bucana Sasahan', 'Bagong Karsada',
    'Balsahan', 'Bancaan', 'Muzon', 'Latoria', 'Labac',
    'Mabolo', 'San Roque', 'Santulan', 'Molino', 'Calubcob',
    'Halang', 'Malainen Bago', 'Malainen Luma', 'Palangue 1', 'Palangue 2 & 3',
    'Humbac', 'Munting Mapino', 'Sabang', 'Timalan Balsahan', 'Timalan Concepcion'
].sort();

export default function Ticketing({ mode = 'portal' }) {
    const { token } = useParams();
    const navigate = useNavigate();
    const { showAlert } = useModal();
    const { documents: globalDocs, refreshAll } = useData();

    // ── Portal State ──────────────────────────────────────────────────────────
    const [clientName, setClientName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [purpose, setPurpose] = useState('birth');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [details, setDetails] = useState({
        // Birth Certificate details
        first_name: '',
        middle_name: '',
        last_name: '',
        date_of_birth: '',
        place_of_birth: '',
        father_name: '',
        mother_name: '',

        // Death Certificate details
        deceased_first_name: '',
        deceased_middle_name: '',
        deceased_last_name: '',
        date_of_death: '',
        place_of_death: '',

        // Marriage Certificate details
        husband_first_name: '',
        husband_middle_name: '',
        husband_last_name: '',
        wife_first_name: '',
        wife_middle_name: '',
        wife_last_name: '',
        date_of_marriage: '',
        place_of_marriage: ''
    });

    const handleDetailChange = (field, val) => {
        setDetails(prev => ({ ...prev, [field]: val }));
    };

    const handlePortalSubmit = async (e) => {
        e.preventDefault();
        if (!clientName) {
            showAlert({ title: 'Validation Error', message: 'Please enter your name.', type: 'danger' });
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await axios.post('/api/public/tickets', {
                client_name: clientName,
                email,
                phone,
                purpose,
                details
            });
            if (res.data.success) {
                showAlert({ title: 'Ticket Generated', message: 'Your request has been queued.', type: 'success' });
                navigate(`/ticket-status/${res.data.ticket.token}`);
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Queue Error', message: 'Could not create ticket. Please try again.', type: 'danger' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Ticket Status View State ──────────────────────────────────────────────
    const [ticket, setTicket] = useState(null);
    const [queuePosition, setQueuePosition] = useState(0);
    const [ticketQrUrl, setTicketQrUrl] = useState(null);
    const [isLoadingTicket, setIsLoadingTicket] = useState(false);

    useEffect(() => {
        if (mode === 'status' && token) {
            fetchTicketStatus();
            const interval = setInterval(fetchTicketStatus, 15000); // refresh every 15s
            return () => clearInterval(interval);
        }
    }, [mode, token]);

    const fetchTicketStatus = async () => {
        setIsLoadingTicket(true);
        try {
            const res = await axios.get(`/api/public/tickets/${token}`);
            setTicket(res.data.ticket);
            setQueuePosition(res.data.queue_position);
            if (res.data.qr_code_url) setTicketQrUrl(res.data.qr_code_url);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingTicket(false);
        }
    };

    // ── Staff Dashboard State ──────────────────────────────────────────────────
    const [tickets, setTickets] = useState([]);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [dashboardSearch, setDashboardSearch] = useState('');
    const [dashboardStatus, setDashboardStatus] = useState('all');
    const [dashboardPurpose, setDashboardPurpose] = useState('all');
    const [isLoadingQueue, setIsLoadingQueue] = useState(false);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [selectedDocId, setSelectedDocId] = useState('');
    const [activeQueueTab, setActiveQueueTab] = useState('active'); // 'active' or 'history'

    const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
    const [walkInName, setWalkInName] = useState('');
    const [walkInPurpose, setWalkInPurpose] = useState('birth');
    const [walkInPhone, setWalkInPhone] = useState('');
    const [walkInEmail, setWalkInEmail] = useState('');
    // Walk-in QR result shown inline after creation
    const [walkInResult, setWalkInResult] = useState(null); // { ticket_number, qr_base64, ticket_url }

    const handleCreateWalkIn = async (e) => {
        if (e) e.preventDefault();
        if (!walkInName.trim()) {
            showAlert({ title: 'Validation Error', message: 'Please enter client name.', type: 'danger' });
            return;
        }
        try {
            // Use dedicated walk-in endpoint (WI- prefix)
            const res = await axios.post('/api/tickets/walk-in', {
                client_name: walkInName,
                phone: walkInPhone,
                email: walkInEmail,
                purpose: walkInPurpose,
                details: {}
            });
            if (res.data.success) {
                setWalkInResult({
                    ticket_number: res.data.ticket.ticket_number,
                    qr_base64: res.data.qr_base64,
                    ticket_url: res.data.ticket_url,
                });
                setWalkInName('');
                setWalkInPhone('');
                setWalkInEmail('');
                fetchQueue();
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Could not create walk-in ticket.', type: 'danger' });
        }
    };

    useEffect(() => {
        if (mode === 'staff') {
            fetchQueue();
            const interval = setInterval(fetchQueue, 10000); // refresh every 10s
            return () => clearInterval(interval);
        }
    }, [mode]);

    const fetchQueue = async () => {
        setIsLoadingQueue(true);
        try {
            const res = await axios.get('/api/tickets', {
                params: {
                    search: dashboardSearch,
                    status: dashboardStatus,
                    purpose: dashboardPurpose
                }
            });
            setTickets(res.data);
            // Sync selected ticket
            if (selectedTicket) {
                const updated = res.data.find(t => t.id === selectedTicket.id);
                if (updated) setSelectedTicket(updated);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingQueue(false);
        }
    };

    const updateTicketStatus = async (id, newStatus) => {
        try {
            const res = await axios.put(`/api/tickets/${id}/status`, { status: newStatus });
            if (res.data.success) {
                showAlert({ title: 'Status Updated', message: `Ticket marked as ${newStatus}.`, type: 'success' });
                fetchQueue();
                refreshAll();
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Error', message: 'Could not update ticket status.', type: 'danger' });
        }
    };

    const handleCallNext = () => {
        const pending = tickets.filter(t => t.status === 'Pending');
        if (pending.length === 0) {
            showAlert({ title: 'Queue Empty', message: 'No pending tickets in line.', type: 'info' });
            return;
        }

        const next = pending[0];
        updateTicketStatus(next.id, 'Serving');
        setSelectedTicket(next);

        // Speak ticket call
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const rawPurpose = next.purpose === 'birth' ? 'Birth Certificate' : next.purpose === 'death' ? 'Death Certificate' : 'Marriage Certificate';
            const speakNum = next.ticket_number.replace('T-', 'Ticket ');
            const utterance = new SpeechSynthesisUtterance(`Now serving, ${speakNum}, for ${rawPurpose}. Please proceed to counter.`);
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    };

    const handlePrefill = (t) => {
        sessionStorage.setItem('civicore_ticket_prefill', JSON.stringify({
            ticket_id: t.id,
            ticket_number: t.ticket_number,
            purpose: t.purpose,
            client_name: t.client_name,
            details: t.details
        }));
        showAlert({ title: 'Prefill Active', message: `Details of ${t.ticket_number} copied. Redirecting to documents upload.`, type: 'success' });
        navigate('/documents');
    };

    const handleLinkDocument = async () => {
        if (!selectedDocId) return;
        try {
            const res = await axios.post(`/api/tickets/${selectedTicket.id}/link-document`, {
                document_id: selectedDocId
            });
            if (res.data.success) {
                showAlert({ title: 'Document Linked', message: 'Ticket linked to record and completed.', type: 'success' });
                setIsLinkModalOpen(false);
                setSelectedDocId('');
                fetchQueue();
                refreshAll();
            }
        } catch (err) {
            console.error(err);
            showAlert({ title: 'Link Failed', message: 'Could not link ticket to document.', type: 'danger' });
        }
    };

    // Print helper
    const handlePrint = () => {
        window.print();
    };

    // ── RENDER CLIENT PORTAL (PUBLIC REQUEST FORM) ────────────────────────────────
    if (mode === 'portal') {
        return (
            <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                {/* Back to Home Button */}
                <div className="mb-6">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-[#d4a574] transition-colors bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-xl border border-slate-200 shadow-sm"
                    >
                        <span>←</span> Back to Home
                    </Link>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-[2.5rem] p-8 sm:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.06)]"
                >
                    <div className="text-center space-y-3 mb-10">
                        <div className="w-16 h-16 bg-[#d4a574]/15 rounded-2xl flex items-center justify-center mx-auto border border-[#d4a574]/30 shadow-sm text-3xl">
                            🎫
                        </div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Online Document Request</h2>
                        <p className="text-slate-700 text-sm max-w-md mx-auto font-medium">Skip the lines. Queue your document copy request online and get a real-time tracking QR code.</p>
                    </div>

                    <form onSubmit={handlePortalSubmit} className="space-y-8">
                        {/* Phase 1: Contact Details */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-3 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-[#d4a574]/20 text-[#c49a67] text-xs font-black flex items-center justify-center">1</span>
                                Contact Information
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Your Full Name</label>
                                    <div className="relative">
                                        <UserIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            type="text"
                                            required
                                            value={clientName}
                                            onChange={e => setClientName(e.target.value)}
                                            placeholder="Juan Santos"
                                            className="w-full pl-10 pr-4 py-3.5 border border-slate-300 rounded-2xl bg-white focus:outline-none focus:ring-4 focus:ring-[#d4a574]/10 focus:border-[#d4a574] transition-all text-sm font-semibold text-slate-900 placeholder-slate-400"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Email Address</label>
                                    <div className="relative">
                                        <EnvelopeIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="juan@email.com"
                                            className="w-full pl-10 pr-4 py-3.5 border border-slate-300 rounded-2xl bg-white focus:outline-none focus:ring-4 focus:ring-[#d4a574]/10 focus:border-[#d4a574] transition-all text-sm font-semibold text-slate-900 placeholder-slate-400"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">Phone Number</label>
                                    <div className="relative">
                                        <PhoneIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            type="text"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            placeholder="09123456789"
                                            className="w-full pl-10 pr-4 py-3.5 border border-slate-300 rounded-2xl bg-white focus:outline-none focus:ring-4 focus:ring-[#d4a574]/10 focus:border-[#d4a574] transition-all text-sm font-semibold text-slate-900 placeholder-slate-400"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Phase 2: Purpose */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-3 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-[#d4a574]/20 text-[#c49a67] text-xs font-black flex items-center justify-center">2</span>
                                Document Type & Purpose
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { id: 'birth', label: 'Birth Certificate', icon: '👶', desc: 'Copy of Certificate of Live Birth' },
                                    { id: 'death', label: 'Death Certificate', icon: '📋', desc: 'Copy of Certificate of Death' },
                                    { id: 'marriage', label: 'Marriage Contract', icon: '💍', desc: 'Copy of Certificate of Marriage' }
                                ].map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => setPurpose(item.id)}
                                        className={`p-5 border-2 rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-36 ${purpose === item.id
                                            ? 'border-[#d4a574] bg-[#d4a574]/10 shadow-sm'
                                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100/50'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <span className="text-3xl">{item.icon}</span>
                                            {purpose === item.id && <span className="w-5 h-5 rounded-full bg-[#d4a574] flex items-center justify-center text-[#0f172a] text-xs font-black">✓</span>}
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-900 text-sm">{item.label}</p>
                                            <p className="text-[11px] text-slate-700 font-medium mt-1">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Phase 3: Details */}
                        <div className="space-y-6 bg-slate-100/40 p-6 rounded-3xl border border-slate-200">
                            <h3 className="text-md font-black text-slate-900 flex items-center gap-2">
                                <DocumentTextIcon className="w-5 h-5 text-[#d4a574]" />
                                Provide Registry Information (To Speed Up Processing)
                            </h3>

                            {purpose === 'birth' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">First Name (on Certificate)</label>
                                        <input type="text" value={details.first_name} onChange={e => handleDetailChange('first_name', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="First Name" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Middle Name (on Certificate)</label>
                                        <input type="text" value={details.middle_name} onChange={e => handleDetailChange('middle_name', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Middle Name" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Last Name (on Certificate)</label>
                                        <input type="text" value={details.last_name} onChange={e => handleDetailChange('last_name', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Last Name" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Date of Birth</label>
                                        <input type="date" value={details.date_of_birth} onChange={e => handleDetailChange('date_of_birth', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 focus:border-[#d4a574] focus:outline-none" />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Place of Birth (City/Hospital)</label>
                                        <input type="text" value={details.place_of_birth} onChange={e => handleDetailChange('place_of_birth', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="e.g. Naic, Cavite" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Father's Full Name</label>
                                        <input type="text" value={details.father_name} onChange={e => handleDetailChange('father_name', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Father's Full Name" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Mother's Full Maiden Name</label>
                                        <input type="text" value={details.mother_name} onChange={e => handleDetailChange('mother_name', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Mother's Maiden Name" />
                                    </div>
                                </div>
                            )}

                            {purpose === 'death' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Deceased First Name</label>
                                        <input type="text" value={details.deceased_first_name} onChange={e => handleDetailChange('deceased_first_name', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Deceased First Name" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Deceased Middle Name</label>
                                        <input type="text" value={details.deceased_middle_name} onChange={e => handleDetailChange('deceased_middle_name', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Deceased Middle Name" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Deceased Last Name</label>
                                        <input type="text" value={details.deceased_last_name} onChange={e => handleDetailChange('deceased_last_name', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Deceased Last Name" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Date of Death</label>
                                        <input type="date" value={details.date_of_death} onChange={e => handleDetailChange('date_of_death', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 focus:border-[#d4a574] focus:outline-none" />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Place of Death</label>
                                        <input type="text" value={details.place_of_death} onChange={e => handleDetailChange('place_of_death', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="e.g. Naic, Cavite" />
                                    </div>
                                </div>
                            )}

                            {purpose === 'marriage' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* Husband */}
                                    <div className="space-y-3 border-r border-slate-200 pr-4">
                                        <h4 className="text-xs font-black text-slate-800 uppercase">Husband Details</h4>
                                        <input type="text" value={details.husband_first_name} onChange={e => handleDetailChange('husband_first_name', e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm mb-2 text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="First Name" />
                                        <input type="text" value={details.husband_middle_name} onChange={e => handleDetailChange('husband_middle_name', e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm mb-2 text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Middle Name" />
                                        <input type="text" value={details.husband_last_name} onChange={e => handleDetailChange('husband_last_name', e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Last Name" />
                                    </div>
                                    {/* Wife */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-black text-slate-800 uppercase">Wife Details</h4>
                                        <input type="text" value={details.wife_first_name} onChange={e => handleDetailChange('wife_first_name', e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm mb-2 text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="First Name" />
                                        <input type="text" value={details.wife_middle_name} onChange={e => handleDetailChange('wife_middle_name', e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm mb-2 text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Middle Name" />
                                        <input type="text" value={details.wife_last_name} onChange={e => handleDetailChange('wife_last_name', e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="Last Name" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Date of Marriage</label>
                                        <input type="date" value={details.date_of_marriage} onChange={e => handleDetailChange('date_of_marriage', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 focus:border-[#d4a574] focus:outline-none" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Place of Marriage</label>
                                        <input type="text" value={details.place_of_marriage} onChange={e => handleDetailChange('place_of_marriage', e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-[#d4a574] focus:outline-none" placeholder="e.g. Naic, Cavite" />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-6">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-4 bg-gradient-to-r from-[#d4a574] to-[#c49a67] text-[#0f172a] rounded-2xl font-black shadow-xl shadow-[#d4a574]/15 hover:shadow-2xl transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                {isSubmitting ? 'Queueing request...' : 'Get Queue Ticket'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        );
    }

    // ── RENDER TICKET STATUS (CLIENT RECEIPT / LIVE QUEUE POSITION) ───────────────
    if (mode === 'status') {
        const trackingUrl = `${window.location.origin}/ticket-status/${token}`;
        const purposeLabel = ticket?.purpose === 'birth' ? 'Birth Certificate' : ticket?.purpose === 'death' ? 'Death Certificate' : 'Marriage Certificate';
        const formattedDate = ticket?.created_at ? new Date(ticket.created_at).toLocaleString() : '';

        return (
            <div className="max-w-2xl mx-auto py-12 px-4">
                {isLoadingTicket && !ticket ? (
                    <div className="flex flex-col items-center justify-center p-20 text-slate-400">
                        <ArrowPathIcon className="w-10 h-10 animate-spin text-[#d4a574] mb-3" />
                        <p className="text-sm font-semibold">Retrieving your queue position...</p>
                    </div>
                ) : !ticket ? (
                    <div className="text-center py-20 bg-white/60 backdrop-blur-xl rounded-[2.5rem] p-12 border border-slate-200">
                        <XCircleIcon className="w-16 h-16 text-rose-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-slate-800">Invalid Token</h3>
                        <p className="text-slate-400 text-sm mt-2">Could not find queue details for this tracking code.</p>
                        <Link to="/ticket-request" className="mt-6 inline-block bg-[#1a2f4a] text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider">Request Ticket</Link>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-6"
                    >
                        {/* Premium downloadable ticket */}
                        <div id="print-area" className="bg-[#0f172a] text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-800 print:bg-white print:text-slate-900 print:shadow-none print:p-6 print:rounded-none">
                            {/* Ambient Light */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-[#d4a574]/10 rounded-full blur-[100px] pointer-events-none print:hidden"></div>

                            <div className="flex flex-col sm:flex-row justify-between items-center sm:items-start gap-6 border-b border-white/10 pb-8 print:border-slate-200">
                                <div>
                                    <div className="font-extrabold text-[#d4a574] text-lg tracking-tight uppercase leading-none mb-2">CIVICORE NAIC</div>
                                    <h2 className="text-2xl font-black text-white tracking-tight print:text-slate-900">Civil Registry Queue Ticket</h2>
                                    <p className="text-slate-400 text-xs mt-1 print:text-slate-500">{formattedDate}</p>
                                </div>
                                <div className="bg-white p-3 rounded-2xl shadow-lg print:shadow-none border border-slate-100 shrink-0">
                                    {ticketQrUrl
                                        ? <img src={ticketQrUrl} alt="QR Code" className="w-[110px] h-[110px]" />
                                        : <QRCodeSVG value={trackingUrl} size={110} />
                                    }
                                </div>
                            </div>

                            <div className="py-8 grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-white/10 pb-8 print:border-slate-200 print:py-6">
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest print:text-slate-500">Ticket Number</p>
                                        <p className="text-4xl font-black text-white tracking-tighter mt-1 print:text-slate-900">{ticket.ticket_number}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest print:text-slate-500">Requestor Name</p>
                                        <p className="text-base font-extrabold text-white mt-0.5 print:text-slate-800">{ticket.client_name}</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest print:text-slate-500">Requested Document</p>
                                        <p className="text-lg font-black text-[#d4a574] tracking-tight mt-1">{purposeLabel}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest print:text-slate-500">Ticket Status</p>
                                        <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mt-1 border ${ticket.status === 'Serving'
                                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                            : ticket.status === 'Completed'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : ticket.status === 'Cancelled'
                                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                    : ticket.status === 'Expired'
                                                        ? 'bg-slate-200/60 text-slate-400 border-slate-300/50'
                                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                            }`}>
                                            {ticket.status}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {ticket.status === 'Pending' && (
                                <div className="pt-8 text-center space-y-2 print:hidden">
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Active Queue Position</p>
                                    <div className="text-5xl font-black text-[#d4a574] tracking-tighter">{queuePosition}</div>
                                    <p className="text-xs text-slate-500 max-w-xs mx-auto">Please keep this tab open or save the QR code to check status updates live.</p>
                                </div>
                            )}

                            {ticket.status === 'Serving' && (
                                <div className="pt-8 text-center space-y-2 bg-indigo-500/5 p-6 rounded-3xl border border-indigo-500/10 print:hidden animate-pulse">
                                    <MegaphoneIcon className="w-8 h-8 text-indigo-400 mx-auto" />
                                    <h4 className="font-black text-lg text-white">Your Ticket is Called!</h4>
                                    <p className="text-xs text-slate-300">Please proceed to the registry counter for document verification.</p>
                                </div>
                            )}

                            {ticket.status === 'Completed' && (
                                <div className="pt-8 text-center space-y-2 bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/10 print:hidden">
                                    <CheckCircleIcon className="w-8 h-8 text-emerald-400 mx-auto" />
                                    <h4 className="font-black text-lg text-white">Request Completed</h4>
                                    <p className="text-xs text-slate-300">Your document copy has been successfully issued. Thank you!</p>
                                </div>
                            )}

                            {ticket.status === 'Expired' && (
                                <div className="pt-8 text-center space-y-2 bg-slate-500/5 p-6 rounded-3xl border border-slate-500/10 print:hidden">
                                    <ClockIcon className="w-8 h-8 text-slate-400 mx-auto" />
                                    <h4 className="font-black text-lg text-slate-300">Ticket Expired</h4>
                                    <p className="text-xs text-slate-400">This ticket was valid until 5:00 PM on the day it was issued. Please request a new ticket.</p>
                                    <a href="/ticket-request" className="inline-block mt-3 px-5 py-2 bg-[#d4a574] text-[#0f172a] rounded-xl text-xs font-black uppercase tracking-widest">New Request</a>
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <div className="flex gap-4">
                            <button
                                onClick={handlePrint}
                                className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
                            >
                                <PrinterIcon className="w-4 h-4" />
                                Print Ticket
                            </button>
                            <Link
                                to="/ticket-request"
                                className="flex-1 flex items-center justify-center gap-2 bg-[#1a2f4a] text-white py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-[#112033] transition-all active:scale-95 text-center shadow-lg"
                            >
                                <PlusCircleIcon className="w-4 h-4" />
                                New Request
                            </Link>
                        </div>
                    </motion.div>
                )}
            </div>
        );
    }

    // ── RENDER STAFF QUEUE DASHBOARD (PRIVATE BOARD) ──────────────────────────────
    if (mode === 'staff') {
        const pendingTickets = tickets.filter(t => t.status === 'Pending');
        const servingTickets = tickets.filter(t => t.status === 'Serving');
        const expiredTickets = tickets.filter(t => t.status === 'Expired');
        const finishedTickets = tickets.filter(t => ['Completed', 'Cancelled', 'Expired'].includes(t.status));

        const getPurposeBadge = (purpose) => {
            const map = {
                birth: 'bg-blue-50 text-blue-700 border-blue-100',
                death: 'bg-slate-100 text-slate-600 border-slate-200',
                marriage: 'bg-rose-50 text-rose-700 border-rose-100'
            };
            return map[purpose] || 'bg-slate-50 text-slate-500';
        };

        return (
            <div className="p-1 sm:p-4 max-w-[1500px] mx-auto space-y-6">
                {/* Link Document Modal */}
                <AnimatePresence>
                    {isLinkModalOpen && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-slate-900 leading-normal">
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100"
                            >
                                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                                    <h3 className="font-bold text-slate-800 text-lg">Link Ticket to Scanned Record</h3>
                                    <button onClick={() => setIsLinkModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                                </div>

                                <div className="space-y-4 mb-6">
                                    <p className="text-xs text-slate-500">
                                        Select an uploaded record in the registry database to link to <b>{selectedTicket?.ticket_number}</b> (Client: {selectedTicket?.client_name}). This will complete the ticket request automatically.
                                    </p>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Select Record</label>
                                        <select
                                            value={selectedDocId}
                                            onChange={e => setSelectedDocId(e.target.value)}
                                            className="w-full p-3 border border-slate-200 rounded-xl text-sm font-semibold"
                                        >
                                            <option value="">Choose matching document...</option>
                                            {globalDocs.map(doc => (
                                                <option key={doc.id} value={doc.id}>
                                                    [{doc.type.toUpperCase()}] {doc.personName || doc.name} (Saved: {doc.date})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setIsLinkModalOpen(false)}
                                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleLinkDocument}
                                        disabled={!selectedDocId}
                                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                    >
                                        Link & Complete
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Walk-in Ticket Modal */}
                <AnimatePresence>
                    {isWalkInModalOpen && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-slate-900 leading-normal">
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100"
                            >
                                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                                    <h3 className="font-bold text-slate-800 text-lg">Walk-In Ticket</h3>
                                    <button onClick={() => { setIsWalkInModalOpen(false); setWalkInResult(null); }} className="text-slateate-400 hover:text-slate-600">✕</button>
                                </div>

                                {walkInResult ? (
                                    /* QR Result View */
                                    <div className="text-center space-y-4">
                                        <p className="text-sm font-bold text-emerald-600">✓ Ticket Generated!</p>
                                        <p className="text-2xl font-black text-slate-800 tracking-tight">{walkInResult.ticket_number}</p>
                                        <div className="flex justify-center">
                                            <div className="bg-white border-4 border-[#1a2f4a] rounded-2xl p-3 shadow-lg">
                                                <img
                                                    src={`data:image/svg+xml;base64,${walkInResult.qr_base64}`}
                                                    alt="Walk-In QR Code"
                                                    className="w-48 h-48"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-400">Show this QR or the ticket number at the counter.<br/>Expires at 5:00 PM today.</p>
                                        <div className="flex gap-3 pt-2">
                                            <button
                                                onClick={() => window.print()}
                                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1"
                                            >
                                                <PrinterIcon className="w-4 h-4" /> Print
                                            </button>
                                            <button
                                                onClick={() => { setWalkInResult(null); setIsWalkInModalOpen(false); }}
                                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1a2f4a] hover:bg-[#112033] transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* Form View */
                                    <form onSubmit={handleCreateWalkIn} className="space-y-4">
                                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-900 font-bold flex justify-between items-center">
                                            <span>Next Dedicated Ticket Number:</span>
                                            <span className="font-black text-sm bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200">
                                                {`WI-${new Date().getFullYear()}-${String(tickets.filter(t => t.source === 'walk_in').length + 1).padStart(4, '0')}`}
                                            </span>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Client Name</label>
                                            <input
                                                type="text"
                                                required
                                                value={walkInName}
                                                onChange={e => setWalkInName(e.target.value)}
                                                className="w-full p-3 border border-slate-200 rounded-xl text-sm font-semibold"
                                                placeholder="Client Name"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Purpose / Document Type</label>
                                            <select
                                                value={walkInPurpose}
                                                onChange={e => setWalkInPurpose(e.target.value)}
                                                className="w-full p-3 border border-slate-200 rounded-xl text-sm font-semibold"
                                            >
                                                <option value="birth">Birth Certificate</option>
                                                <option value="death">Death Certificate</option>
                                                <option value="marriage">Marriage Certificate</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Phone Number (Optional)</label>
                                            <input
                                                type="text"
                                                value={walkInPhone}
                                                onChange={e => setWalkInPhone(e.target.value)}
                                                className="w-full p-3 border border-slate-200 rounded-xl text-sm font-semibold"
                                                placeholder="09123456789"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Gmail / Email (Optional)</label>
                                            <input
                                                type="email"
                                                value={walkInEmail}
                                                onChange={e => setWalkInEmail(e.target.value)}
                                                className="w-full p-3 border border-slate-200 rounded-xl text-sm font-semibold"
                                                placeholder="client@gmail.com"
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-400 bg-amber-50 border border-amber-100 rounded-lg p-2">
                                            ⚠️ Walk-in tickets use prefix <strong>WI-</strong> and expire at 5:00 PM today.
                                        </p>
                                        <div className="flex gap-3 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => { setIsWalkInModalOpen(false); setWalkInResult(null); }}
                                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors cursor-pointer"
                                            >
                                                Generate Ticket
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Queue Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="bg-white/60 backdrop-blur-xl p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex items-center justify-between">
                        <div>
                            <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest mb-1">Pending in Line</p>
                            <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{pendingTickets.length}</h3>
                        </div>
                        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-100 shadow-sm">
                            <ClockIcon className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="bg-white/60 backdrop-blur-xl p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex items-center justify-between">
                        <div>
                            <p className="text-indigo-500 text-[10px] font-black uppercase tracking-widest mb-1">Serving Now</p>
                            <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{servingTickets.length}</h3>
                        </div>
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 border border-indigo-100 shadow-sm">
                            <PlayIcon className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="bg-white/60 backdrop-blur-xl p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex items-center justify-between">
                        <div>
                            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest mb-1">Completed Today</p>
                            <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{finishedTickets.filter(t => t.status === 'Completed').length}</h3>
                        </div>
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-100 shadow-sm">
                            <CheckCircleIcon className="w-6 h-6" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* Left: Queue Columns */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Queue View Switcher */}
                        <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/40 shadow-sm">
                            <button
                                onClick={() => setActiveQueueTab('active')}
                                className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${
                                    activeQueueTab === 'active'
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                📋 Active Queue
                            </button>
                            <button
                                onClick={() => setActiveQueueTab('history')}
                                className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${
                                    activeQueueTab === 'history'
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                ⏳ Daily History Log
                            </button>
                        </div>

                        {/* Filters & Control bar */}
                        <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex flex-col sm:flex-row gap-4 items-center justify-between">
                            <div className="flex gap-2 flex-wrap items-center">
                                <input
                                    type="text"
                                    placeholder="Search tickets..."
                                    value={dashboardSearch}
                                    onChange={e => setDashboardSearch(e.target.value)}
                                    className="px-4 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none"
                                />
                                <select
                                    value={dashboardPurpose}
                                    onChange={e => setDashboardPurpose(e.target.value)}
                                    className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none capitalize"
                                >
                                    <option value="all">All Documents</option>
                                    <option value="birth">Birth Certificate</option>
                                    <option value="death">Death Certificate</option>
                                    <option value="marriage">Marriage License</option>
                                </select>
                                <button
                                    onClick={fetchQueue}
                                    className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600"
                                >
                                    <ArrowPathIcon className={`w-4 h-4 ${isLoadingQueue ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <button
                                    onClick={() => setIsWalkInModalOpen(true)}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                                >
                                    <PlusCircleIcon className="w-4 h-4 text-emerald-500" />
                                    Walk-in Ticket
                                </button>
                            </div>
                        </div>

                        {activeQueueTab === 'active' ? (
                            /* Queue Lists Split */
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Pending List */}
                                <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 overflow-hidden flex flex-col h-[500px]">
                                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                        <h4 className="font-extrabold text-slate-800 text-sm">Pending Queue ({pendingTickets.length})</h4>
                                        <span className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-full text-[9px] font-black uppercase">In Line</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                        {pendingTickets.length === 0 ? (
                                            <div className="text-center py-20 text-slate-400">
                                                <TicketIcon className="w-10 h-10 mx-auto mb-2 opacity-10" />
                                                <p className="text-xs font-semibold">No pending requests</p>
                                            </div>
                                        ) : (
                                            pendingTickets.map((t, idx) => (
                                                <div
                                                    key={t.id}
                                                    onClick={() => setSelectedTicket(t)}
                                                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${selectedTicket?.id === t.id
                                                        ? 'border-indigo-500 bg-indigo-50/10 shadow-sm'
                                                        : 'border-slate-100 bg-white hover:bg-slate-50'
                                                        }`}
                                                >
                                                    <div>
                                                        <span className="text-[10px] font-black text-slate-400 tracking-wider">#{idx + 1} in queue</span>
                                                        <p className="font-black text-slate-800 text-sm tracking-tight">{t.ticket_number}</p>
                                                        <p className="text-xs text-slate-600 font-semibold truncate max-w-[18ch]">{t.client_name}</p>
                                                    </div>
                                                    <div className="flex flex-col gap-1 items-end shrink-0">
                                                        <span className={`px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${getPurposeBadge(t.purpose)}`}>
                                                            {t.purpose}
                                                        </span>
                                                        <span className={`px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${
                                                            t.source === 'walk_in'
                                                                ? 'bg-violet-50 text-violet-700 border-violet-100'
                                                                : 'bg-sky-50 text-sky-700 border-sky-100'
                                                        }`}>
                                                            {t.source === 'walk_in' ? 'Walk-in' : 'Online'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Serving & Finished list */}
                                <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 overflow-hidden flex flex-col h-[500px]">
                                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                                        <h4 className="font-extrabold text-slate-800 text-sm">Serving & Done</h4>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                        {/* Serving Section */}
                                        <div>
                                            <h5 className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-2">Currently Serving</h5>
                                            {servingTickets.length === 0 ? (
                                                <p className="text-xs text-slate-400 py-4 text-center italic">No ticket is currently called.</p>
                                            ) : (
                                                <div className="space-y-2.5">
                                                    {servingTickets.map(t => (
                                                        <div
                                                            key={t.id}
                                                            onClick={() => setSelectedTicket(t)}
                                                            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between border-indigo-200 bg-indigo-50/20 ${selectedTicket?.id === t.id ? 'ring-2 ring-indigo-500' : ''}`}
                                                        >
                                                            <div>
                                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                                    <p className="font-black text-indigo-700 text-sm tracking-tight">{t.ticket_number}</p>
                                                                    <span className={`px-1.5 py-0.2 rounded text-[7px] font-black uppercase ${
                                                                        t.source === 'walk_in'
                                                                            ? 'bg-violet-50 text-violet-700 border border-violet-100'
                                                                            : 'bg-sky-50 text-sky-700 border border-sky-100'
                                                                    }`}>
                                                                        {t.source === 'walk_in' ? 'Walk-in' : 'Online'}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-slate-700 font-bold truncate max-w-[15ch]">{t.client_name}</p>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); updateTicketStatus(t.id, 'Completed'); }}
                                                                    title="Complete Ticket"
                                                                    className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white"
                                                                >
                                                                    ✓
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); updateTicketStatus(t.id, 'Cancelled'); }}
                                                                    title="Cancel Ticket"
                                                                    className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Finished Section */}
                                        <div className="pt-4 border-t border-slate-100">
                                            <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Completed / Cancelled</h5>
                                            <div className="space-y-2 max-h-[220px] overflow-y-auto">
                                                {finishedTickets.map(t => (
                                                    <div
                                                        key={t.id}
                                                        onClick={() => setSelectedTicket(t)}
                                                        className={`p-3 rounded-lg border text-xs flex items-center justify-between ${selectedTicket?.id === t.id ? 'bg-slate-100 border-slate-300' : 'bg-slate-50 border-slate-100'}`}
                                                    >
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <p className="font-bold text-slate-700">{t.ticket_number}</p>
                                                                <span className={`text-[7px] font-black uppercase ${
                                                                    t.source === 'walk_in'
                                                                        ? 'text-violet-600'
                                                                        : 'text-sky-600'
                                                                }`}>
                                                                    {t.source === 'walk_in' ? 'Walk-in' : 'Online'}
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-slate-500">{t.client_name}</p>
                                                        </div>
                                                        <span className={`text-[8px] font-black uppercase ${t.status === 'Completed' ? 'text-emerald-500' : 'text-rose-400'}`}>
                                                            {t.status}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Daily History Log Table */
                            <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 overflow-hidden flex flex-col min-h-[500px]">
                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                    <h4 className="font-extrabold text-slate-800 text-sm">Today's Ticket Log History</h4>
                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full text-[9px] font-black uppercase">Daily History</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest font-black border-b border-slate-200">
                                                <th className="p-4 pl-6">Ticket No.</th>
                                                <th className="p-4">Recipient Name</th>
                                                <th className="p-4">Source</th>
                                                <th className="p-4">Type</th>
                                                <th className="p-4">Created Time</th>
                                                <th className="p-4">Status</th>
                                                <th className="p-4 pr-6 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 text-xs">
                                            {tickets.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" className="p-12 text-center text-slate-400">
                                                        <TicketIcon className="w-12 h-12 mx-auto mb-2 opacity-10" />
                                                        <p className="font-semibold">No tickets found for today</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                tickets.map((t) => (
                                                    <tr key={t.id} className={`hover:bg-slate-50/50 transition-colors ${selectedTicket?.id === t.id ? 'bg-indigo-50/20' : ''}`}>
                                                        <td className="p-4 pl-6 font-black text-slate-800">{t.ticket_number}</td>
                                                        <td className="p-4 font-semibold text-slate-700">{t.client_name}</td>
                                                        <td className="p-4">
                                                            <span className={`px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${
                                                                t.source === 'walk_in'
                                                                    ? 'bg-violet-50 text-violet-700 border-violet-100'
                                                                    : 'bg-sky-50 text-sky-700 border-sky-100'
                                                            }`}>
                                                                {t.source === 'walk_in' ? 'Walk-in' : 'Online'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className={`px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${getPurposeBadge(t.purpose)}`}>
                                                                {t.purpose}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-slate-400 font-mono">{new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                        <td className="p-4">
                                                            <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                                                                t.status === 'Serving'
                                                                    ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                                                                    : t.status === 'Completed'
                                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                                                        : t.status === 'Cancelled'
                                                                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                                                                            : t.status === 'Expired'
                                                                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                                                                : 'bg-amber-50 text-amber-600 border-amber-200'
                                                            }`}>
                                                                {t.status}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 pr-6 text-right">
                                                            <button
                                                                onClick={() => setSelectedTicket(t)}
                                                                className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded-lg transition-all border border-indigo-100 cursor-pointer"
                                                            >
                                                                View
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Ticket Detail Panel */}
                    <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 min-h-[500px] flex flex-col justify-between">
                        {!selectedTicket ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center py-20">
                                <TicketIcon className="w-12 h-12 opacity-10 mb-3" />
                                <h4 className="font-extrabold text-sm text-slate-600">Select a Ticket</h4>
                                <p className="text-xs max-w-[200px] mt-1">Click a ticket card to view details, verify QR tracking, or issue certificate templates.</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col justify-between h-full">
                                <div className="space-y-6">
                                    <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <span className={`inline-flex px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${getPurposeBadge(selectedTicket.purpose)}`}>
                                                    {selectedTicket.purpose}
                                                </span>
                                                <span className={`inline-flex px-2 py-0.5 border rounded-full text-[8px] font-black uppercase ${
                                                    selectedTicket.source === 'walk_in'
                                                        ? 'bg-violet-50 text-violet-600 border-violet-100'
                                                        : 'bg-sky-50 text-sky-600 border-sky-100'
                                                }`}>
                                                    {selectedTicket.source === 'walk_in' ? '🚶 Walk-in' : '🌐 Online'}
                                                </span>
                                            </div>
                                            <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none">{selectedTicket.ticket_number}</h3>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Status: {selectedTicket.status}</p>
                                        </div>
                                        <span className="text-xs text-slate-400 font-mono tabular-nums">{new Date(selectedTicket.created_at).toLocaleTimeString()}</span>
                                    </div>

                                    {/* Client Details */}
                                    <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Request Details</h4>
                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <p className="text-[9px] text-slate-400 uppercase">Client Name</p>
                                                <p className="font-extrabold text-slate-700">{selectedTicket.client_name}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-slate-400 uppercase">Contact Phone</p>
                                                <p className="font-extrabold text-slate-700">{selectedTicket.phone || '—'}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <p className="text-[9px] text-slate-400 uppercase">Email Address</p>
                                                <p className="font-extrabold text-slate-700">{selectedTicket.email || '—'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Registry Details Form Fields */}
                                    <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Metadata Collected</h4>
                                        <div className="space-y-2 text-xs">
                                            {selectedTicket.purpose === 'birth' && (
                                                <>
                                                    <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-400">Child's Name</span><span className="font-bold text-slate-700">{[selectedTicket.details?.first_name, selectedTicket.details?.middle_name, selectedTicket.details?.last_name].filter(Boolean).join(' ')}</span></div>
                                                    <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-400">Date of Birth</span><span className="font-bold text-slate-700">{selectedTicket.details?.date_of_birth}</span></div>
                                                    <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-400">Place of Birth</span><span className="font-bold text-slate-700 truncate max-w-[20ch]">{selectedTicket.details?.place_of_birth}</span></div>
                                                    <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-400">Father's Name</span><span className="font-bold text-slate-700">{selectedTicket.details?.father_name || '—'}</span></div>
                                                    <div className="flex justify-between pb-1.5"><span className="text-slate-400">Mother's Name</span><span className="font-bold text-slate-700">{selectedTicket.details?.mother_name || '—'}</span></div>
                                                </>
                                            )}
                                            {selectedTicket.purpose === 'death' && (
                                                <>
                                                    <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-400">Deceased Name</span><span className="font-bold text-slate-700">{[selectedTicket.details?.deceased_first_name, selectedTicket.details?.deceased_middle_name, selectedTicket.details?.deceased_last_name].filter(Boolean).join(' ')}</span></div>
                                                    <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-400">Date of Death</span><span className="font-bold text-slate-700">{selectedTicket.details?.date_of_death}</span></div>
                                                    <div className="flex justify-between pb-1.5"><span className="text-slate-400">Place of Death</span><span className="font-bold text-slate-700 truncate max-w-[20ch]">{selectedTicket.details?.place_of_death}</span></div>
                                                </>
                                            )}
                                            {selectedTicket.purpose === 'marriage' && (
                                                <>
                                                    <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-400">Husband's Name</span><span className="font-bold text-slate-700">{[selectedTicket.details?.husband_first_name, selectedTicket.details?.husband_middle_name, selectedTicket.details?.husband_last_name].filter(Boolean).join(' ')}</span></div>
                                                    <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-400">Wife's Name</span><span className="font-bold text-slate-700">{[selectedTicket.details?.wife_first_name, selectedTicket.details?.wife_middle_name, selectedTicket.details?.wife_last_name].filter(Boolean).join(' ')}</span></div>
                                                    <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-400">Date of Marriage</span><span className="font-bold text-slate-700">{selectedTicket.details?.date_of_marriage}</span></div>
                                                    <div className="flex justify-between pb-1.5"><span className="text-slate-400">Place of Marriage</span><span className="font-bold text-slate-700 truncate max-w-[20ch]">{selectedTicket.details?.place_of_marriage}</span></div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 pt-4 border-t border-slate-100 space-y-2">
                                    {selectedTicket.status === 'Serving' && (
                                        <>
                                            <button
                                                onClick={() => handlePrefill(selectedTicket)}
                                                className="w-full flex items-center justify-center gap-2 py-3 bg-[#1a2f4a] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#112033] shadow-md transition-all active:scale-95 cursor-pointer"
                                            >
                                                <PlusCircleIcon className="w-5 h-5 text-[#d4a574]" />
                                                Pre-fill Template
                                            </button>
                                            <button
                                                onClick={() => setIsLinkModalOpen(true)}
                                                className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 shadow-sm transition-all active:scale-95 cursor-pointer"
                                            >
                                                <LinkIcon className="w-4 h-4 text-indigo-500" />
                                                Link Existing Record
                                            </button>
                                        </>
                                    )}
                                    {selectedTicket.status === 'Pending' && (
                                        <button
                                            onClick={() => updateTicketStatus(selectedTicket.id, 'Serving')}
                                            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-md transition-all active:scale-95 cursor-pointer"
                                        >
                                            <PlayIcon className="w-4 h-4" />
                                            Call / Serve Ticket
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}
