<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Announcement;
use App\Models\User;
use Illuminate\Support\Facades\Validator;

class AnnouncementController extends Controller
{
    /**
     * Auth check for Admins
     */
    private function checkAdmin(Request $request)
    {
        $userId = $request->session()->get('user_id');
        $actor = $userId ? User::find($userId) : null;
        if (!$actor || !in_array($actor->role, ['Admin', 'SuperAdmin'])) {
            return false;
        }
        return true;
    }

    public function index()
    {
        try {
            return response()->json(Announcement::orderBy('created_at', 'desc')->get());
        } catch (\Exception $e) {
            \Log::error('Announcements load failure: ' . $e->getMessage());
            return response()->json([], 200);
        }
    }

    public function store(Request $request)
    {
        if (!$this->checkAdmin($request)) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validator = Validator::make($request->all(), [
            'message' => 'required|string|max:1000',
            'is_active' => 'boolean'
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->first()], 400);
        }

        $announcement = Announcement::create([
            'message' => $request->input('message'),
            'is_active' => $request->input('is_active', true),
        ]);

        return response()->json(['success' => true, 'announcement' => $announcement]);
    }

    public function update(Request $request, $id)
    {
        if (!$this->checkAdmin($request)) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validator = Validator::make($request->all(), [
            'message' => 'sometimes|required|string|max:1000',
            'is_active' => 'boolean'
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->first()], 400);
        }

        $announcement = Announcement::findOrFail($id);
        
        if ($request->has('message')) {
            $announcement->message = $request->input('message');
        }
        if ($request->has('is_active')) {
            $announcement->is_active = $request->input('is_active');
        }
        
        $announcement->save();

        return response()->json(['success' => true, 'announcement' => $announcement]);
    }

    public function destroy(Request $request, $id)
    {
        if (!$this->checkAdmin($request)) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        Announcement::destroy($id);
        return response()->json(['success' => true]);
    }
}
