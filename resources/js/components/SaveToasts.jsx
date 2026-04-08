import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    CloudArrowUpIcon, CheckCircleIcon, 
    ExclamationCircleIcon, ArrowPathIcon 
} from '@heroicons/react/24/outline';

const SaveToasts = ({ tasks }) => {
    // tasks: [{ id, name, status: 'saving'|'success'|'error', message }]
    if (!tasks || tasks.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[999999] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {tasks.map((task) => (
                    <motion.div
                        key={task.id}
                        initial={{ x: 100, opacity: 0, scale: 0.9 }}
                        animate={{ x: 0, opacity: 1, scale: 1 }}
                        exit={{ x: 100, opacity: 0, scale: 0.8 }}
                        layout
                        className="pointer-events-auto"
                    >
                        <div className={`
                            min-w-[280px] p-4 rounded-2xl border shadow-2xl flex items-center gap-4 backdrop-blur-xl transition-colors duration-500
                            ${(task.status === 'success' || task.status === 'deleted') ? 'bg-emerald-500/95 border-emerald-400 text-white' : 
                              task.status === 'error' ? 'bg-rose-500/95 border-rose-400 text-white' : 
                              'bg-slate-900/90 border-slate-700 text-white'}
                        `}>
                            {/* Icon Logic */}
                            <div className="flex-shrink-0">
                                {(task.status === 'saving' || task.status === 'deleting') && (
                                    <div className="relative">
                                        <ArrowPathIcon className="w-6 h-6 animate-spin opacity-50" />
                                        {task.status === 'saving' 
                                            ? <CloudArrowUpIcon className="w-6 h-6 absolute inset-0 animate-pulse text-indigo-400" />
                                            : <div className="absolute inset-0 flex items-center justify-center opacity-70">🗑️</div>
                                        }
                                    </div>
                                )}
                                {(task.status === 'success' || task.status === 'deleted') && (
                                    <CheckCircleIcon className="w-8 h-8 text-white animate-bounce" />
                                )}
                                {task.status === 'error' && (
                                    <ExclamationCircleIcon className="w-8 h-8 text-white animate-shake" />
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <h4 className="text-[11px] font-black uppercase tracking-[0.1em] opacity-60">
                                    {task.status === 'saving' ? 'Syncing to Registry...' : 
                                     task.status === 'deleting' ? 'Removing Document...' :
                                     task.status === 'success' ? 'Record Secured' : 
                                     task.status === 'deleted' ? 'Document Removed' : 'Sync Failed'}
                                </h4>
                                <p className="text-sm font-bold truncate">
                                    {task.name || 'Document Data'}
                                </p>
                            </div>

                            {/* Status Pill */}
                            {(task.status === 'saving' || task.status === 'deleting') && (
                                <div className="px-2 py-0.5 bg-white/10 rounded-md">
                                    <span className="text-[9px] font-black animate-pulse uppercase">Live</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

export default SaveToasts;
