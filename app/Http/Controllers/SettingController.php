<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use App\Models\Setting;
use App\Models\User;

class SettingController extends Controller
{
    /**
     * Update settings. Only allowed for SuperAdmins/Admins depending on rules.
     * We'll allow any logged-in valid staff (Admin, SuperAdmin) to update portal settings.
     */
    public function update(Request $request)
    {
        $userId = $request->session()->get('user_id');
        $actor = $userId ? User::find($userId) : null;

        if (!$actor || !in_array($actor->role, ['Admin', 'SuperAdmin'])) {
            return response()->json(['error' => 'Unauthorized access.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'opening_hours'       => 'nullable|string|max:255',
            'announcement_active' => 'nullable|boolean',
            'announcement_text'   => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->first()], 400);
        }

        // Update Opening Hours
        if ($request->has('opening_hours')) {
            Setting::updateOrCreate(
                ['key' => 'opening_hours'],
                ['value' => $request->input('opening_hours')]
            );
        }

        // Announcement State
        if ($request->has('announcement_active')) {
            Setting::updateOrCreate(
                ['key' => 'announcement_active'],
                ['value' => $request->input('announcement_active') ? '1' : '0']
            );
        }

        // Announcement Text
        if ($request->has('announcement_text')) {
            Setting::updateOrCreate(
                ['key' => 'announcement_text'],
                ['value' => $request->input('announcement_text')]
            );
        }

        return response()->json(['success' => true, 'message' => 'Portal configuration updated successfully.']);
    }
}
