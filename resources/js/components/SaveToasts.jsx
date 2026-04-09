import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    CloudArrowUpIcon, CheckCircleIcon, 
    ExclamationCircleIcon, ArrowPathIcon 
} from '@heroicons/react/24/outline';

const SaveToasts = ({ tasks }) => {
    // Only show tasks that are finished (Success or Error)
    const finishedTasks = tasks?.filter(t => t.status === 'success' || t.status === 'error' || t.status === 'deleted') || [];
    
    if (finishedTasks.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[999999] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence mode="popLayout">
                {finishedTasks.map((task) => (
                    <motion.div
                        key={task.id}
                        initial={{ x: 100, opacity: 0, scale: 0.9 }}
                        animate={{ x: 0, opacity: 1, scale: 1 }}
                        exit={{ x: 100, opacity: 0, scale: 0.8 }}
                        layout
                        className="pointer-events-auto"
                    >
                        <div className={`
                            min-w-[300px] p-4 rounded-2xl border shadow-2xl flex items-center gap-4 backdrop-blur-xl transition-colors duration-500
                            ${(task.status === 'success' || task.status === 'deleted') ? 'bg-emerald-500/95 border-emerald-400 text-white' : 
                              'bg-rose-500/95 border-rose-400 text-white'}
                        `}>
                            {/* Icon Logic */}
                            <div className="flex-shrink-0">
                                {(task.status === 'success' || task.status === 'deleted') ? (
                                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                        <CheckCircleIcon className="w-6 h-6 text-white" />
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                        <ExclamationCircleIcon className="w-6 h-6 text-white" />
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 mb-0.5">
                                    {task.status === 'error' ? 'Sync Interrupted' : 'Action Complete'}
                                </h4>
                                <p className="text-sm font-black truncate leading-tight">
                                    {task.name || 'Document Processed'}
                                </p>
                                <p className="text-[10px] font-bold opacity-80">
                                    {task.status === 'error' ? (task.message || 'Operation failed') : 'Successfully secured records'}
                                </p>
                            </div>

                            {/* Status Mark */}
                            <div className="flex-shrink-0 h-2 w-2 rounded-full bg-white animate-pulse" />
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

export default SaveToasts;
