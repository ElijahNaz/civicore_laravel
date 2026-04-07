<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;

class DocumentController extends Controller
{
    /**
     * Get all documents with pagination
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
                $conditions[] = "(name LIKE ? OR personName LIKE ? OR barangay LIKE ?)";
                $searchTerm = "%{$search}%";
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
            }
            $whereClause = " WHERE " . implode(" AND ", $conditions) . " AND deleted_at IS NULL";
        } else {
            $whereClause = " WHERE deleted_at IS NULL";
        }
        
        // Get total count
        $countQuery = "SELECT COUNT(*) as total FROM documents" . $whereClause;
        $totalResult = DB::select($countQuery, $params);
        $total = $totalResult[0]->total;
        
        // Get paginated results (exclude file_data for performance)
        $query = "SELECT id, name, type, date, size, status, personName, barangay, metadata, ocr_text, extracted_fields, detected_type, created_at, updated_at, encoded_by 
                  FROM documents" . $whereClause . " ORDER BY id DESC LIMIT ? OFFSET ?";
        $params[] = $perPage;
        $params[] = ($page - 1) * $perPage;
        
        $documents = DB::select($query, $params);
        
        return response()->json([
            'data' => $documents,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage),
            ]
        ]);
    }

    /**
     * Create new document
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'type' => 'required|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->first()], 400);
        }

        $name = $request->input('name');
        $type = $request->input('type');
        $date = $request->input('date', date('m/d/Y'));
        $size = $request->input('size', '0 MB');
        $status = $request->input('status', 'Uploaded');
        $previewData = $request->input('previewData');
        $personName = $request->input('personName', '');
        $barangay = $request->input('barangay', '');
        $metadata = $request->input('metadata');

        DB::insert("INSERT INTO documents (name, type, date, size, status, previewData, personName, barangay, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", 
            [$name, $type, $date, $size, $status, $previewData, $personName, $barangay, $metadata]);

        return response()->json(['success' => true, 'id' => DB::getPdo()->lastInsertId()]);
    }

    /**
     * Upload file - stores file content directly in database
     */
    public function upload(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|max:10240', // 10MB max
            'docType' => 'nullable|string',
            'personName' => 'nullable|string',
            'barangay' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'error' => $validator->errors()->first()], 400);
        }

        $file = $request->file('file');
        $docType = $request->input('docType', 'Uncategorized');
        $personName = $request->input('personName', '');
        $barangay = $request->input('barangay', '');

        // Generate unique filename
        $originalName = $file->getClientOriginalName();
        $extension = $file->getClientOriginalExtension();
        $filename = 'file-' . time() . '-' . rand(100000000, 999999999) . '.' . $extension;

        // Get file content to store in database
        $fileContent = file_get_contents($file->getRealPath());

        // Get file size
        $size = number_format($file->getSize() / (1024 * 1024), 2) . ' MB';

        // Save file info metadata (without filesystem path)
        $fileInfo = json_encode([
            'originalName' => $originalName,
            'filename' => $filename,
            'size' => $file->getSize(),
            'mimetype' => $file->getMimeType(),
            'storedIn' => 'database'
        ]);

        // Save to database with file content
        DB::insert("INSERT INTO documents (name, type, date, size, status, previewData, personName, barangay, metadata, file_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
            [$originalName, $docType, date('m/d/Y'), $size, 'Pending', null, $personName, $barangay, $fileInfo, $fileContent]);

        return response()->json([
            'success' => true,
            'id' => DB::getPdo()->lastInsertId(),
            'filename' => $filename,
            'originalName' => $originalName,
            'size' => $size
        ]);
    }

    /**
     * Update document extracted fields (after OCR review)
     * PUT /api/documents/{id}
     */
    public function update(Request $request, $id)
    {
        $extractedFields = $request->input('extracted_fields');
        $personName      = $request->input('personName', '');
        $barangay        = $request->input('barangay', '');
        $status          = $request->input('status', 'Processed');
        $parentalConsent = $request->input('parental_consent', false);

        // Get current user encoded_by logic based on custom session setup
        $userId = $request->session()->get('user_id');
        $user = $userId ? \App\Models\User::find($userId) : null;
        $encodedBy = $user ? $user->name : 'System';

        DB::update(
            "UPDATE documents SET extracted_fields = ?, personName = ?, barangay = ?, status = ?, parental_consent = ?, encoded_by = ? WHERE id = ?",
            [
                json_encode($extractedFields, JSON_UNESCAPED_UNICODE),
                $personName,
                $barangay,
                $status,
                $parentalConsent ? 1 : 0,
                $encodedBy,
                $id,
            ]
        );

        // --- Automatically inject into Issuances if Processed ---
        if ($status === 'Processed') {
            $doc = DB::select("SELECT * FROM documents WHERE id = ?", [$id]);
            if (count($doc) > 0) {
                // Determine prefix based on type
                $docType = $doc[0]->detected_type ?: $doc[0]->type;
                $prefix = 'BC'; // Birth Certificate default
                if ($docType === 'death') {
                    $prefix = 'DC'; // Death Certificate
                } elseif ($docType === 'marriage' || $docType === 'marriage_license') {
                    $prefix = 'ML'; // Marriage License
                }
                
                $year = date('Y');
                
                // Get the last certificate number for this type and year
                $results = DB::select("SELECT certNumber FROM issuances WHERE type = ? AND certNumber LIKE ? ORDER BY id DESC LIMIT 1", 
                    [$docType, $prefix . '-' . $year . '%']);
                
                $nextNum = 1;
                if (count($results) > 0) {
                    $lastCertNum = $results[0]->certNumber;
                    $parts = explode('-', $lastCertNum);
                    if (count($parts) === 3) {
                        $nextNum = intval($parts[2]) + 1;
                    }
                }
                
                $certNumber = $prefix . '-' . $year . '-' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);
                $issuanceDate = date('m/d/Y');
                
                // Generate PDF using DOMPDF
                $pdf = app('dompdf.wrapper');
                $pdf->loadView('pdf.certificate', ['doc' => $doc[0], 'fields' => $extractedFields]);
                $pdfData = $pdf->output();

                // insert issuance with file_data
                DB::insert("INSERT INTO issuances (certNumber, type, name, barangay, issuanceDate, status, encoded_by, document_id, extracted_data, file_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
                    [$certNumber, $docType, $personName, $barangay, $issuanceDate, 'Active', $encodedBy, $id, json_encode($extractedFields, JSON_UNESCAPED_UNICODE), $pdfData]);
            }
        }

        return response()->json(['success' => true]);
    }

    /**
     * Delete document
     */
    public function destroy($id)
    {
        // Soft delete from database
        DB::update("UPDATE documents SET deleted_at = NOW() WHERE id = ?", [$id]);
        
        return response()->json(['success' => true]);
    }

    /**
     * Undo soft delete for document
     */
    public function undo($id)
    {
        DB::update("UPDATE documents SET deleted_at = NULL WHERE id = ?", [$id]);
        
        return response()->json(['success' => true]);
    }

    /**
     * Download/view file from database
     */
    public function download($id)
    {
        $documents = DB::select("SELECT * FROM documents WHERE id = ?", [$id]);
        
        if (count($documents) === 0) {
            return response()->json(['error' => 'Document not found'], 404);
        }

        $doc = $documents[0];
        $metadata = json_decode($doc->metadata, true);
        
        $filename = $metadata['originalName'] ?? 'document.pdf';
        
        // Get file content from database
        $fileContent = $doc->file_data;
        
        if (empty($fileContent)) {
            return response()->json(['error' => 'File content not found in database'], 404);
        }

        $filename = $metadata['originalName'] ?? 'document.pdf';
        $mimetype = $metadata['mimetype'] ?? 'application/pdf';

        return response($fileContent)
            ->header('Content-Type', $mimetype)
            ->header('Content-Disposition', 'inline; filename="' . $filename . '"');
    }
}
