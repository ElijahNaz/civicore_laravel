<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class IssuanceController extends Controller
{
    /**
     * Get all issuances with pagination
     */
    public function index(Request $request)
    {
        $page = (int) $request->query('page', 1);
        $perPage = min((int) $request->query('per_page', 20), 100);
        $type = $request->query('type', '');
        $search = $request->query('search', '');
        
        // Build query
        $whereClause = "";
        $params = [];
        
        if (!empty($type) || !empty($search)) {
            $conditions = [];
            if (!empty($type)) {
                $conditions[] = "type = ?";
                $params[] = $type;
            }
            if (!empty($search)) {
                $conditions[] = "(name LIKE ? OR certNumber LIKE ?)";
                $searchTerm = "%{$search}%";
                $params[] = $searchTerm;
                $params[] = $searchTerm;
            }
            $whereClause = " WHERE " . implode(" AND ", $conditions) . " AND deleted_at IS NULL";
        } else {
            $whereClause = " WHERE deleted_at IS NULL";
        }
        
        // Get total count
        $countQuery = "SELECT COUNT(*) as total FROM issuances" . $whereClause;
        $totalResult = DB::select($countQuery, $params);
        $total = $totalResult[0]->total;
        
        // Get paginated results
        $query = "SELECT id, certNumber, type, name, barangay, issuanceDate, status, encoded_by, document_id, created_at, updated_at, deleted_at FROM issuances" . $whereClause . " ORDER BY id DESC LIMIT ? OFFSET ?";
        $params[] = $perPage;
        $params[] = ($page - 1) * $perPage;
        
        $issuances = DB::select($query, $params);
        
        return response()->json([
            'data' => $issuances,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
            ]
        ]);
    }

    /**
     * Get single issuance
     */
    public function show($id)
    {
        $issuances = DB::select("SELECT * FROM issuances WHERE id = ?", [$id]);
        
        if (count($issuances) === 0) {
            return response()->json(['error' => 'Not found'], 404);
        }
        
        return response()->json($issuances[0]);
    }

    /**
     * Create new issuance
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'certNumber' => 'required|string|max:255',
            'type' => 'required|string|max:255',
            'name' => 'required|string|max:255',
            'barangay' => 'nullable|string|max:255',
            'issuanceDate' => 'nullable|string',
            'status' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->first()], 400);
        }

        $certNumber = $request->input('certNumber');
        $type = $request->input('type');
        $name = $request->input('name');
        $barangay = $request->input('barangay', '');
        $issuanceDate = $request->input('issuanceDate', date('m/d/Y'));
        $status = $request->input('status', 'Active');

        DB::insert("INSERT INTO issuances (certNumber, type, name, barangay, issuanceDate, status) VALUES (?, ?, ?, ?, ?, ?)", 
            [$certNumber, $type, $name, $barangay, $issuanceDate, $status]);

        return response()->json(['success' => true, 'id' => DB::getPdo()->lastInsertId()]);
    }

    /**
     * Delete issuance
     */
    public function destroy($id)
    {
        DB::delete("DELETE FROM issuances WHERE id = ?", [$id]);
        
        return response()->json(['success' => true]);
    }

    /**
     * Undo soft delete for issuance
     */
    public function undo($id)
    {
        DB::update("UPDATE issuances SET deleted_at = NULL WHERE id = ?", [$id]);
        
        return response()->json(['success' => true]);
    }

    public function nextCertNumber($type)
    {
        // Determine prefix based on type
        $prefix = 'BC'; // Birth Certificate
        if ($type === 'death') {
            $prefix = 'DC'; // Death Certificate
        } elseif ($type === 'marriage' || $type === 'marriage_license') {
            $prefix = 'ML'; // Marriage License
        }
        
        $year = date('Y');
        
        // Tie tightly to primary key (id) across all issuances
        $results = DB::select("SELECT MAX(id) as max_id FROM issuances");
        
        $nextNum = 1;
        if (count($results) > 0 && $results[0]->max_id !== null) {
            $nextNum = intval($results[0]->max_id) + 1;
        }
        
        $certNumber = $prefix . '-' . $year . '-' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);
        
        return response()->json(['certNumber' => $certNumber]);
    }

    /**
     * Mark issuance as Issued and capture who issued it
     */
    public function markAsIssued(Request $request, $id)
    {
        $user = $request->session()->get('user_name', 'System');
        
        DB::update("UPDATE issuances SET status = 'Issued', encoded_by = ? WHERE id = ?", [$user, $id]);
        
        return response()->json(['success' => true]);
    }

    /**
     * Download issuance PDF
     */
    public function download($id)
    {
        $issuances = DB::select("SELECT file_data, certNumber FROM issuances WHERE id = ?", [$id]);
        
        if (count($issuances) === 0 || empty($issuances[0]->file_data)) {
            return response()->json(['error' => 'Not found or no file data'], 404);
        }

        $filename = 'Certificate_' . $issuances[0]->certNumber . '.pdf';
        
        return response($issuances[0]->file_data)
            ->header('Content-Type', 'application/pdf')
            ->header('Content-Disposition', 'attachment; filename="' . $filename . '"');
    }

    /**
     * View issuance PDF
     */
    public function view($id)
    {
        $issuances = DB::select("SELECT file_data, certNumber FROM issuances WHERE id = ?", [$id]);
        
        if (count($issuances) === 0 || empty($issuances[0]->file_data)) {
            return response()->json(['error' => 'Not found or no file data'], 404);
        }

        $filename = 'Certificate_' . $issuances[0]->certNumber . '.pdf';
        
        return response($issuances[0]->file_data)
            ->header('Content-Type', 'application/pdf')
            ->header('Content-Disposition', 'inline; filename="' . $filename . '"');
    }
}
