<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActivityLogController extends Controller
{
    /**
     * Store a new activity log entry
     */
    public function store(Request $request)
    {
        $request->validate([
            'action' => 'required|string',
            'record_type' => 'required|string',
            'record_id' => 'required|integer',
            'details' => 'nullable|string',
        ]);

        $userName = $request->input('user_name', 'System');
        
        DB::table('activity_logs')->insert([
            'user_name' => $userName,
            'action' => $request->action,
            'record_type' => $request->record_type,
            'record_id' => $request->record_id,
            'details' => $request->details,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Activity logged successfully']);
    }

    /**
     * Get recent activity logs for the history tab
     */
    public function index()
    {
        $logs = DB::table('activity_logs')
            ->orderBy('created_at', 'desc')
            ->limit(500)
            ->get();

        return response()->json($logs);
    }
}
