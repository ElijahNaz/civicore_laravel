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

        // Resolve uploader name from session
        $userId = $request->session()->get('user_id');
        $user = $userId ? \App\Models\User::find($userId) : null;
        $encodedBy = $user ? $user->name : 'System';

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

        // Save to database with file content and encoded_by
        DB::insert("INSERT INTO documents (name, type, date, size, status, previewData, personName, barangay, metadata, file_data, encoded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
            [$originalName, $docType, date('m/d/Y'), $size, 'Pending', null, $personName, $barangay, $fileInfo, $fileContent, $encodedBy]);

        return response()->json([
            'success' => true,
            'id' => DB::getPdo()->lastInsertId(),
            'filename' => $filename,
            'originalName' => $originalName,
            'size' => $size,
            'encoded_by' => $encodedBy,
        ]);
    }

    /**
     * Update document extracted fields (after OCR review)
     * PUT /api/documents/{id}
     */
    public function update(Request $request, $id)
    {
        $extractedFields = $request->input('extracted_fields');
        $ocrText         = $request->input('ocr_text', '');
        $personName      = $request->input('personName', '');
        $barangay        = $request->input('barangay', '');
        $status          = $request->input('status', 'Processed');
        $parentalConsent = $request->input('parental_consent', false);

        return $this->performSave($request, $id, $extractedFields, $ocrText, $personName, $barangay, $status, $parentalConsent);
    }

    /**
     * Fast-track approval of extracted data without the full modal
     */
    public function quickApprove(Request $request, $id)
    {
        $doc = DB::select("SELECT * FROM documents WHERE id = ?", [$id]);
        if (count($doc) === 0) return response()->json(['error' => 'Document not found'], 404);
        
        $document = $doc[0];
        $fields = json_decode($document->extracted_fields, true) ?? [];
        $personName = $fields['full_name'] ?? $fields['husbands_name'] ?? $document->name;
        $barangay = $fields['barangay'] ?? '';
        
        return $this->performSave($request, $id, $fields, $document->ocr_text, $personName, $barangay, 'Processed', false);
    }

    /**
     * Shared logic for saving/approving a document
     */
    private function performSave($request, $id, $extractedFields, $ocrText, $personName, $barangay, $status, $parentalConsent)
    {
        // Get current user encoded_by logic based on custom session setup
        $userId = $request->session()->get('user_id');
        $user = $userId ? \App\Models\User::find($userId) : null;
        $encodedBy = $user ? $user->name : 'System';

        DB::update(
            "UPDATE documents SET extracted_fields = ?, ocr_text = ?, personName = ?, barangay = ?, status = ?, parental_consent = ?, encoded_by = ? WHERE id = ?",
            [
                json_encode($extractedFields, JSON_UNESCAPED_UNICODE),
                $ocrText,
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
                
                // Generate PDF (using full OCR text as primary output as requested)
                $pdf = app('dompdf.wrapper');
                $pdf->setPaper('a4', 'portrait');
                $pdf->loadView('pdf.ocr_report', [
                    'doc' => $doc[0], 
                    'fields' => $extractedFields,
                    'ocr_text' => $ocrText ?: $doc[0]->ocr_text
                ]);
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
        $status = strtolower($doc->status ?? 'pending');
        
        // --- NEW: If extracted or processed, generate a PDF preview with the text ---
        if ($status === 'extracted' || $status === 'processed' || $status === 'active') {
            $fields = json_decode($doc->extracted_fields, true) ?? [];
            
            // Build a quick PDF view
            $pdf = app('dompdf.wrapper');
            $pdf->loadView('pdf.ocr_report', [
                'doc' => $doc, 
                'fields' => $fields,
                'ocr_text' => $doc->ocr_text,
                'is_preview' => true 
            ]);
            
            return response($pdf->output())
                ->header('Content-Type', 'application/pdf')
                ->header('Content-Disposition', 'inline; filename="preview-' . $id . '.pdf"');
        }

        // Otherwise return the raw upload
        $filename = $metadata['originalName'] ?? 'document.pdf';
        $fileContent = $doc->file_data;
        
        if (empty($fileContent)) {
            return response()->json(['error' => 'File content not found in database'], 404);
        }

        $mimetype = $metadata['mimetype'] ?? 'application/pdf';

        return response($fileContent)
            ->header('Content-Type', $mimetype)
            ->header('Content-Disposition', 'inline; filename="' . $filename . '"');
    }

    /**
     * Download the extracted OCR text as a .txt file
     */
    public function downloadTxt($id)
    {
        $doc = DB::selectOne("SELECT name, ocr_text FROM documents WHERE id = ?", [$id]);

        if (!$doc || !$doc->ocr_text) {
            return response()->json(['error' => 'No text content available.'], 404);
        }

        $filename = pathinfo($doc->name, PATHINFO_FILENAME) . '.txt';

        return response($doc->ocr_text)
            ->header('Content-Type', 'text/plain')
            ->header('Content-Disposition', 'attachment; filename="' . $filename . '"');
    }
}
