<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Get dashboard stats and chart data
     */
    public function stats()
    {
        // 1. Basic Stats - Count finalized documents only for the main total
        $documentsCountResult = DB::select("SELECT COUNT(*) as count FROM documents WHERE (status = 'processed' OR status = 'Processed') AND deleted_at IS NULL");
        $documentsCount = $documentsCountResult[0]->count ?? 0;

        $processedDocsResult = DB::select("SELECT COUNT(*) as count FROM documents WHERE (status = 'processed' OR status = 'Processed') AND deleted_at IS NULL");
        $processedDocs = $processedDocsResult[0]->count ?? 0;

        // Pending OCR or just uploaded docs
        $pendingDocsResult = DB::select("SELECT COUNT(*) as count FROM documents WHERE (status = 'pending' OR status = 'Uploaded') AND deleted_at IS NULL");
        $pendingDocs = $pendingDocsResult[0]->count ?? 0;

        $usersCountResult = DB::select("SELECT COUNT(*) as count FROM users");
        $usersCount = $usersCountResult[0]->count ?? 0;

        $issuancesCountResult = DB::select("SELECT COUNT(*) as count FROM issuances WHERE deleted_at IS NULL");
        $totalIssuances = $issuancesCountResult[0]->count ?? 0;

        $pendingIssuancesResult = DB::select("SELECT COUNT(*) as count FROM issuances WHERE (status = 'Pending' OR status = 'pending') AND deleted_at IS NULL");
        $pendingIssuances = $pendingIssuancesResult[0]->count ?? 0;

        // 2. Document Types Distribution (Only Processed docs)
        $docTypes = DB::select("SELECT type, COUNT(*) as count FROM documents WHERE (status = 'processed' OR status = 'Processed') AND deleted_at IS NULL GROUP BY type");
        $chartData = [
            'labels' => [],
            'data' => []
        ];
        foreach ($docTypes as $docType) {
            $typeClean = ucwords(str_replace('_', ' ', $docType->type));
            $chartData['labels'][] = $typeClean;
            $chartData['data'][] = (int) $docType->count;
        }

        if (empty($chartData['labels'])) {
            $chartData = [
                'labels' => ['Birth', 'Death', 'Marriage'],
                'data' => [0, 0, 0]
            ];
        }

        // 3. Process Status (Pipeline overview)
        $failedDocsResult = DB::select("SELECT COUNT(*) as count FROM documents WHERE (status = 'failed' OR status = 'Failed') AND deleted_at IS NULL");
        $failedDocs = $failedDocsResult[0]->count ?? 0;

        $processStatus = [
            'labels' => ['Processed', 'Pending OCR', 'Failed'],
            'data' => [
                (int) $processedDocs,
                (int) $pendingDocs,
                (int) $failedDocs
            ]
        ];

        // 4. Monthly Processing Trend (Last 6 Months - Approved Only)
        $monthlyUploads = [];
        $months = [];
        for ($i = 5; $i >= 0; $i--) {
            $month = now()->subMonths($i);
            $monthName = $month->format('M');
            $months[] = $monthName;
            
            $start = $month->copy()->startOfMonth();
            $end = $month->copy()->endOfMonth();
            
            $count = DB::table('documents')
                ->where('status', 'Processed')
                ->whereNull('deleted_at')
                ->whereBetween('created_at', [$start, $end])
                ->count();
            
            $monthlyUploads[] = $count;
        }

        $trendChart = [
            'labels' => $months,
            'data' => $monthlyUploads
        ];

        // 5. Geographic Distribution (Replacing simulated Accuracy with real Barangay data)
        $brgyData = DB::select("SELECT barangay, COUNT(*) as count FROM issuances WHERE deleted_at IS NULL GROUP BY barangay ORDER BY count DESC LIMIT 5");
        
        $ocrAccuracy = [
            'labels' => !empty($brgyData) ? array_column($brgyData, 'barangay') : ['Poblacion', 'Sabang', 'Halang', 'Muzon', 'Labac'],
            'data' => !empty($brgyData) ? array_map('intval', array_column($brgyData, 'count')) : [0, 0, 0, 0, 0]
        ];

        return response()->json([
            'stats' => [
                'totalDocs' => (int) $documentsCount,
                'processedDocs' => (int) $processedDocs,
                'pendingDocs' => (int) $pendingDocs,
                'totalUsers' => (int) $usersCount,
                'totalIssuances' => (int) $totalIssuances,
                'pendingIssuances' => (int) $pendingIssuances
            ],
            'chartData' => [
                'docTypes' => $chartData,
                'processStatus' => $processStatus,
                'trendChart' => $trendChart,
                'accuracyChart' => $ocrAccuracy
            ]
        ]);
    }
}
