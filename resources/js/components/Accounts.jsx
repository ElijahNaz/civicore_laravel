import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
    UserIcon, ShieldCheckIcon, AdjustmentsHorizontalIcon, 
    AtSymbolIcon, TagIcon, PlusIcon, KeyIcon, TrashIcon, CheckCircleIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { useModal } from './ModalContext.jsx';
import SkeletonLoader from './SkeletonLoader.jsx';

const Accounts = () => {
    const { showAlert } = useModal();
    const [isLoading, setIsLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [newUserFormData, setNewUserFormData] = useState({ name: '', email: '', role: 'Staff', password: '' });
    const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
    const [changePasswordFormData, setChangePasswordFormData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false);
    const [deleteUserPassword, setDeleteUserPassword] = useState('');
    const chartRef = useRef(null);
    const canvasRef = useRef(null);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/users', { credentials: 'include' });
            const data = await res.json();
            if (data.data) {
                // Map the DB standard fields to the UI names
                const updatedUsers = data.data.map(u => ({
                    ...u,
                    status: 'Active',
                    joined: new Date(u.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                }));
                setUsers(updatedUsers);
                sessionStorage.setItem('cache_users', JSON.stringify(updatedUsers));
            }
        } catch (e) {
            console.error("Error fetching users:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/create-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(newUserFormData)
            });
            const data = await res.json();
            if (data.success) {
                await fetchUsers(true); // Refresh and invalidate cache
                setIsAddUserModalOpen(false);
                setNewUserFormData({ name: '', email: '', role: 'Staff', password: '' });
                showAlert({
                    title: 'Account Created',
                    message: "Account has been created successfully!",
                    type: 'success'
                });
            } else {
                showAlert({
                    title: 'Creation Failed',
                    message: data.error || "Failed to create account.",
                    type: 'error'
                });
            }
        } catch (err) {
            showAlert({
                title: 'Network Error',
                message: "A network error occurred.",
                type: 'error'
            });
        }
    };

    const handleChangePasswordSubmit = async (e) => {
        e.preventDefault();
        if (changePasswordFormData.newPassword !== changePasswordFormData.confirmPassword) {
            showAlert({
                title: 'Password Mismatch',
                message: "New passwords do not match!",
                type: 'warning'
            });
            return;
        }
        
        try {
            const res = await fetch('/api/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    userId: selectedUser.id,
                    currentPassword: changePasswordFormData.oldPassword,
                    newPassword: changePasswordFormData.newPassword
                })
            });
            const data = await res.json();
            if (data.success) {
                showAlert({
                    title: 'Password Changed',
                    message: `Password successfully changed for ${selectedUser.name}!`,
                    type: 'success'
                });
                setIsChangePasswordModalOpen(false);
                setChangePasswordFormData({ oldPassword: '', newPassword: '', confirmPassword: '' });
            } else {
                showAlert({
                    title: 'Change Failed',
                    message: data.error || data.message || "Failed to change password.",
                    type: 'error'
                });
            }
        } catch (err) {
            showAlert({
                title: 'Network Error',
                message: "A network error occurred.",
                type: 'error'
            });
        }
    };

    const handleDeleteUserSubmit = async (e) => {
        e.preventDefault();
        if (deleteUserPassword === '') return;
        
        try {
            const sessionUser = JSON.parse(sessionStorage.getItem('user') || '{}');
            if (!sessionUser.id) {
                showAlert({
                    title: 'Session Expired',
                    message: "Admin session not found. Please log in again.",
                    type: 'warning'
                });
                return;
            }

            // 1. Verify admin password
            const verifyRes = await fetch('/api/verify-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: sessionUser.id, password: deleteUserPassword })
            });
            const verifyData = await verifyRes.json();
            
            if (!verifyData.success) {
                showAlert({
                    title: 'Invalid Password',
                    message: verifyData.message || "Invalid admin password.",
                    type: 'error'
                });
                return;
            }

            // 2. Delete user
            const delRes = await fetch(`/api/users/${selectedUser.id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const delData = await delRes.json();
            
            if (delData.success) {
                await fetchUsers(true); // Refresh and invalidate cache
                setIsDeleteUserModalOpen(false);
                setDeleteUserPassword('');
                showAlert({
                    title: 'Account Deleted',
                    message: "Account successfully deleted.",
                    type: 'success'
                });
            } else {
                showAlert({
                    title: 'Deletion Failed',
                    message: "Failed to delete account.",
                    type: 'error'
                });
            }
        } catch (err) {
            showAlert({
                title: 'Network Error',
                message: "A network error occurred.",
                type: 'error'
            });
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // Set first user as default selection when data loads
    useEffect(() => {
        if (users.length > 0) {
            const currentUserRole = JSON.parse(sessionStorage.getItem('user') || '{}').role;
            // For non-admins, always force selection of themselves (the only user in the list)
            if (currentUserRole !== 'Admin' || !selectedUser) {
                setSelectedUser(users[0]);
            }
        }
    }, [users]);

    // Initialize Chart
    useEffect(() => {
        if (isLoading) return;
        
        if (canvasRef.current && window.Chart) {
            if (chartRef.current) chartRef.current.destroy();

            const ctx = canvasRef.current.getContext('2d');
            chartRef.current = new window.Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Administrators', 'Staff Officers', 'Viewers/Analysts'],
                    datasets: [{
                        data: [1, 2, 1],
                        backgroundColor: ['#0f172a', '#d4a574', '#64748b'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '75%',
                    plugins: {
                        legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, font: { family: "'Inter', sans-serif", size: 11 } } }
                    }
                }
            });
        }
        return () => { if (chartRef.current) chartRef.current.destroy(); };
    }, [isLoading]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
    };

    // Render layout immediately, skeletons for data sections
    return (
        <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 max-w-7xl mx-auto"
        >
            {/* Header */}
            <motion.div variants={itemVariants} className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <ShieldCheckIcon className="w-8 h-8 text-[#d4a574]" />
                        {JSON.parse(sessionStorage.getItem('user') || '{}').role === 'Admin' ? 'System Accounts' : 'My Account'}
                    </h2>
                    <p className="text-slate-500 font-medium text-sm mt-1">
                        {JSON.parse(sessionStorage.getItem('user') || '{}').role === 'Admin' 
                            ? 'Manage personnel access and permission levels.' 
                            : 'View and manage your account security settings.'}
                    </p>
                </div>
                {JSON.parse(sessionStorage.getItem('user') || '{}').role === 'Admin' && (
                    <button 
                        onClick={() => setIsAddUserModalOpen(true)}
                        className="flex items-center gap-2 bg-[#0f172a] text-white hover:bg-slate-800 transition-colors px-4 py-2 rounded-xl text-sm font-bold shadow-sm"
                    >
                        <PlusIcon className="w-4 h-4" /> New Account
                    </button>
                )}
            </motion.div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Sidebar: User List Segment - ONLY for Superadmin */}
                {JSON.parse(sessionStorage.getItem('user') || '{}').role === 'Admin' && (
                    <motion.div variants={itemVariants} className="lg:col-span-4 bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 overflow-hidden flex flex-col h-[600px]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    placeholder="Search employees..."
                                    className="block w-full pl-4 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] sm:text-sm transition-all"
                                />
                            </div>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 p-3 space-y-2">
                            {isLoading ? (
                                <SkeletonLoader type="list" rows={8} />
                            ) : users.map((user) => (
                                <div 
                                    key={user.id}
                                    onClick={() => setSelectedUser(user)}
                                    className={`group flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all border ${
                                        selectedUser?.id === user.id 
                                            ? 'border-slate-200 bg-slate-50 shadow-sm' 
                                            : 'border-transparent hover:bg-slate-50/50'
                                    }`}
                                >
                                    <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm border ${
                                        selectedUser?.id === user.id ? 'bg-[#0f172a] text-[#d4a574] border-slate-800' : 'bg-white text-slate-600 border-slate-200'
                                    }`}>
                                        {user.name.charAt(0)}
                                        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${user.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <h4 className="font-bold text-slate-800 text-sm truncate">{user.name}</h4>
                                        <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{user.role}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Right Panel: Account Details & Charts - Full width if not Superadmin */}
                <motion.div variants={itemVariants} className={`${JSON.parse(sessionStorage.getItem('user') || '{}').role === 'Admin' ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
                    
                    {/* Selected User Details Card */}
                    <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 overflow-hidden relative">
                        {/* Decorative Top Banner */}
                        <div className="h-24 bg-gradient-to-r from-[#0f172a] via-slate-800 to-[#1e293b] w-full relative">
                            {/* SVG pattern overlay */}
                            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h20v20H0z' fill='none'/%3E%3Ccircle cx='10' cy='10' r='1' fill='%23fff'/%3E%3C/svg%3E")`}}></div>
                        </div>

                        {isLoading ? (
                            <div className="p-8">
                                <SkeletonLoader type="default" />
                            </div>
                        ) : selectedUser ? (
                            <div className="px-8 pb-8">
                                {/* Profile Avatar popping up over banner */}
                                <div className="flex justify-between items-end -mt-10 mb-6 relative z-10">
                                    <div className="w-24 h-24 rounded-2xl bg-white p-1.5 shadow-lg border border-slate-100">
                                        <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center text-4xl font-black text-slate-400">
                                            {(selectedUser.name || 'U').charAt(0).toUpperCase()}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer">
                                            <AdjustmentsHorizontalIcon className="w-4 h-4" /> Edit Profile
                                        </button>
                                    </div>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 mb-1">{selectedUser.name}</h3>
                                        <div className="flex items-center gap-2 mb-6 text-sm">
                                            {selectedUser.status === 'Active' ? (
                                                <span className="flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-100 text-[10px] uppercase tracking-wider">
                                                    <CheckCircleIcon className="w-3.5 h-3.5" /> Active Account
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-slate-500 font-bold bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200 text-[10px] uppercase tracking-wider">
                                                    Inactivated
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                                                    <AtSymbolIcon className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Email Address</p>
                                                    <p className="text-sm font-semibold text-slate-700">{selectedUser.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                                                    <TagIcon className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">System Role</p>
                                                    <p className="text-sm font-semibold text-slate-700">{selectedUser.role}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex flex-col justify-center gap-3">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Security & Actions</p>
                                        <button onClick={() => setIsChangePasswordModalOpen(true)} className="flex items-center justify-between w-full p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all group cursor-pointer">
                                            <span className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                                <KeyIcon className="w-5 h-5 text-slate-400 group-hover:text-[#d4a574] transition-colors" /> Change Password
                                            </span>
                                            <span className="text-slate-300 group-hover:text-slate-500">→</span>
                                        </button>
                                        {/* Only Admin can delete other accounts. Admin cannot delete themselves here. */}
                                        {JSON.parse(sessionStorage.getItem('user') || '{}').role === 'Admin' && selectedUser?.id !== JSON.parse(sessionStorage.getItem('user') || '{}').id && (
                                            <button onClick={() => setIsDeleteUserModalOpen(true)} className="flex items-center justify-between w-full p-3 bg-white border border-rose-100 rounded-xl hover:border-rose-300 transition-all group cursor-pointer">
                                                <span className="flex items-center gap-3 text-sm font-semibold text-rose-600">
                                                    <TrashIcon className="w-5 h-5 text-rose-400 group-hover:text-rose-600 transition-colors" /> Delete Account
                                                </span>
                                                <span className="text-rose-300 group-hover:text-rose-500">→</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : !isLoading && JSON.parse(sessionStorage.getItem('user') || '{}').role === 'Admin' ? (
                            <div className="flex flex-col items-center justify-center p-16 text-center h-[300px]">
                                <UserIcon className="w-16 h-16 text-slate-200 mb-4" />
                                <h3 className="text-lg font-bold text-slate-600">No Account Selected</h3>
                                <p className="text-sm text-slate-400 mt-1">Select a user from the list to view particulars.</p>
                            </div>
                        ) : !isLoading && users.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-16 text-center h-[300px]">
                                <ExclamationTriangleIcon className="w-16 h-16 text-rose-200 mb-4" />
                                <h3 className="text-lg font-bold text-slate-600 italic uppercase">Account Not Found</h3>
                                <p className="text-sm text-slate-400 mt-1 mb-6">Your session might be stale after the system database reset.</p>
                                <button 
                                    onClick={() => {
                                        sessionStorage.clear();
                                        window.location.href = '/login';
                                    }}
                                    className="px-6 py-2.5 bg-[#0f172a] text-[#d4a574] text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors"
                                >
                                    Log out & SIGN IN AGAIN
                                </button>
                            </div>
                        ) : (
                            <div className="p-8">
                                <SkeletonLoader type="default" />
                            </div>
                        )}
                    </div>

                    {/* Lower Section: Structure Distribution & Permissions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Analytics Chart */}
                        <div className="bg-white/60 backdrop-blur-xl p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex flex-col">
                            <div className="mb-4">
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Role Distribution</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Categorized by systemic permission level</p>
                            </div>
                            <div className="flex-1 relative w-full min-h-[160px] flex items-center justify-center">
                                {isLoading ? (
                                     <div className="w-full h-full flex items-center justify-center">
                                         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d4a574]"></div>
                                     </div>
                                ) : (
                                    <canvas ref={canvasRef}></canvas>
                                )}
                            </div>
                        </div>

                        {/* Permissions Overview */}
                        <div className="bg-gradient-to-br from-slate-800 to-[#0f172a] p-6 rounded-2xl shadow-sm border border-[#0f172a] flex flex-col relative overflow-hidden text-white">
                            <div className="absolute right-[-10%] top-[-10%] w-32 h-32 bg-[#d4a574]/10 rounded-full blur-2xl"></div>
                            
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2 relative z-10">
                                <ShieldCheckIcon className="w-5 h-5 text-[#d4a574]" /> Matrix Overview
                            </h3>
                            
                            <div className="space-y-4 relative z-10 flex-1 flex flex-col justify-center">
                                <div className="border-l-2 border-[#d4a574] pl-3">
                                    <h4 className="text-xs font-bold text-[#d4a574] uppercase tracking-widest mb-1">Administrator</h4>
                                    <p className="text-xs text-slate-300 leading-relaxed">Full access rights including mapping analytics, global deletions, and personnel overrides.</p>
                                </div>
                                <div className="border-l-2 border-slate-600 pl-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Staff Officer</h4>
                                    <p className="text-xs text-slate-300 leading-relaxed">Daily operations: processing document intake, OCR extraction, and physical issuances.</p>
                                </div>
                            </div>
                        </div>

                    </div>
                </motion.div>
            </div>

            {/* Add User Modal */}
            {isAddUserModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative"
                    >
                        <div className="h-20 bg-gradient-to-r from-[#0f172a] to-slate-800 p-6 flex items-center justify-between border-b border-slate-700">
                            <h3 className="text-xl font-black text-[#d4a574] flex items-center gap-2">
                                <ShieldCheckIcon className="w-6 h-6" /> Create Account
                            </h3>
                            <button onClick={() => setIsAddUserModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleAddUser} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label>
                                <input required type="text" value={newUserFormData.name} onChange={e => setNewUserFormData({...newUserFormData, name: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors" placeholder="e.g. John Doe" />
                            </div>
                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label>
                                                <input required type="email" value={newUserFormData.email} onChange={e => setNewUserFormData({...newUserFormData, email: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors" placeholder="john@example.com" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Set Password</label>
                                                <input required type="password" value={newUserFormData.password} onChange={e => setNewUserFormData({...newUserFormData, password: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors" placeholder="••••••••" />
                                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">System Role</label>
                                <select value={newUserFormData.role} onChange={e => setNewUserFormData({...newUserFormData, role: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-bold text-slate-700 bg-slate-50 focus:bg-white transition-colors cursor-pointer appearance-none">
                                    <option value="User">User</option>
                                    <option value="Staff">Staff</option>
                                    <option value="Admin">Admin</option>
                                </select>
                            </div>
                            <div className="pt-6 flex gap-3">
                                <button type="button" onClick={() => setIsAddUserModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-[#0f172a] text-[#d4a574] font-black rounded-xl hover:bg-slate-800 transition-colors text-sm shadow-md">Create User</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Change Password Modal */}
            {isChangePasswordModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative"
                    >
                        <div className="h-20 bg-gradient-to-r from-[#0f172a] to-slate-800 p-6 flex items-center justify-between border-b border-slate-700">
                            <h3 className="text-xl font-black text-[#d4a574] flex items-center gap-2">
                                <KeyIcon className="w-6 h-6" /> Change Password
                            </h3>
                            <button onClick={() => setIsChangePasswordModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleChangePasswordSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Old Password</label>
                                <input required type="password" value={changePasswordFormData.oldPassword} onChange={e => setChangePasswordFormData({...changePasswordFormData, oldPassword: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors" placeholder="••••••••" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">New Password</label>
                                <input required type="password" value={changePasswordFormData.newPassword} onChange={e => setChangePasswordFormData({...changePasswordFormData, newPassword: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors" placeholder="••••••••" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm New Password</label>
                                <input required type="password" value={changePasswordFormData.confirmPassword} onChange={e => setChangePasswordFormData({...changePasswordFormData, confirmPassword: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors" placeholder="••••••••" />
                            </div>
                            <div className="pt-6 flex gap-3">
                                <button type="button" onClick={() => setIsChangePasswordModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-[#0f172a] text-[#d4a574] font-black rounded-xl hover:bg-slate-800 transition-colors text-sm shadow-md">Save Changes</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Delete Account Modal */}
            {isDeleteUserModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative border border-rose-100"
                    >
                        <div className="h-20 bg-gradient-to-r from-rose-900 to-rose-700 p-6 flex items-center justify-between border-b border-rose-800">
                            <h3 className="text-xl font-black text-white flex items-center gap-2">
                                <TrashIcon className="w-6 h-6" /> Delete Account
                            </h3>
                            <button onClick={() => setIsDeleteUserModalOpen(false)} className="text-rose-200 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleDeleteUserSubmit} className="p-6 space-y-4">
                            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl mb-4">
                                <p className="text-sm font-semibold text-rose-800">
                                    You are about to permanently delete <strong>{selectedUser?.name}</strong>. This action cannot be undone. Enter your administrative password to confirm.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Your Password</label>
                                <input required type="password" value={deleteUserPassword} onChange={e => setDeleteUserPassword(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors" placeholder="••••••••" />
                            </div>
                            <div className="pt-6 flex gap-3">
                                <button type="button" onClick={() => setIsDeleteUserModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-rose-600 text-white font-black rounded-xl hover:bg-rose-700 transition-colors text-sm shadow-md shadow-rose-600/20">Confirm Deletion</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
};

export default Accounts;    