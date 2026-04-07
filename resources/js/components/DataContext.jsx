import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const DataContext = createContext();

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};

export const DataProvider = ({ children }) => {
    // ── State for Stats ──────────────────────────────────────────────────────
    const [stats, setStats] = useState(() => {
        const cached = sessionStorage.getItem('civicore_stats');
        return cached ? JSON.parse(cached) : {
            totalDocs: 0,
            processedDocs: 0,
            pendingDocs: 0,
            totalUsers: 0,
            totalIssuances: 0,
            pendingIssuances: 0
        };
    });

    // ── State for Documents ──────────────────────────────────────────────────
    const [documents, setDocuments] = useState(() => {
        const cached = sessionStorage.getItem('civicore_documents');
        return cached ? JSON.parse(cached) : [];
    });

    // ── State for Issuances ──────────────────────────────────────────────────
    const [issuances, setIssuances] = useState(() => {
        const cached = sessionStorage.getItem('civicore_issuances');
        return cached ? JSON.parse(cached) : [];
    });

    const [loading, setLoading] = useState({
        stats: !sessionStorage.getItem('civicore_stats'),
        documents: !sessionStorage.getItem('civicore_documents'),
        issuances: !sessionStorage.getItem('civicore_issuances')
    });

    const lastFetch = useRef({
        stats: 0,
        documents: 0,
        issuances: 0
    });

    // ── Fetching Logic ────────────────────────────────────────────────────────
    
    const refreshStats = useCallback(async (force = false) => {
        const now = Date.now();
        if (!force && now - lastFetch.current.stats < 5000) return; // Debounce fetches
        
        try {
            const response = await fetch('/api/dashboard/stats', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch stats');
            const data = await response.json();
            
            if (data.stats) {
                setStats(data.stats);
                sessionStorage.setItem('civicore_stats', JSON.stringify(data.stats));
            }
            if (data.chartData) {
                sessionStorage.setItem('civicore_chart_data', JSON.stringify(data.chartData));
            }
            lastFetch.current.stats = now;
        } catch (err) {
            console.error('Error refreshing stats:', err);
        } finally {
            setLoading(prev => ({ ...prev, stats: false }));
        }
    }, []);

    const refreshDocuments = useCallback(async (force = false) => {
        const now = Date.now();
        if (!force && now - lastFetch.current.documents < 5000) return;

        try {
            const response = await fetch('/api/documents', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch documents');
            const data = await response.json();
            
            if (data.data) {
                const mapped = data.data.map(doc => ({
                    id:              doc.id,
                    name:            doc.name,
                    type:            doc.type || 'Uncategorized',
                    size:            doc.size,
                    status:          doc.status ? doc.status.toLowerCase() : 'pending',
                    date:            doc.date || '',
                    detected_type:   doc.detected_type || '',
                    extracted_fields: doc.extracted_fields ? JSON.parse(doc.extracted_fields) : null,
                    encoded_by:      doc.encoded_by,
                    created_at:      doc.created_at
                }));
                setDocuments(mapped);
                sessionStorage.setItem('civicore_documents', JSON.stringify(mapped));
            }
            lastFetch.current.documents = now;
        } catch (err) {
            console.error('Error refreshing documents:', err);
        } finally {
            setLoading(prev => ({ ...prev, documents: false }));
        }
    }, []);

    const refreshIssuances = useCallback(async (force = false) => {
        const now = Date.now();
        if (!force && now - lastFetch.current.issuances < 5000) return;

        try {
            const response = await fetch('/api/issuances', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch issuances');
            const data = await response.json();
            
            if (data.data) {
                const mapped = data.data.map(i => ({
                    id:              i.id,
                    number:          i.certNumber,
                    type:            i.type,
                    name:            i.name,
                    barangay:        i.barangay,
                    date:            i.issuanceDate,
                    status:          i.status || 'Pending',
                    encoded_by:      i.encoded_by,
                    created_at:      i.created_at
                }));
                setIssuances(mapped);
                sessionStorage.setItem('civicore_issuances', JSON.stringify(mapped));
            }
            lastFetch.current.issuances = now;
        } catch (err) {
            console.error('Error refreshing issuances:', err);
        } finally {
            setLoading(prev => ({ ...prev, issuances: false }));
        }
    }, []);

    // ── Global Polling ────────────────────────────────────────────────────────
    useEffect(() => {
        // Refresh everything on mount
        refreshStats(true);
        refreshDocuments(true);
        refreshIssuances(true);

        // Set up polling (every 15 seconds)
        const interval = setInterval(() => {
            refreshStats();
            refreshDocuments();
            refreshIssuances();
        }, 15000);

        return () => clearInterval(interval);
    }, [refreshStats, refreshDocuments, refreshIssuances]);

    const value = {
        stats,
        documents,
        issuances,
        loading,
        refreshStats,
        refreshDocuments,
        refreshIssuances,
        // Helper to refresh everything at once (e.g. after a mutation)
        refreshAll: () => {
            refreshStats(true);
            refreshDocuments(true);
            refreshIssuances(true);
        }
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};
