import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './bootstrap';
import '../css/app.css';

// Components
import Landing          from './components/Landing.jsx';
import Login            from './components/Login.jsx';
import Dashboard        from './components/Dashboard.jsx';
import Documents        from './components/Documents.jsx';
import Issuances        from './components/Issuances.jsx';
import Mapping          from './components/Mapping.jsx';
import Accounts         from './components/Accounts.jsx';
import Announcements    from './components/Announcements.jsx';
import Layout           from './components/Layout.jsx';
import PublicLayout     from './components/PublicLayout.jsx';
import AboutPortal      from './components/AboutPortal.jsx';
import DigitalServices  from './components/DigitalServices.jsx';
import ContactDirectory from './components/ContactDirectory.jsx';
import { ModalProvider } from './components/ModalContext.jsx';
import { DataProvider } from './components/DataContext.jsx';

// ─── Auth helpers ────────────────────────────────────────────────────────────

const getUser = () => {
    try {
        return JSON.parse(sessionStorage.getItem('user') || 'null');
    } catch {
        return null;
    }
};

const isAuthenticated = () => !!getUser();

// ─── Protected Route ─────────────────────────────────────────────────────────
//
// allowedRoles: if empty → any authenticated user may access
//               if set   → user.role must be in the list
//
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles.length > 0) {
        const user = getUser();
        if (!allowedRoles.includes(user?.role)) {
            // Redirect to the highest page they ARE allowed to access
            return <Navigate to="/documents" replace />;
        }
    }

    return children;
};

// ─── Scroll to top on route change ───────────────────────────────────────────
const ScrollToTop = () => {
    const { pathname } = useLocation();
    React.useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
    return null;
};

// ─── App ─────────────────────────────────────────────────────────────────────
function App() {
    return (
        <DataProvider>
            <ModalProvider>
                <BrowserRouter>
                    <ScrollToTop />
                    <Routes>
                        {/* ── Public ─────────────────────────────────────────── */}
                        <Route path="/"         element={<PublicLayout><Landing /></PublicLayout>} />
                        <Route path="/about"    element={<PublicLayout><AboutPortal /></PublicLayout>} />
                        <Route path="/services" element={<PublicLayout><DigitalServices /></PublicLayout>} />
                        <Route path="/contact"  element={<PublicLayout><ContactDirectory /></PublicLayout>} />
                        <Route path="/login"    element={<Login />} />

                        {/* ── Protected ──────────────────────────────────────── */}
                        {/* Dashboard — Admin + SuperAdmin */}
                        <Route path="/dashboard" element={
                            <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']}>
                                <Layout><Dashboard /></Layout>
                            </ProtectedRoute>
                        } />

                        {/* Documents — all authenticated */}
                        <Route path="/documents" element={
                            <ProtectedRoute>
                                <Layout><Documents /></Layout>
                            </ProtectedRoute>
                        } />

                        {/* Issuances — Admin + SuperAdmin */}
                        <Route path="/issuances" element={
                            <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']}>
                                <Layout><Issuances /></Layout>
                            </ProtectedRoute>
                        } />

                        {/* Mapping — SuperAdmin only */}
                        <Route path="/mapping" element={
                            <ProtectedRoute allowedRoles={['SuperAdmin']}>
                                <Layout><Mapping /></Layout>
                            </ProtectedRoute>
                        } />

                        {/* Announcements — Admin + SuperAdmin */}
                        <Route path="/announcements" element={
                            <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']}>
                                <Layout><Announcements /></Layout>
                            </ProtectedRoute>
                        } />

                        {/* Accounts — all authenticated (filtered inside component by role) */}
                        <Route path="/accounts" element={
                            <ProtectedRoute>
                                <Layout><Accounts /></Layout>
                            </ProtectedRoute>
                        } />

                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </ModalProvider>
        </DataProvider>
    );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);