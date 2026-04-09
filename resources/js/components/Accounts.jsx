import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
    UserIcon, ShieldCheckIcon, AdjustmentsHorizontalIcon, 
    AtSymbolIcon, TagIcon, PlusIcon, KeyIcon, TrashIcon, CheckCircleIcon,
    ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, XMarkIcon, CameraIcon
} from '@heroicons/react/24/outline';
import { useModal } from './ModalContext.jsx';
import SkeletonLoader from './SkeletonLoader.jsx';
import Avatar from './Avatar.jsx';
import { AVATAR_LIBRARY } from './AvatarLibrary.js';

const Accounts = () => {
    const { showAlert } = useModal();
    const [isLoading, setIsLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [newUserFormData, setNewUserFormData] = useState({ name: '', email: '', role: 'Staff', password: '' });
    const [showNewUserPassword, setShowNewUserPassword] = useState(false);
    const [isAddingUser, setIsAddingUser] = useState(false);

    const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
    const [changePasswordFormData, setChangePasswordFormData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false);
    const [deleteUserPassword, setDeleteUserPassword] = useState('');
    const [showDeleteUserPassword, setShowDeleteUserPassword] = useState(false);
    const [isDeletingUser, setIsDeletingUser] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
    const [editProfileFormData, setEditProfileFormData] = useState({ id: '', name: '', email: '', role: '', avatar: null });
    const [editProfileAvatarPreview, setEditProfileAvatarPreview] = useState(null);
    const editProfileFileInputRef = useRef(null);
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const [isAvatarLibraryOpen, setIsAvatarLibraryOpen] = useState(false);
    const chartRef = useRef(null);
    const canvasRef = useRef(null);

    const filteredUsers = users.filter(user => 
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.role.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
        if (newUserFormData.password.length < 7) {
            return; // UI shows the hint
        }

        setIsAddingUser(true);
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
                setShowNewUserPassword(false); // Reset visibility
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
        } finally {
            setIsAddingUser(false);
        }
    };

    const handleChangePasswordSubmit = async (e) => {
        e.preventDefault();
        if (changePasswordFormData.newPassword.length < 7) {
            return; // UI shows the hint
        }

        if (changePasswordFormData.newPassword !== changePasswordFormData.confirmPassword) {
            showAlert({
                title: 'Password Mismatch',
                message: "New passwords do not match!",
                type: 'warning'
            });
            return;
        }
        
        setIsSubmitting(true);
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
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUserSubmit = async (e) => {
        e.preventDefault();
        if (deleteUserPassword === '') return;
        
        setIsDeletingUser(true);
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
        } finally {
            setIsDeletingUser(false);
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

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setEditProfileAvatarPreview(reader.result);
                setEditProfileFormData(prev => ({ ...prev, avatar: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleEditProfileSubmit = async (e) => {
        e.preventDefault();
        setIsUpdatingProfile(true);
        try {
            const res = await fetch(`/api/users/${editProfileFormData.id}/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(editProfileFormData)
            });
            const data = await res.json();
            if (data.success) {
                showAlert({ title: 'Profile Updated', message: data.message, type: 'success' });
                setIsEditProfileModalOpen(false);
                fetchUsers(); // Refresh list
                
                // If editing self, update stored user info
                const sessionUser = JSON.parse(sessionStorage.getItem('user') || '{}');
                if (sessionUser.id === data.user.id) {
                    sessionStorage.setItem('user', JSON.stringify(data.user));
                }
            } else {
                showAlert({ title: 'Update Failed', message: data.error || 'Failed to update profile.', type: 'error' });
            }
        } catch (err) {
            showAlert({ title: 'Network Error', message: 'An error occurred during update.', type: 'error' });
        } finally {
            setIsUpdatingProfile(false);
        }
    };

    const isAdmin = () => {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        return user.role === 'Admin';
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
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="block w-full pl-4 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] sm:text-sm transition-all"
                                />
                            </div>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 p-3 space-y-2">
                            {isLoading ? (
                                <SkeletonLoader type="list" rows={8} />
                            ) : filteredUsers.length > 0 ? (
                                filteredUsers.map((user) => (
                                    <div 
                                        key={user.id}
                                        onClick={() => setSelectedUser(user)}
                                        className={`group flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all border ${
                                            selectedUser?.id === user.id 
                                                ? 'border-slate-200 bg-slate-50 shadow-sm' 
                                                : 'border-transparent hover:bg-slate-50/50'
                                        }`}
                                    >
                                        <div className="relative">
                                            <Avatar name={user.name} src={user.avatar} size="12" />
                                            <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${user.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <h4 className="font-bold text-slate-800 text-sm truncate">{user.name}</h4>
                                            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{user.role}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No matching results</p>
                                </div>
                            )}
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
                                    <div className="relative group">
                                        <Avatar name={selectedUser.name} src={selectedUser.avatar} size="24" className="shadow-lg border-2 border-white" />
                                        <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                setEditProfileFormData({
                                                    id: selectedUser.id,
                                                    name: selectedUser.name,
                                                    email: selectedUser.email,
                                                    role: selectedUser.role,
                                                    avatar: selectedUser.avatar
                                                });
                                                setEditProfileAvatarPreview(selectedUser.avatar);
                                                setIsEditProfileModalOpen(true);
                                            }}
                                            className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center gap-2 text-sm"
                                        >
                                            <AdjustmentsHorizontalIcon className="w-4 h-4 text-slate-400" /> Edit Profile
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
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    Full Name <span className="text-rose-500 text-lg leading-none">*</span>
                                </label>
                                <input required type="text" value={newUserFormData.name} onChange={e => setNewUserFormData({...newUserFormData, name: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors" placeholder="e.g. John Doe" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    Email Address <span className="text-rose-500 text-lg leading-none">*</span>
                                </label>
                                <input required type="email" value={newUserFormData.email} onChange={e => setNewUserFormData({...newUserFormData, email: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors" placeholder="john@example.com" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    Set Password <span className="text-rose-500 text-lg leading-none">*</span>
                                </label>
                                <div className="relative">
                                    <input 
                                        required 
                                        type={showNewUserPassword ? "text" : "password"} 
                                        value={newUserFormData.password} 
                                        onChange={e => setNewUserFormData({...newUserFormData, password: e.target.value})} 
                                        className={`w-full px-4 py-2.5 border ${newUserFormData.password && newUserFormData.password.length < 7 ? 'border-rose-300 ring-4 ring-rose-50' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors pr-10`}
                                        placeholder="••••••••" 
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showNewUserPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                    </button>
                                </div>
                                {newUserFormData.password && newUserFormData.password.length < 7 && (
                                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mt-1.5 ml-1 animate-pulse">Minimum 7 characters required</p>
                                )}
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
                                <button type="button" disabled={isAddingUser} onClick={() => setIsAddUserModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm disabled:opacity-50">Cancel</button>
                                <button type="submit" disabled={isAddingUser} className="flex-1 py-3 bg-[#0f172a] text-[#d4a574] font-black rounded-xl hover:bg-slate-800 transition-colors text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                                    {isAddingUser ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-[#d4a574]" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            CREATING...
                                        </>
                                    ) : 'Create User'}
                                </button>
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
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    Old Password <span className="text-slate-300 text-[10px] uppercase font-normal">(Required)</span>
                                </label>
                                <div className="relative">
                                    <input 
                                        required 
                                        type={showOldPassword ? "text" : "password"} 
                                        value={changePasswordFormData.oldPassword} 
                                        onChange={e => setChangePasswordFormData({...changePasswordFormData, oldPassword: e.target.value})} 
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors pr-10" 
                                        placeholder="••••••••" 
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOldPassword(!showOldPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showOldPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    New Password <span className="text-rose-500 text-lg leading-none">*</span>
                                </label>
                                <div className="relative">
                                    <input 
                                        required 
                                        type={showNewPassword ? "text" : "password"} 
                                        value={changePasswordFormData.newPassword} 
                                        onChange={e => setChangePasswordFormData({...changePasswordFormData, newPassword: e.target.value})} 
                                        className={`w-full px-4 py-2.5 border ${changePasswordFormData.newPassword && changePasswordFormData.newPassword.length < 7 ? 'border-rose-300 ring-4 ring-rose-50' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors pr-10`}
                                        placeholder="••••••••" 
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showNewPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                    </button>
                                </div>
                                {changePasswordFormData.newPassword && changePasswordFormData.newPassword.length < 7 && (
                                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mt-1.5 ml-1 animate-pulse">Minimum 7 characters required</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    Confirm New Password <span className="text-rose-500 text-lg leading-none">*</span>
                                </label>
                                <div className="relative">
                                    <input 
                                        required 
                                        type={showConfirmPassword ? "text" : "password"} 
                                        value={changePasswordFormData.confirmPassword} 
                                        onChange={e => setChangePasswordFormData({...changePasswordFormData, confirmPassword: e.target.value})} 
                                        className={`w-full px-4 py-2.5 border ${changePasswordFormData.confirmPassword && changePasswordFormData.newPassword !== changePasswordFormData.confirmPassword ? 'border-rose-300 ring-4 ring-rose-50' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-[#d4a574]/30 focus:border-[#d4a574] outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors pr-10`}
                                        placeholder="••••••••" 
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showConfirmPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                    </button>
                                </div>
                                {changePasswordFormData.confirmPassword && changePasswordFormData.newPassword !== changePasswordFormData.confirmPassword && (
                                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mt-1.5 ml-1">Passwords do not match</p>
                                )}
                            </div>
                            <div className="pt-6 flex gap-3">
                                <button type="button" disabled={isSubmitting} onClick={() => setIsChangePasswordModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm disabled:opacity-50">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-[#0f172a] text-[#d4a574] font-black rounded-xl hover:bg-slate-800 transition-colors text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                                    {isSubmitting ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-[#d4a574]" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            UPDATING...
                                        </>
                                    ) : 'Save Changes'}
                                </button>
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
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    Your Password <span className="text-rose-500 text-lg leading-none">*</span>
                                </label>
                                <div className="relative">
                                    <input 
                                        required 
                                        type={showDeleteUserPassword ? "text" : "password"} 
                                        value={deleteUserPassword} 
                                        onChange={e => setDeleteUserPassword(e.target.value)} 
                                        className={`w-full px-4 py-2.5 border ${deleteUserPassword && deleteUserPassword.length < 7 ? 'border-rose-300 ring-4 ring-rose-50' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 outline-none text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white transition-colors pr-10`}
                                        placeholder="••••••••" 
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowDeleteUserPassword(!showDeleteUserPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-300 hover:text-rose-500 transition-colors"
                                    >
                                        {showDeleteUserPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                    </button>
                                </div>
                                {deleteUserPassword && deleteUserPassword.length < 7 && (
                                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mt-1.5 ml-1">Password must be at least 7 characters</p>
                                )}
                            </div>
                            <div className="pt-6 flex gap-3">
                                <button type="button" disabled={isDeletingUser} onClick={() => setIsDeleteUserModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm disabled:opacity-50">Cancel</button>
                                <button type="submit" disabled={isDeletingUser} className="flex-1 py-3 bg-rose-600 text-white font-black rounded-xl hover:bg-rose-700 transition-colors text-sm shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                                    {isDeletingUser ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            DELETING...
                                        </>
                                    ) : 'Confirm Deletion'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
            {/* Edit Profile Modal */}
            {isEditProfileModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden relative"
                    >
                        <div className="h-24 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 flex items-center justify-between border-b border-white/10">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-white/5 rounded-2xl border border-white/10 shadow-inner">
                                    <AdjustmentsHorizontalIcon className="w-7 h-7 text-[#d4a574]" /> 
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="text-xl font-black text-white leading-tight tracking-tight">
                                        Account Settings
                                    </h3>
                                    <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] mt-0.5">Personnel Management</p>
                                </div>
                            </div>
                            <button onClick={() => setIsEditProfileModalOpen(false)} className="text-slate-400 hover:text-white transition-all p-2.5 hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10 group focus:outline-none">
                                <XMarkIcon className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                            </button>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <form onSubmit={handleEditProfileSubmit} className="p-8 space-y-6">
                                {/* Avatar Section */}
                                <div className="flex flex-col items-center">
                                    <div className="relative group cursor-pointer" onClick={() => editProfileFileInputRef.current.click()}>
                                        <Avatar 
                                            name={editProfileFormData.name} 
                                            src={editProfileAvatarPreview} 
                                            size="24" 
                                            className="shadow-xl border-4 border-white transition-all group-hover:brightness-90 group-hover:scale-[1.02] rounded-[1.5rem]" 
                                        />
                                        
                                        <div className="absolute -bottom-2 -right-2 bg-white border border-slate-200 p-2.5 rounded-2xl shadow-xl flex items-center justify-center text-slate-600 transition-all group-hover:scale-110 group-hover:text-[#d4a574] z-20">
                                            <CameraIcon className="w-4 h-4 font-black" />
                                        </div>

                                        {/* Interaction Overlay */}
                                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all rounded-[1.5rem] flex items-center justify-center">
                                            <span className="text-white text-[9px] font-black uppercase tracking-widest bg-black/40 px-2.5 py-1 rounded-full backdrop-blur-md">Upload</span>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        type="button"
                                        onClick={() => setIsAvatarLibraryOpen(!isAvatarLibraryOpen)}
                                        className="mt-4 text-[10px] font-black text-[#d4a574] uppercase tracking-widest flex items-center gap-2 hover:opacity-80 transition-opacity"
                                    >
                                        <AdjustmentsHorizontalIcon className="w-4 h-4" />
                                        {isAvatarLibraryOpen ? 'Close Library' : 'Browse Library'}
                                    </button>

                                    {/* Avatar Selection Grid */}
                                    {isAvatarLibraryOpen && (
                                        <div className="mt-6 w-full bg-slate-50 border border-slate-200/60 rounded-3xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Curated Characters</p>
                                            <div className="grid grid-cols-5 gap-3">
                                                {AVATAR_LIBRARY.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditProfileAvatarPreview(`LIBRARY_PICK:${item.seed}`);
                                                            setEditProfileFormData({...editProfileFormData, avatar: `LIBRARY_PICK:${item.seed}`});
                                                        }}
                                                        className={`relative p-1 rounded-xl transition-all hover:scale-110 ${
                                                            editProfileAvatarPreview === `LIBRARY_PICK:${item.seed}`
                                                                ? 'ring-2 ring-[#d4a574] ring-offset-2 bg-white'
                                                                : 'grayscale hover:grayscale-0 opacity-60 hover:opacity-100'
                                                        }`}
                                                    >
                                                        <Avatar name={item.seed} src={`LIBRARY_PICK:${item.seed}`} size="8" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <input 
                                        type="file" 
                                        ref={editProfileFileInputRef} 
                                        onChange={handleAvatarChange} 
                                        className="hidden" 
                                        accept="image/*" 
                                    />
                                </div>

                            <div className="grid grid-cols-1 gap-5">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Full Name <span className="text-rose-500">*</span></label>
                                    <input 
                                        required 
                                        type="text" 
                                        value={editProfileFormData.name} 
                                        onChange={e => setEditProfileFormData({...editProfileFormData, name: e.target.value})} 
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#d4a574]/10 focus:border-[#d4a574] outline-none text-sm font-bold text-slate-700 transition-all" 
                                        placeholder="e.g. John Doe" 
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email address {isAdmin() && <span className="text-rose-500">*</span>}</label>
                                    <div className="relative">
                                        <AtSymbolIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <input 
                                            required={isAdmin()}
                                            disabled={!isAdmin()}
                                            type="email" 
                                            value={editProfileFormData.email} 
                                            onChange={e => setEditProfileFormData({...editProfileFormData, email: e.target.value})} 
                                            className="w-full pl-12 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#d4a574]/10 focus:border-[#d4a574] outline-none text-sm font-bold text-slate-700 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed" 
                                            placeholder="john@example.com" 
                                        />
                                    </div>
                                    {!isAdmin() && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-2 ml-1 italic">Only administrators can modify email addresses</p>}
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">System Authority Level {isAdmin() && <span className="text-rose-500">*</span>}</label>
                                    <div className="relative">
                                        <ShieldCheckIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <select 
                                            disabled={!isAdmin()}
                                            value={editProfileFormData.role} 
                                            onChange={e => setEditProfileFormData({...editProfileFormData, role: e.target.value})} 
                                            className="w-full pl-12 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#d4a574]/10 focus:border-[#d4a574] outline-none text-sm font-bold text-slate-700 appearance-none cursor-pointer transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                        >
                                            <option value="User">Standard User</option>
                                            <option value="Staff">Staff Officer</option>
                                            <option value="Admin">System Administrator</option>
                                        </select>
                                    </div>
                                    {!isAdmin() && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-2 ml-1 italic">Role changes require administrative override</p>}
                                </div>
                            </div>

                                <div className="flex gap-4 pt-4">
                                    <button 
                                        type="button" 
                                        disabled={isUpdatingProfile}
                                        onClick={() => setIsEditProfileModalOpen(false)} 
                                        className="px-6 py-3 bg-white border border-slate-200 text-slate-400 font-black rounded-xl hover:bg-slate-50 hover:text-slate-600 transition-all text-[10px] uppercase tracking-widest disabled:opacity-50"
                                    >
                                        Discard
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={isUpdatingProfile}
                                        className="flex-1 py-3 bg-[#0f172a] text-[#d4a574] font-black rounded-xl hover:bg-slate-800 transition-all text-[10px] uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isUpdatingProfile ? (
                                            <>
                                                <svg className="animate-spin h-3.5 w-3.5 text-[#d4a574]" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                SYNCING...
                                            </>
                                        ) : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
};

export default Accounts;    