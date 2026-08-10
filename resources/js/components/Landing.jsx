import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ClockIcon, MegaphoneIcon } from '@heroicons/react/24/outline';

export default function Landing() {
    const navigate = useNavigate();

    const [config, setConfig] = useState(null);
    const [stats, setStats] = useState({ processed: '...', response_s: '...' });

    useEffect(() => {
        fetch('/api/public/config')
            .then(res => {
                if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
                return res.json();
            })
            .then(data => setConfig(data))
            .catch(err => console.error(err));

        fetch('/api/public/stats')
            .then(res => {
                if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
                return res.json();
            })
            .then(data => setStats(data))
            .catch(err => console.error(err));
    }, []);

    // Animation Variants for staggered, smooth entrance
    const containerVars = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.2, delayChildren: 0.3 }
        }
    };

    const itemVars = {
        hidden: { opacity: 0, y: 30 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
        }
    };

    return (
        <div className="relative overflow-visible pb-24">
            {/* Ambient Lighting FX */}
            <div className="absolute top-0 right-[-10%] w-[60%] h-[60%] bg-[#d4a574]/10 blur-[150px] rounded-full pointer-events-none" />

            {/* Hero Section */}
            <main className="min-h-[85vh] flex items-center px-6 md:px-12 lg:px-24 z-10 relative">
                <motion.div
                    variants={containerVars}
                    initial="hidden"
                    animate="visible"
                    className="max-w-5xl"
                >
                    {/* Status Badge */}
                    <motion.div variants={itemVars} className="mb-6 flex items-center gap-3">
                        <span className="px-3 py-1 rounded-full bg-[#d4a574]/10 border border-[#d4a574]/20 text-[#d4a574] text-xs font-bold uppercase tracking-widest">Office of the Civil Registrar</span>
                        <span className="text-slate-400 text-sm font-medium">Official Registry Platform</span>
                    </motion.div>

                    {/* Main Headline */}
                    <motion.h1
                        variants={itemVars}
                        className="text-5xl md:text-7xl lg:text-8xl font-black text-white leading-[0.9] tracking-tighter mb-8"
                    >
                        RECORDING.<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#d4a574] to-[#f3d0a2] drop-shadow-sm">PRESERVING.</span><br />
                        SERVING.
                    </motion.h1>

                    <motion.div variants={itemVars} className="space-y-8">
                        <p className="text-slate-300 text-lg md:text-xl max-w-2xl leading-relaxed font-light border-l-2 border-[#d4a574]/30 pl-6">
                            The centralized hub for authenticating and managing civil events—Births, Marriages, and Deaths—for the Municipality of Naic.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <motion.button
                                whileHover={{ scale: 1.02, translateY: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => navigate('/login')}
                                className="bg-gradient-to-r from-[#d4a574] to-[#c49a67] text-[#0f172a] px-10 py-5 rounded-2xl font-black shadow-xl shadow-[#d4a574]/20 transition-all uppercase tracking-[0.15em] text-sm flex items-center justify-center gap-3 group cursor-pointer"
                            >
                                Enter Portal
                                <span className="text-lg group-hover:translate-x-1 transition-transform">→</span>
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.05)" }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => navigate('/ticket-request')}
                                className="bg-transparent border border-slate-600 text-white px-10 py-5 rounded-2xl font-bold hover:border-[#d4a574]/50 hover:text-[#d4a574] transition-all uppercase tracking-[0.15em] text-sm flex items-center justify-center cursor-pointer"
                            >
                                Online Request
                            </motion.button>
                        </div>

                        {/* Operating Hours — skeleton while loading */}
                        {config === null ? (
                            <div className="mt-8 max-w-sm animate-pulse">
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-full bg-white/10" />
                                    <div className="flex-1 space-y-1.5">
                                        <div className="h-2.5 w-24 bg-white/10 rounded-full" />
                                        <div className="h-3.5 w-48 bg-white/10 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        ) : config?.opening_hours ? (
                            <motion.div variants={itemVars} className="mt-8 flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-4 max-w-sm">
                                <ClockIcon className="w-5 h-5 text-[#d4a574]" />
                                <div>
                                    <div className="text-[10px] text-[#d4a574] font-bold uppercase tracking-widest leading-none mb-1">Operating Hours</div>
                                    <div className="text-white font-medium text-sm">{config.opening_hours}</div>
                                </div>
                            </motion.div>
                        ) : null}

                        {/* Announcements — skeleton while loading */}
                        {config === null ? (
                            <div className="mt-4 space-y-3 max-w-md animate-pulse">
                                {[...Array(2)].map((_, i) => (
                                    <div key={i} className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-4">
                                        <div className="h-2 w-28 bg-white/10 rounded-full mb-2" />
                                        <div className="h-3.5 w-full bg-white/10 rounded-full" />
                                    </div>
                                ))}
                            </div>
                        ) : config?.announcements && config.announcements.length > 0 ? (
                            <motion.div variants={itemVars} className="mt-4 flex flex-col gap-3 max-w-md">
                                {config.announcements.slice(0, 2).map((ann) => (
                                    <div key={ann.id} className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 relative overflow-hidden group">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 opacity-80"></div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <MegaphoneIcon className="w-4 h-4 text-rose-400" />
                                            <span className="text-[10px] text-rose-300 font-bold uppercase tracking-widest">
                                                Active Alert • {new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                        <p className="text-white font-medium text-sm leading-snug">{ann.message}</p>
                                    </div>
                                ))}
                            </motion.div>
                        ) : null}
                    </motion.div>
                </motion.div>

                {/* Right Side Abstract Visuals for Desktop */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1.2, delay: 0.4 }}
                    className="hidden lg:block absolute right-12 top-1/2 -translate-y-1/2 w-[400px] h-[500px] pointer-events-none perspective-normal"
                >
                    {/* Floating decorative cards */}
                    <div className="absolute inset-0 border border-[#d4a574]/20 rounded-3xl rotate-6 transition-transform duration-700" />
                    <div className="absolute inset-4 border border-white/5 bg-white/[0.02] backdrop-blur-3xl rounded-3xl -rotate-3 overflow-hidden shadow-2xl flex flex-col justify-end p-8 group/card">
                        <div className="absolute top-10 -right-10 w-32 h-32 bg-[#d4a574]/20 blur-3xl rounded-full" />

                        {/* Dynamic Mini Dashboard Visual */}
                        <div className="flex-1 flex flex-col justify-center gap-6 mb-8 mt-4">
                            <div className="relative group/scan">
                                <div className="flex items-end gap-1 h-12 mb-2">
                                    {[40, 70, 45, 90, 65, 80, 50].map((h, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${h}%` }}
                                            transition={{ repeat: Infinity, repeatType: "reverse", duration: 1 + i * 0.2 }}
                                            className="w-full bg-gradient-to-t from-[#d4a574]/40 to-[#d4a574] rounded-t-sm"
                                        />
                                    ))}
                                </div>
                                <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Records Verification</span>
                                    <span className="text-[#d4a574]">100% Authentic</span>
                                </div>
                                <motion.div
                                    animate={{ top: ['0%', '100%', '0%'] }}
                                    transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                                    className="absolute left-0 right-0 h-[1px] bg-[#d4a574] shadow-[0_0_15px_#d4a574] z-10 opacity-50"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Processed</div>
                                    <div className="text-white font-black text-xl tracking-tight">{stats.processed >= 1000 ? (stats.processed / 1000).toFixed(1) + 'K' : stats.processed}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Response</div>
                                    <div className="text-white font-black text-xl tracking-tight">{stats.response_s}s</div>
                                </div>
                            </div>
                        </div>

                        <div className="w-16 h-1 bg-[#d4a574]/50 mb-6 rounded-full" />
                        <h3 className="text-white font-bold text-2xl tracking-tight mb-2">Registry Excellence</h3>
                        <p className="text-slate-400 text-sm font-medium">Securing our citizens' legal rights through definitive civil documentation.</p>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}