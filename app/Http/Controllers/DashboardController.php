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
        $activeDocuments = DB::table('documents')->whereNull('deleted_at');
        $activeIssuances = DB::table('issuances')->whereNull('deleted_at');

        // Master count of finalized/approved documents only
        $totalDocuments = (clone $activeDocuments)
            ->whereIn(DB::raw('LOWER(status)'), ['processed', 'issued', 'active'])
            ->count();

        $totalIssuances = (clone $activeIssuances)
            ->where(DB::raw('LOWER(status)'), 'issued')
            ->count();

        // Queue documents count (pending user review/processing)
        $uploadPending = (clone $activeDocuments)
            ->whereIn(DB::raw('LOWER(status)'), ['pending', 'processing', 'uploaded', 'extracted'])
            ->count();

        // Approved documents count
        $processedDocs = (clone $activeDocuments)
            ->whereIn(DB::raw('LOWER(status)'), ['processed', 'issued', 'active'])
            ->count();

        $usersCount = DB::table('users')->count();

        // Count type groupings only for finalized/approved documents
        $docTypes = DB::select("
            SELECT type_group, COUNT(*) as count FROM (
                SELECT LOWER(COALESCE(detected_type, type, 'birth')) as type_group
                FROM documents 
                WHERE deleted_at IS NULL
                  AND LOWER(status) IN ('processed', 'issued', 'active')
            ) t
            GROUP BY type_group
        ");

        $chartData = ['labels' => [], 'data' => []];
        foreach ($docTypes as $docType) {
            $val = $docType->type_group === 'unknown' ? 'birth' : $docType->type_group;
            $chartData['labels'][] = ucwords(str_replace('_', ' ', $val));
            $chartData['data'][] = (int) $docType->count;
        }

        // 5. Timeline & Charts (Finalized registrations only)
        $months = []; $monthlyRegistrations = [];
        for ($i = 5; $i >= 0; $i--) {
            $month = now()->subMonths($i);
            $months[] = $month->format('M');
            $monthlyRegistrations[] = DB::table('documents')
                ->whereNull('deleted_at')
                ->whereIn(DB::raw('LOWER(status)'), ['processed', 'issued', 'active'])
                ->whereBetween('created_at', [$month->copy()->startOfMonth(), $month->copy()->endOfMonth()])
                ->count();
        }

        $actionNeeded = (clone $activeDocuments)
            ->whereIn(DB::raw('LOWER(status)'), ['failed', 'stopped', 'error'])
            ->count();

        // Barangay distribution only for finalized/approved documents
        $barangayRows = DB::table('documents')
            ->selectRaw("COALESCE(NULLIF(barangay, ''), 'Unspecified') as barangay_name, COUNT(*) as count")
            ->whereNull('deleted_at')
            ->whereIn(DB::raw('LOWER(status)'), ['processed', 'issued', 'active'])
            ->groupBy('barangay_name')
            ->orderByDesc('count')
            ->limit(5)
            ->get();

        return response()->json([
            'stats' => [
                'totalDocs' => (int) $totalDocuments,
                'pendingDocs' => (int) $uploadPending,
                'totalIssuances' => (int) $totalIssuances,
                'totalUsers' => (int) $usersCount,
                'processedDocs' => (int) $processedDocs,
            ],
            'chartData' => [
                'docTypes' => $chartData,
                'processStatus' => [
                    'labels' => ['Complete', 'In Queue', 'Action Needed'],
                    'data' => [(int) $processedDocs, (int) $uploadPending, (int) $actionNeeded]
                ],
                'trendChart' => ['labels' => $months, 'data' => $monthlyRegistrations],
                'accuracyChart' => [
                    'labels' => $barangayRows->pluck('barangay_name')->values(),
                    'data' => $barangayRows->pluck('count')->map(fn($count) => (int) $count)->values()
                ]
            ]
        ]);
    }
}
