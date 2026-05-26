<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Setting;
use App\Models\Announcement;

class PublicController extends Controller
{
    /**
     * Get public settings like opening hours and announcements.
     */
    public function config()
    {
        try {
            $settings = Setting::whereIn('key', ['opening_hours'])
                ->get()
                ->pluck('value', 'key');
            
            $announcements = Announcement::where('is_active', true)->orderBy('created_at', 'desc')->get();

            return response()->json([
                'opening_hours' => $settings->get('opening_hours', 'Monday — Friday: 8:00 AM - 5:00 PM'),
                'announcements' => $announcements
            ]);
        } catch (\Exception $e) {
            \Log::error('Public config failure: ' . $e->getMessage());
            return response()->json([
                'opening_hours' => 'Monday — Friday: 8:00 AM - 5:00 PM',
                'announcements' => []
            ], 200);
        }
    }

    /**
     * Get statistical numbers for real-time frontend.
     */
    public function stats()
    {
        try {
            // Count only officially issued issuances (matching the Dashboard's TOTAL ISSUED FILES count)
            $totalIssued = DB::table('issuances')
                ->whereNull('deleted_at')
                ->where(DB::raw('LOWER(status)'), 'issued')
                ->count();

            // Average response simulation based on total issued records
            $baseLatencyMs = 800;
            $factor = log(max($totalIssued, 1) + 1) * 15;
            $avgResponse = round(($baseLatencyMs - $factor) / 1000, 2);
            $avgResponse = max($avgResponse, 0.21);

            return response()->json([
                'processed'  => $totalIssued,   // finalized/issued files only
                'response_s' => $avgResponse,
            ]);
        } catch (\Exception $e) {
            \Log::error('Public stats failure: ' . $e->getMessage());
            return response()->json([
                'processed' => 0,
                'response_s' => 0.21,
            ], 200);
        }
    }
}
