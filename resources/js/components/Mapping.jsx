import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MapPinIcon,
    DocumentChartBarIcon,
    ArrowPathIcon,
    ArrowDownTrayIcon,
    TableCellsIcon,
    EyeIcon,
    MagnifyingGlassIcon,
    ArrowsPointingOutIcon,
    FireIcon
} from '@heroicons/react/24/outline';
import SkeletonLoader from './SkeletonLoader.jsx';
import Avatar from 'boring-avatars';

import { useData } from './DataContext.jsx';

const Mapping = () => {
    const mapRef = useRef(null);
    const chartRef = useRef(null);
    const canvasRef = useRef(null);
    const {
        issuances: apiData,
        documents: docsData,
        loading: dataLoading,
        refreshAll
    } = useData();


    const isLoading = dataLoading.issuances || dataLoading.documents;
    const [activeFilter, setActiveFilter] = useState('all');
    const [hoveredBrgy, setHoveredBrgy] = useState(null);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [stats, setStats] = useState({ birthCount: 0, deathCount: 0, marriageCount: 0, mostActiveBrgy: 'N/A', totalRecords: 0, totalDocs: 0 });

    // Maintain references to markers for interactivity
    const markersRef = useRef({});

    // Fetch API Data
    // Global fetch is handled by DataProvider
    const fetchData = () => refreshAll();

    useEffect(() => {
        // cleanup on unmount
        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Initialize Map and Chart after loading
    useEffect(() => {
        if (isLoading) return;

        // --- LEAFLET MAP ---
        if (!mapRef.current) {
            // Define Naic Municipality limits (Approximate bounding box)
            const naicBounds = L.latLngBounds(
                [14.26, 120.73], // Southwest boundary
                [14.36, 120.85]  // Northeast boundary
            );

            const map = L.map('mapContainer', {
                zoomControl: false, // Customizing controls
                maxBounds: naicBounds, // Restrict panning out of bounds
                maxBoundsViscosity: 1.0, // Solid bounce-back effect
                minZoom: 12, // Restrict zooming out too far
                maxZoom: 15 // Restrict zooming in too close
            }).setView([14.3150, 120.7700], 13);

            L.control.zoom({ position: 'bottomright' }).addTo(map);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
            }).addTo(map);

            const staticBarangays = [
                { coords: [14.320, 120.7652], name: 'Gomez-Zamora (Pob.)' },
                { coords: [14.3179, 120.76559], name: 'Capt. C. Nazareno (Pob.)' },
                { coords: [14.3225, 120.7673], name: 'Ibayo Silangan' },
                { coords: [14.32358, 120.76485], name: 'Ibayo Estacion' },
                { coords: [14.31728, 120.76345], name: 'Kanluran' },
                { coords: [14.31462, 120.7706], name: 'Makina' },
                { coords: [14.32049, 120.75696], name: 'Sapa' },
                { coords: [14.3251, 120.75574], name: 'Bucana Malaki' },
                { coords: [14.3232, 120.7598], name: 'Bucana Sasahan' },
                { coords: [14.3211, 120.7535], name: 'Bagong Karsada' },
                { coords: [14.3198, 120.7627], name: 'Balsahan' },
                { coords: [14.3175, 120.7512], name: 'Bancaan' },
                { coords: [14.29245, 120.75202], name: 'Muzon' },
                { coords: [14.3217999, 120.761], name: 'Latoria' },
                { coords: [14.3126, 120.7373], name: 'Labac' },
                { coords: [14.3148, 120.7476], name: 'Mabolo' },
                { coords: [14.31058, 120.7709], name: 'San Roque' },
                { coords: [14.3145, 120.7685], name: 'Santulan' },
                { coords: [14.2795, 120.78071], name: 'Molino' },
                { coords: [14.2976, 120.7909], name: 'Calubcob' },
                { coords: [14.2939, 120.8007], name: 'Halang' },
                { coords: [14.3078, 120.7683], name: 'Malainen Bago' },
                { coords: [14.3000, 120.7700], name: 'Malainen Luma' },
                { coords: [14.2850, 120.8097], name: 'Palangue 1' },
                { coords: [14.2620, 120.8297], name: 'Palangue 2 & 3' },
                { coords: [14.3166, 120.7689], name: 'Humbac' },
                { coords: [14.3348, 120.7717], name: 'Munting Mapino' },
                { coords: [14.3146, 120.7930], name: 'Sabang' },
                { coords: [14.3438, 120.7808], name: 'Timalan Balsahan' },
                { coords: [14.33699, 120.7790], name: 'Timalan Concepcion' }
            ];

            const brgyCounts = {};
            let birthCount = 0;
            let deathCount = 0;
            let marriageCount = 0;
            let mostActiveBrgy = 'N/A';
            let maxTotal = 0;

            const last6Months = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                last6Months.push(d.toLocaleString('default', { month: 'short' }));
            }

            const monthData = {
                births: [0, 0, 0, 0, 0, 0],
                deaths: [0, 0, 0, 0, 0, 0],
                marriages: [0, 0, 0, 0, 0, 0]
            };

            apiData.forEach(issuance => {
                const brgy = issuance.barangay;
                const type = (issuance.type || '').toLowerCase();
                const dateStr = issuance.issuanceDate || issuance.created_at;
                const date = new Date(dateStr);
                const month = date.toLocaleString('default', { month: 'short' });
                const monthIdx = last6Months.indexOf(month);

                if (type.includes('birth')) {
                    birthCount++;
                    if (monthIdx !== -1) monthData.births[monthIdx]++;
                } else if (type.includes('death')) {
                    deathCount++;
                    if (monthIdx !== -1) monthData.deaths[monthIdx]++;
                } else if (type.includes('marriage')) {
                    marriageCount++;
                    if (monthIdx !== -1) monthData.marriages[monthIdx]++;
                }
            });

            // Count everything: Finalized Issuances + Unlinked Documents
            const combinedForStats = [
                ...apiData.map(i => ({ brgy: i.barangay, type: i.type || 'birth' })),
                ...docsData.filter(d => !apiData.some(i => Number(i.document_id) === Number(d.id))).map(d => ({ brgy: d.barangay, type: d.type || 'birth' }))
            ];

            combinedForStats.forEach(item => {
                const brgy = item.brgy;
                const type = (item.type || 'birth').toLowerCase();
                
                if (brgy) {
                    if (!brgyCounts[brgy]) brgyCounts[brgy] = { births: 0, deaths: 0, marriages: 0, total: 0 };
                    if (type.includes('birth')) brgyCounts[brgy].births++;
                    else if (type.includes('death')) brgyCounts[brgy].deaths++;
                    else if (type.includes('marriage')) brgyCounts[brgy].marriages++;
                    brgyCounts[brgy].total++;

                    if (brgyCounts[brgy].total > maxTotal) {
                        maxTotal = brgyCounts[brgy].total;
                        mostActiveBrgy = brgy;
                    }
                }
            });

            // Match TOTAL UPLOADED to the sum of all unique records
            const issuedDocIds = new Set(apiData.map(i => i.document_id ? Number(i.document_id) : null).filter(id => id !== null));
            const unlinkedDocs = docsData.filter(d => !issuedDocIds.has(Number(d.id)));
            const totalDocs = apiData.length + unlinkedDocs.length;

            const barangaysForMap = staticBarangays.map(b => ({
                ...b,
                births: brgyCounts[b.name]?.births || 0,
                deaths: brgyCounts[b.name]?.deaths || 0,
                marriages: brgyCounts[b.name]?.marriages || 0
            }));

            // Store markers in ref for interactivity
            markersRef.current = {};

            barangaysForMap.forEach(barangay => {
                const total = barangay.births + barangay.deaths + barangay.marriages;

                if (showHeatmap) {
                    // Heatmap mode: Large soft circles
                    if (total > 0) {
                        const intensity = Math.min(total / 10, 1); // Scale intensity
                        const circle = L.circle(barangay.coords, {
                            color: '#f43f5e',
                            fillColor: '#f43f5e',
                            fillOpacity: 0.1 + (intensity * 0.4),
                            radius: 300 + (intensity * 500),
                            stroke: false,
                            interactive: false
                        }).addTo(map);
                        markersRef.current[barangay.name] = circle;
                    }
                } else {
                    // Pin mode
                    let pinColor = '#0f172a'; // Default dark
                    if (total > 0) {
                        if (barangay.births >= barangay.deaths && barangay.births >= barangay.marriages) pinColor = '#d4a574';
                        else if (barangay.deaths >= barangay.births && barangay.deaths >= barangay.marriages) pinColor = '#f43f5e';
                        else pinColor = '#6366f1';
                    }

                    const isHovered = hoveredBrgy === barangay.name;

                    const pinIcon = L.divIcon({
                        className: 'bg-transparent border-none',
                        html: `<div class="relative ${isHovered ? 'scale-125 z-[1000]' : ''} transition-all duration-300">
                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${pinColor}" stroke="${total > 0 ? '#ffffff' : '#d4a574'}" stroke-width="1.5" class="w-8 h-8 drop-shadow-md hover:scale-110 transition-transform origin-bottom cursor-pointer opacity-${total > 0 ? '100' : '40'}">
                                   <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                   <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                 </svg>
                                 ${isHovered ? '<div class="absolute inset-0 bg-white/40 rounded-full animate-ping pointer-events-none"></div>' : ''}
                               </div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 32],
                        popupAnchor: [0, -32]
                    });

                    const marker = L.marker(barangay.coords, { icon: pinIcon }).addTo(map);
                    marker.bindTooltip(`
                        <div style="text-align: center; line-height: 1.2;">
                            <span class="font-bold text-slate-800 text-xs block">${barangay.name}</span>
                            <span class="text-[10px] text-slate-500 font-medium">Total Issued: ${total}</span>
                        </div>
                    `, { direction: 'top', offset: [0, -32], opacity: 0.95 });

                    marker.bindPopup(`
                        <div class="p-3 min-w-[160px]">
                            <h4 class="font-bold text-[#0f172a] text-sm mb-2 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-1.5">
                                ${barangay.name}
                            </h4>
                            <div class="space-y-1.5 text-xs mt-3">
                                <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Births:</span> <span class="font-bold text-[#d4a574] bg-[#d4a574]/10 px-1.5 rounded">${barangay.births}</span></div>
                                <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Deaths:</span> <span class="font-bold text-rose-500 bg-rose-50 px-1.5 rounded">${barangay.deaths}</span></div>
                                <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Marriages:</span> <span class="font-bold text-indigo-500 bg-indigo-50 px-1.5 rounded">${barangay.marriages}</span></div>
                            </div>
                        </div>
                    `, { closeButton: false });

                    markersRef.current[barangay.name] = marker;
                }
            });

            // Update Global Stats in UI (using state)
            const totalRecords = birthCount + deathCount + marriageCount;
            setStats({ birthCount, deathCount, marriageCount, mostActiveBrgy, totalRecords, totalDocs });

            mapRef.current = map;

            // --- CHART.JS ---
            if (canvasRef.current && window.Chart) {
                if (chartRef.current) chartRef.current.destroy();
                const ctx = canvasRef.current.getContext('2d');
                chartRef.current = new window.Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: last6Months,
                        datasets: [
                            { label: 'Births', data: monthData.births, backgroundColor: '#d4a574', borderRadius: 4 },
                            { label: 'Deaths', data: monthData.deaths, backgroundColor: '#f43f5e', borderRadius: 4 },
                            { label: 'Marriages', data: monthData.marriages, backgroundColor: '#6366f1', borderRadius: 4 }
                        ]
                    },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }
        }
    }, [isLoading, apiData, docsData, showHeatmap, hoveredBrgy]);

    const exportToCSV = () => {
        const headers = ["Certificate No.", "Type", "Subject Name", "Barangay", "Print Date", "Status", "Encoded By"];
        const rows = filteredPrints.map(p => [
            p.number,
            p.type,
            p.name,
            p.barangay,
            p.date,
            p.status,
            p.encoded_by || 'System'
        ]);

        let csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `civicore_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const locateBarangay = (brgyName) => {
        const marker = markersRef.current[brgyName];
        if (marker && mapRef.current) {
            mapRef.current.setView(marker.getLatLng(), 15, { animate: true });
            marker.openPopup();

            // Temporary pulse effect class could be added here if CSS is defined
            setHoveredBrgy(brgyName);
            setTimeout(() => setHoveredBrgy(null), 3000);
        }
    };

    const resetMapView = () => {
        if (mapRef.current) {
            mapRef.current.setView([14.3150, 120.7700], 13, { animate: true });
        }
    };


    const filteredPrints = apiData.filter(print =>
        activeFilter === 'all' || (print.type || '').toLowerCase().includes(activeFilter)
    );



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
                        <MapPinIcon className="w-8 h-8 text-[#d4a574]" />
                        Geospatial Analytics
                    </h2>
                    <p className="text-slate-500 font-medium text-sm mt-1">Live distribution of civil documents across Naic barangays.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={exportToCSV}
                        disabled={isLoading || filteredPrints.length === 0}
                        className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all cursor-pointer active:scale-95 group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4 text-emerald-500" />
                        Export CSV
                    </button>
                    <button
                        onClick={() => fetchData()}
                        className="flex items-center gap-2 bg-[#0f172a] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all cursor-pointer active:scale-95 group"
                    >
                        <ArrowPathIcon className={`w-4 h-4 group-hover:rotate-180 transition-transform duration-500 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </motion.div>

            {/* Top Stat Cards Grid */}
            <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {isLoading ? (
                    <div className="col-span-4">
                        <SkeletonLoader type="cards" rows={1} />
                    </div>
                ) : (
                    <>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Uploaded Docs</p>
                            <h3 className="text-3xl font-black text-emerald-500">{stats.totalDocs}</h3>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Birth Certs</p>
                            <h3 className="text-3xl font-black text-[#d4a574]">{stats.birthCount}</h3>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Death Certs</p>
                            <h3 className="text-3xl font-black text-rose-500">{stats.deathCount}</h3>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Marriage Certs</p>
                            <h3 className="text-3xl font-black text-indigo-500">{stats.marriageCount}</h3>
                        </div>
                        <div className="bg-gradient-to-br from-[#0f172a] to-slate-800 p-5 rounded-2xl shadow-lg shadow-slate-800/20 flex flex-col justify-center relative overflow-hidden">
                            <div className="absolute right-[-10%] top-[-10%] w-24 h-24 bg-[#d4a574]/10 rounded-full blur-xl"></div>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Most Active</p>
                            <h3 className="text-xl font-black text-white truncate">{stats.mostActiveBrgy}</h3>
                        </div>
                    </>
                )}
            </motion.div>

            {/* Map and Charts Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Map Section - 2 columns */}
                <motion.div variants={itemVariants} className="lg:col-span-2 relative bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 p-1 flex flex-col overflow-hidden h-[450px]">
                    {/* Floating Map Controls */}
                    <div className="absolute top-4 right-4 z-[1001] flex flex-col gap-2">
                        <button
                            onClick={() => setShowHeatmap(!showHeatmap)}
                            className={`p-2.5 rounded-xl shadow-lg border transition-all cursor-pointer ${showHeatmap ? 'bg-rose-500 text-white border-rose-400' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                            title={showHeatmap ? "Switch to Pin View" : "Switch to Heatmap View"}
                        >
                            <FireIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={resetMapView}
                            className="bg-white p-2.5 rounded-xl text-slate-600 shadow-lg border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer"
                            title="Reset Map View"
                        >
                            <ArrowsPointingOutIcon className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Legend Overlay */}
                    <div className="absolute bottom-4 left-4 z-[1001] bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg border border-white/60 min-w-[120px]">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Legend</p>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#d4a574]"></span>
                                <span className="text-[10px] font-bold text-slate-700">Births</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                                <span className="text-[10px] font-bold text-slate-700">Deaths</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                                <span className="text-[10px] font-bold text-slate-700">Marriages</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#0f172a]"></span>
                                <span className="text-[10px] font-bold text-slate-700">No Records</span>
                            </div>
                        </div>
                    </div>

                    <div id="mapContainer" className="w-full h-full rounded-xl bg-slate-100 z-0"></div>
                </motion.div>

                {/* Chart Segment - 1 column */}
                <motion.div variants={itemVariants} className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 p-6 flex flex-col h-[450px]">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <DocumentChartBarIcon className="w-5 h-5 text-[#d4a574]" />
                            Monthly Trajectory
                        </h3>
                        <p className="text-xs text-slate-500">6-month document processing trends</p>
                    </div>
                    <div className="flex-1 relative w-full">
                        {isLoading ? (
                            <div className="w-full h-full flex items-center justify-center">
                                <SkeletonLoader type="default" />
                            </div>
                        ) : (
                            <canvas ref={canvasRef}></canvas>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Print Records Table */}
            <motion.div variants={itemVariants} className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 bg-slate-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Recent Document Prints</h3>
                        <p className="text-xs text-slate-500 mt-1">Track physical issuance logs</p>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                        {['all', 'birth', 'death', 'marriage'].map(type => (
                            <button
                                key={type}
                                onClick={() => setActiveFilter(type)}
                                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeFilter === type
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold border-b border-slate-200">
                                <th className="p-4 pl-6">Certificate No.</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Subject Name</th>
                                <th className="p-4">Barangay</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Encoded By</th>
                                <th className="p-4 text-right pr-6">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" className="p-0">
                                        <SkeletonLoader type="table" rows={4} />
                                    </td>
                                </tr>
                            ) : filteredPrints.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="p-8 text-center text-slate-500">
                                        No tracking logs found.
                                    </td>
                                </tr>
                            ) : (
                                filteredPrints.map((print, index) => (
                                    <tr
                                        key={index}
                                        onMouseEnter={() => setHoveredBrgy(print.barangay)}
                                        onMouseLeave={() => setHoveredBrgy(null)}
                                        className={`hover:bg-slate-50 transition-colors text-xs group/row ${hoveredBrgy === print.barangay ? 'bg-slate-50' : ''}`}
                                    >
                                        <td className="p-4 pl-6">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800">{print.number}</span>
                                                <span className="text-[10px] text-slate-400 font-medium">{print.date}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${print.type?.toLowerCase().includes('birth') ? 'bg-[#d4a574]/10 text-[#d4a574] border-[#d4a574]/20' :
                                                    print.type?.toLowerCase().includes('death') ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                        'bg-indigo-50 text-indigo-600 border-indigo-100'
                                                }`}>
                                                {print.type}
                                            </span>
                                        </td>
                                        <td className="p-4 font-semibold text-slate-700">{print.name}</td>
                                        <td className="p-4 text-slate-600 font-medium">{print.barangay}</td>
                                        <td className="p-4">
                                            {print.status === 'Printed' || print.status === 'Active' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-100">
                                                    <span className="w-1.2 h-1.2 rounded-full bg-emerald-500"></span> Issued
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-100">
                                                    <span className="w-1.2 h-1.2 rounded-full bg-amber-500 animate-pulse"></span> Processing
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <Avatar
                                                    size={20}
                                                    name={print.encoded_by || 'System'}
                                                    variant="beam"
                                                    colors={['#0f172a', '#d4a574', '#6366f1', '#f43f5e', '#10b981']}
                                                />
                                                <span className="font-medium text-slate-500">{print.encoded_by || 'System'}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right pr-6">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => locateBarangay(print.barangay)}
                                                    className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-slate-400 hover:text-[#d4a574] transition-all cursor-pointer"
                                                    title="Locate on Map"
                                                >
                                                    <MagnifyingGlassIcon className="w-4 h-4" />
                                                </button>
                                                <a
                                                    href={`/api/documents/view/${print.document_id || print.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-slate-400 hover:text-indigo-500 transition-all cursor-pointer"
                                                    title="View Full Document"
                                                >
                                                    <EyeIcon className="w-4 h-4" />
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default Mapping;

