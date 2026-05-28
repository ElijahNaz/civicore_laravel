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
        $query = "SELECT id, certNumber, type, name, barangay, issuanceDate, status, encoded_by, document_id, extracted_data, or_number, print_remarks, requested_by, approved_by, ticket_number, created_at, updated_at, deleted_at FROM issuances" . $whereClause . " ORDER BY id DESC LIMIT ? OFFSET ?";
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

        DB::transaction(function () use ($id, $issuance) {
            DB::table('issuances')->where('id', $id)->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);

            if ($issuance->document_id) {
                DB::table('documents')->where('id', $issuance->document_id)->update([
                    'deleted_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        });
        
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

        $data = $request->only(['certNumber', 'type', 'name', 'barangay', 'issuanceDate', 'status', 'encoded_by', 'extracted_data']);
        
        if ($request->has('personName') && !$request->has('name')) {
            $data['name'] = $request->input('personName');
        }
        if ($request->has('extracted_fields') && !$request->has('extracted_data')) {
            $data['extracted_data'] = $request->input('extracted_fields');
        }

        // Reconstruct name from extracted_data if it is null or empty (e.g. from empty personName in frontend)
        if (empty($data['name'])) {
            $extData = $data['extracted_data'] ?? null;
            if ($extData) {
                $fieldsArray = is_string($extData) ? json_decode($extData, true) : $extData;
                if ($fieldsArray) {
                    $docType = $data['type'] ?? $request->input('detectedType') ?? null;
                    if (!$docType && isset($id)) {
                        $record = DB::selectOne("SELECT type FROM issuances WHERE id = ?", [$id]);
                        $docType = $record ? $record->type : null;
                    }
                    $data['name'] = $this->buildFullName($fieldsArray, $docType);
                }
            }
        }

        // Safety fallback to prevent integrity constraint violation if name is still empty/null
        if (empty($data['name']) && isset($id)) {
            $record = DB::selectOne("SELECT name FROM issuances WHERE id = ?", [$id]);
            if ($record) {
                $data['name'] = $record->name;
            }
        }

        // Keep certNumber updated from extracted fields tie if possible
        if (empty($data['certNumber'])) {
            $ext = $data['extracted_data'] ?? null;
            if (is_array($ext) && isset($ext['cert_no'])) {
                $data['certNumber'] = $ext['cert_no'];
            } elseif (is_string($ext)) {
                $extDecoded = json_decode($ext, true);
                if (isset($extDecoded['cert_no'])) {
                    $data['certNumber'] = $extDecoded['cert_no'];
                }
            }
        }

        $fields = [];
        $params = [];

        foreach ($data as $key => $value) {
            $fields[] = "$key = ?";
            if ($key === 'extracted_data') {
                $params[] = is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_UNICODE);
            } else {
                $params[] = $value;
            }
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
        $userId = $request->session()->get('user_id');
        $dbUser = $userId ? \App\Models\User::find($userId) : null;
        $userName = $dbUser ? $dbUser->name : $request->session()->get('user_name', 'System');
        
        DB::update("UPDATE issuances SET status = 'Issued', encoded_by = ? WHERE id = ?", [$userName, $id]);
        
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

    /**
     * Request print approval for an issuance
     */
    public function requestPrint(Request $request, $id)
    {
        $request->validate([
            'or_number' => 'nullable|string|max:255',
            'print_remarks' => 'nullable|string|max:1000',
        ]);

        $record = DB::table('issuances')->where('id', $id)->first();
        if (!$record) {
            return response()->json(['error' => 'Issuance not found'], 404);
        }

        // Resolve user name from session
        $userId = $request->session()->get('user_id');
        $user = $userId ? \App\Models\User::find($userId) : null;
        $userName = $user ? $user->name : 'System';

        $orNumber = $request->or_number;
        if (empty($orNumber)) {
            $orNumber = 'OR-' . date('Ymd') . '-' . str_pad(rand(1000, 9999), 4, '0', STR_PAD_LEFT);
        }

        DB::table('issuances')->where('id', $id)->update([
            'status' => 'Pending Approval',
            'or_number' => $orNumber,
            'print_remarks' => $request->print_remarks,
            'requested_by' => $userName,
            'updated_at' => now(),
        ]);

        // Insert activity log
        DB::table('activity_logs')->insert([
            'user_name' => $userName,
            'action' => 'Requested Print',
            'record_type' => 'Issuance',
            'record_id' => $id,
            'details' => "Requested print for {$record->type} certificate (OR: {$orNumber}) of {$record->name}",
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true]);
    }

    /**
     * Approve a print request
     */
    public function approvePrint(Request $request, $id)
    {
        $record = DB::table('issuances')->where('id', $id)->first();
        if (!$record) {
            return response()->json(['error' => 'Issuance not found'], 404);
        }

        // Resolve user name from session
        $userId = $request->session()->get('user_id');
        $user = $userId ? \App\Models\User::find($userId) : null;
        $userName = $user ? $user->name : 'System';

        DB::table('issuances')->where('id', $id)->update([
            'status' => 'Approved',
            'approved_by' => $userName,
            'updated_at' => now(),
        ]);

        // Insert activity log
        DB::table('activity_logs')->insert([
            'user_name' => $userName,
            'action' => 'Approved Print',
            'record_type' => 'Issuance',
            'record_id' => $id,
            'details' => "Approved print for {$record->type} certificate of {$record->name}",
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true]);
    }

    /**
     * Reject a print request
     */
    public function rejectPrint(Request $request, $id)
    {
        $record = DB::table('issuances')->where('id', $id)->first();
        if (!$record) {
            return response()->json(['error' => 'Issuance not found'], 404);
        }

        // Resolve user name from session
        $userId = $request->session()->get('user_id');
        $user = $userId ? \App\Models\User::find($userId) : null;
        $userName = $user ? $user->name : 'System';

        DB::table('issuances')->where('id', $id)->update([
            'status' => 'Active', // reset to base state
            'updated_at' => now(),
        ]);

        // Insert activity log
        DB::table('activity_logs')->insert([
            'user_name' => $userName,
            'action' => 'Rejected Print',
            'record_type' => 'Issuance',
            'record_id' => $id,
            'details' => "Rejected print for {$record->type} certificate of {$record->name}",
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true]);
    }

    /**
     * Process OCR on an uploaded image to search issuances
     */
    public function ocrSearch(Request $request)
    {
        $request->validate([
            'file' => 'required|image|max:10240', // max 10MB
        ]);

        if (!$request->hasFile('file') || !$request->file('file')->isValid()) {
            return response()->json(['error' => 'Invalid file uploaded'], 400);
        }

        $uploadedFile = $request->file('file');
        
        // Save file temporarily in public disk
        $tempPath = 'temp_ocr_search/' . time() . '_' . uniqid() . '.' . $uploadedFile->getClientOriginalExtension();
        \Storage::disk('public')->put($tempPath, file_get_contents($uploadedFile));
        
        $absolutePath = \Storage::disk('public')->path($tempPath);

        try {
            // Call Python OCR server running on port 8080
            $response = \Illuminate\Support\Facades\Http::timeout(60)->post('http://127.0.0.1:8080/ocr', [
                'file_path' => $absolutePath,
                'preprocess' => true,
                'ocr_mode' => 'balanced',
            ]);

            // Delete local temp file
            \Storage::disk('public')->delete($tempPath);

            if ($response->failed() || !($response->json()['success'] ?? false)) {
                return response()->json(['error' => 'OCR server failed to extract text: ' . $response->body()], 500);
            }

            $ocrResult = $response->json();
            $extractedFields = $ocrResult['extracted_fields'] ?? [];
            $detectedType = $ocrResult['detected_type'] ?? 'unknown';

            // Extract terms
            $name = $extractedFields['full_name'] ?? '';
            if (empty($name)) {
                $firstName = $extractedFields['first_name'] ?? '';
                $middleName = $extractedFields['middle_name'] ?? '';
                $lastName = $extractedFields['last_name'] ?? '';
                $name = trim("{$firstName} {$middleName} {$lastName}");
            }
            if (empty($name)) {
                // Check groom/bride names for marriage certs
                $hName = $extractedFields['husbands_name'] ?? '';
                $wName = $extractedFields['wifes_name'] ?? '';
                if ($hName || $wName) {
                    $name = $hName ?: $wName;
                }
            }

            $certNumber = $extractedFields['registry_number'] ?? '';
            $barangay = $extractedFields['barangay'] ?? '';

            return response()->json([
                'success' => true,
                'extracted' => [
                    'name' => $name,
                    'certNumber' => $certNumber,
                    'barangay' => $barangay,
                    'type' => $detectedType,
                ],
                'raw_ocr' => $ocrResult
            ]);

        } catch (\Exception $e) {
            // Cleanup temp file in case of exception
            if (\Storage::disk('public')->exists($tempPath)) {
                \Storage::disk('public')->delete($tempPath);
            }
            \Log::error('OCR search error: ' . $e->getMessage());
            return response()->json(['error' => 'An error occurred during OCR: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Build full name helper from split name fields
     */
    private function buildFullName($fields, $type)
    {
        if ($type === 'marriage') {
            $h = trim(($fields['husband_last_name'] ?? '') . ', ' . ($fields['husband_first_name'] ?? '') . ' ' . ($fields['husband_middle_name'] ?? '') . ' ' . ($fields['husband_suffix'] ?? ''));
            $w = trim(($fields['wife_last_name'] ?? '') . ', ' . ($fields['wife_first_name'] ?? '') . ' ' . ($fields['wife_middle_name'] ?? '') . ' ' . ($fields['wife_suffix'] ?? ''));
            return trim("$h & $w", " &");
        }
        
        // Default for Birth/Death
        $last = $fields['last_name'] ?? '';
        $first = $fields['first_name'] ?? '';
        $middle = $fields['middle_name'] ?? '';
        $suffix = $fields['suffix'] ?? '';
        
        if (!$last && !$first) return null;
        
        return trim("$last, $first $middle $suffix");
    }
}
