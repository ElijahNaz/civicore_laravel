<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use App\Models\User;

class UserController extends Controller
{
    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Get the authenticated user from session, or abort with 401.
     */
    private function sessionUser(Request $request): ?User
    {
        $userId = $request->session()->get('user_id');
        return $userId ? User::find($userId) : null;
    }

    // ─── List users ───────────────────────────────────────────────────────────

    /**
     * GET /api/users
     * Admin  → all users (with optional search + pagination)
     * Others → only their own record
     */
    public function index(Request $request)
    {
        $actor = $this->sessionUser($request);
        if (!$actor) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        if ($actor->role !== 'Admin') {
            // Non-admins only see themselves
            return response()->json([
                'data' => [$this->formatUser($actor)],
                'meta' => ['current_page' => 1, 'per_page' => 1, 'total' => 1, 'last_page' => 1],
            ]);
        }

        // Admin: paginated + searchable list
        $page    = max(1, (int) $request->query('page', 1));
        $perPage = min((int) $request->query('per_page', 20), 100);
        $search  = $request->query('search', '');

        $query = User::query()->orderByDesc('id');

        if (!empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('role', 'like', "%{$search}%");
            });
        }

        $paginated = $query->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'data' => $paginated->map(fn($u) => $this->formatUser($u)),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
                'last_page'    => $paginated->lastPage(),
            ],
        ]);
    }

    // ─── Single user ──────────────────────────────────────────────────────────

    /**
     * GET /api/users/{id}
     * Admin → any user | Staff/User → only self
     */
    public function show(Request $request, $id)
    {
        $actor = $this->sessionUser($request);
        if (!$actor) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        if ($actor->role !== 'Admin' && $actor->id != $id) {
            return response()->json(['error' => 'Forbidden.'], 403);
        }

        $user = User::find($id);
        if (!$user) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        return response()->json($this->formatUser($user));
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    /**
     * POST /api/users  |  POST /api/create-account
     * Admin only
     */
    public function store(Request $request)
    {
        return $this->createUser($request);
    }

    public function createAccount(Request $request)
    {
        return $this->createUser($request);
    }

    private function createUser(Request $request)
    {
        $actor = $this->sessionUser($request);
        if (!$actor) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        if ($actor->role !== 'Admin') {
            return response()->json(['error' => 'Only Admins can create accounts.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'role'     => 'required|in:Admin,Staff,User',
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->first()], 400);
        }

        $user = User::create([
            'name'     => $request->input('name'),
            'email'    => $request->input('email'),
            'password' => Hash::make($request->input('password')),
            'role'     => $request->input('role'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Account created successfully.',
            'user'    => $this->formatUser($user),
        ], 201);
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    /**
     * PUT /api/users/{id}
     * Admin → can update role + full profile of anyone
     * Staff/User → cannot use this endpoint (use updateProfile for own data)
     */
    public function update(Request $request, $id)
    {
        $actor = $this->sessionUser($request);
        if (!$actor) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        if ($actor->role !== 'Admin') {
            return response()->json(['error' => 'Only Admins can change roles.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'role' => 'required|in:Admin,Staff,User',
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->first()], 400);
        }

        $user = User::find($id);
        if (!$user) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        $user->role = $request->input('role');
        $user->save();

        return response()->json(['success' => true, 'user' => $this->formatUser($user)]);
    }

    /**
     * PUT /api/users/{id}/profile
     * Admin → any user | Staff/User → only self
     */
    public function updateProfile(Request $request, $id)
    {
        $actor = $this->sessionUser($request);
        if (!$actor) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        if ($actor->role !== 'Admin' && $actor->id != $id) {
            return response()->json(['error' => 'Forbidden.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'name'  => 'required|string|max:255',
            'email' => 'required|email|unique:users,email,' . $id,
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->first()], 400);
        }

        $user = User::find($id);
        if (!$user) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        $user->name  = $request->input('name');
        $user->email = $request->input('email');
        $user->save();

        return response()->json(['success' => true, 'message' => 'Profile updated.', 'user' => $this->formatUser($user)]);
    }

    // ─── Delete ───────────────────────────────────────────────────────────────

    /**
     * DELETE /api/users/{id}
     * Admin → any user | Staff/User → only self
     */
    public function destroy(Request $request, $id)
    {
        $actor = $this->sessionUser($request);
        if (!$actor) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        if ($actor->role !== 'Admin' && $actor->id != $id) {
            return response()->json(['error' => 'Forbidden.'], 403);
        }

        $user = User::find($id);
        if (!$user) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        $user->delete();

        return response()->json(['success' => true, 'message' => 'Account deleted.']);
    }

    // ─── Format ───────────────────────────────────────────────────────────────

    private function formatUser(User $user): array
    {
        return [
            'id'          => $user->id,
            'name'        => $user->name,
            'email'       => $user->email,
            'role'        => $user->role,
            'permissions' => $user->permissions ?? [],
            'created_at'  => $user->created_at,
        ];
    }
}
