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
        $query = "SELECT id, certNumber, type, name, barangay, issuanceDate, status, encoded_by, document_id, extracted_data, created_at, updated_at, deleted_at FROM issuances" . $whereClause . " ORDER BY id DESC LIMIT ? OFFSET ?";
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
        $issuance = DB::table('issuances')->where('id', $id)->first();
        if (!$issuance) {
            return response()->json(['success' => false, 'error' => 'Issuance not found'], 404);
        }

        DB::table('issuances')->where('id', $id)->update([
            'deleted_at' => now(),
            'updated_at' => now(),
        ]);
        
        return response()->json(['success' => true]);
    }

    /**
     * Update issuance record
     */
    public function update(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'certNumber' => 'nullable|string|max:255',
            'type' => 'nullable|string|max:255',
            'name' => 'nullable|string|max:255',
            'barangay' => 'nullable|string|max:255',
            'issuanceDate' => 'nullable|string',
            'status' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->first()], 400);
        }

        $fields = [];
        $params = [];

        foreach ($request->only(['certNumber', 'type', 'name', 'barangay', 'issuanceDate', 'status', 'encoded_by']) as $key => $value) {
            $fields[] = "$key = ?";
            $params[] = $value;
        }

        if (empty($fields)) {
            return response()->json(['error' => 'No fields to update'], 400);
        }

        $params[] = $id;
        $sql = "UPDATE issuances SET " . implode(', ', $fields) . " WHERE id = ?";
        DB::update($sql, $params);

        // --- Logic Fix: Regenerate PDF to keep it synced with the new data ---
        $record = DB::selectOne("SELECT * FROM issuances WHERE id = ?", [$id]);
        if ($record && $record->document_id) {
            $doc = DB::selectOne("SELECT * FROM documents WHERE id = ?", [$record->document_id]);
            if ($doc) {
                $docType = $record->type;
                $extractedFields = json_decode($record->extracted_data, true) ?: [];
                
                // Overlay current database values (the updated ones)
                // Note: We should probably update extracted_data in the DB first if name/barangay changed, 
                // but usually the React app sends the full updated extracted_data.
                // Let's assume the request might have updated individual fields OR the whole extracted_data.
                
                if ($request->has('extracted_data')) {
                     $extractedFields = is_string($request->extracted_data) ? json_decode($request->extracted_data, true) : $request->extracted_data;
                }

                $overlayFields = \App\Services\TemplateConfigService::getFieldsForType($docType);
                
                $pdf = app('dompdf.wrapper');
                $pdf->setPaper('a4', 'portrait');
                $pdf->loadView('pdf.composite_document', [
                    'doc' => $doc, 
                    'fields' => $extractedFields,
                    'overlayFields' => $overlayFields
                ]);
                $pdfData = $pdf->output();

                $filePath = $this->storeIssuancePdf($id, $docType, $pdfData);
                DB::table('issuances')->where('id', $id)->update(['file_path' => $filePath]);
            }
        }

        return response()->json(['success' => true]);
    }

    /**
     * Undo soft delete for issuance
     */
    public function undo($id)
    {
        $issuance = DB::table('issuances')->where('id', $id)->first();
        if (!$issuance) {
            return response()->json(['success' => false, 'error' => 'Issuance not found'], 404);
        }

        DB::table('issuances')->where('id', $id)->update([
            'deleted_at' => null,
            'updated_at' => now(),
        ]);
        
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
        return $this->getIssuanceFile($id, 'attachment');
    }

    /**
     * View issuance PDF
     */
    public function view($id)
    {
        return $this->getIssuanceFile($id, 'inline');
    }

    /**
     * Helper to get or generate the issuance PDF
     */
    private function getIssuanceFile($id, $disposition = 'inline')
    {
        $record = DB::selectOne("SELECT * FROM issuances WHERE id = ?", [$id]);
        
        if (!$record) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $filePath = property_exists($record, 'file_path') ? $record->file_path : null;
        if ($filePath && request()->query('refresh') !== '1' && \Storage::disk('public')->exists($filePath)) {
            return response()->file(\Storage::disk('public')->path($filePath), [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => $disposition . '; filename="' . $this->issuanceFilename($record) . '"',
            ]);
        }

        $doc = DB::selectOne("SELECT * FROM documents WHERE id = ?", [$record->document_id]);
        if (!$doc) {
            return response()->json(['error' => 'No file data available'], 404);
        }

        $docType = strtolower($record->type ?? 'birth');
        $extractedFields = json_decode($record->extracted_data, true) ?: [];
        $overlayFields = \App\Services\TemplateConfigService::getFieldsForType($docType);

        $pdf = app('dompdf.wrapper');
        $pdf->setPaper('a4', 'portrait');
        $pdf->loadView('pdf.composite_document', [
            'doc' => $doc,
            'fields' => $extractedFields,
            'overlayFields' => $overlayFields,
            'docType' => $docType,
        ]);

        $pdfData = $pdf->output();
        $filePath = $this->storeIssuancePdf($id, $docType, $pdfData);
        DB::table('issuances')->where('id', $id)->update(['file_path' => $filePath]);

        return response()->file(\Storage::disk('public')->path($filePath), [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => $disposition . '; filename="' . $this->issuanceFilename($record) . '"',
        ]);
    }

    private function storeIssuancePdf($id, $docType, $pdfData)
    {
        $safeType = preg_replace('/[^a-z0-9_-]/i', '_', strtolower($docType ?: 'certificate'));
        $filePath = 'issuances/' . $safeType . '_' . $id . '_' . time() . '.pdf';

        \Storage::disk('public')->put($filePath, $pdfData);

        return $filePath;
    }

    private function issuanceFilename($record)
    {
        $certNumber = preg_replace('/[^a-z0-9_-]/i', '_', $record->certNumber ?? 'certificate');
        return 'Certificate_' . $certNumber . '.pdf';
    }
}
