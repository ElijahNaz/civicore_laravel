<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Bus;
use App\Jobs\ProcessDocumentOcr;

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
        
        // Enhance documents with real-time batch progress if processing
        foreach ($documents as $doc) {
            $status = strtolower($doc->status ?? '');
            if ($status === 'processing' || $status === 'pending') {
                $metadata = json_decode($doc->metadata, true);
                if (isset($metadata['batch_id'])) {
                    $batch = Bus::findBatch($metadata['batch_id']);
                    if ($batch) {
                        $doc->batch_progress = $batch->progress();
                        $doc->batch_total = $batch->totalJobs;
                        $doc->batch_processed = $batch->processedJobs;
                        $doc->batch_failed = $batch->failedJobs;
                        $doc->batch_finished = $batch->finished();
                    }
                }
            }
        }
        
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
     * Get persistent submission history from logs
     */
    public function history(Request $request)
    {
        // Only show 'Processed' and 'Issued' actions for the Submission History tab
        $logs = DB::table('document_history_logs')
            ->whereIn('action', ['Processed', 'Issued'])
            ->orderBy('created_at', 'desc')
            ->get();
            
        return response()->json([
            'data' => $logs
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
        $qualityMetadataRaw = $request->input('quality_metadata');
        $qualityMetadata = null;
        if (is_string($qualityMetadataRaw) && $qualityMetadataRaw !== '') {
            $decoded = json_decode($qualityMetadataRaw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $qualityMetadata = $decoded;
            }
        }
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
            'file' => 'required|file|max:20480|mimes:pdf,png,jpg,jpeg,tiff,bmp,docx,doc,txt,webp,rtf', // 20MB max
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
        $qualityMetadataRaw = $request->input('quality_metadata');
        $qualityMetadata = null;
        if (is_string($qualityMetadataRaw) && $qualityMetadataRaw !== '') {
            $decoded = json_decode($qualityMetadataRaw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $qualityMetadata = $decoded;
            }
        }

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

        // Save file info metadata
        $fileInfo = json_encode([
            'originalName' => $originalName,
            'filename' => $filename,
            'size' => $file->getSize(),
            'mimetype' => $file->getMimeType(),
            'storedIn' => 'database',
            'quality' => $qualityMetadata
        ]);

        // Save to database using Query Builder (Safer for large BLOBs/binary data)
        $newId = DB::table('documents')->insertGetId([
            'name' => $originalName,
            'type' => $docType,
            'date' => date('m/d/Y'),
            'size' => $size,
            'status' => 'Pending',
            'previewData' => null,
            'personName' => $personName,
            'barangay' => $barangay,
            'metadata' => $fileInfo,
            'file_data' => $fileContent,
            'encoded_by' => $encodedBy,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Log history
        $this->logHistory($newId, 'Uploaded');

        // AUTO-DISPATCH OCR PROCESSING
        ProcessDocumentOcr::dispatch($newId, $docType)->onQueue('high');

        return response()->json([
            'success' => true,
            'id' => $newId,
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
        $status          = $request->input('status', 'Extracted');
        $parentalConsent = $request->input('parental_consent', false);
        $detectedType    = $request->input('detectedType');

        return $this->performSave($request, $id, $extractedFields, $ocrText, $personName, $barangay, $status, $parentalConsent, $detectedType);
    }

    /**
     * Fast-track approval of extracted data without the full modal
     */
    public function quickApprove(Request $request, $id)
    {
        $docData = DB::selectOne("SELECT * FROM documents WHERE id = ?", [$id]);
        if (!$docData) return response()->json(['error' => 'Document not found'], 404);
        
        $fields = json_decode($docData->extracted_fields, true) ?? [];
        $barangay = $fields['barangay'] ?? '';
        $detectedType = $docData->detected_type ?: $docData->type;
        
        // Build personName from split fields
        $personName = $this->buildFullName($fields, $detectedType) ?: $docData->name;
        
        return $this->performSave($request, $id, $fields, $docData->ocr_text, $personName, $barangay, 'Processed', false, $detectedType);
    }

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

    /**
     * Shared logic for saving/approving a document
     */
    private function performSave($request, $id, $extractedFields, $ocrText, $personName, $barangay, $status, $parentalConsent, $detectedType = null)
    {
        // Re-calculate personName if it wasn't explicitly provided (safety for the main update call)
        if (empty($personName)) {
            $personName = $this->buildFullName($extractedFields, $detectedType);
        }

        return DB::transaction(function () use ($request, $id, $extractedFields, $ocrText, $personName, $barangay, $status, $parentalConsent, $detectedType) {
            try {
            // Get current user encoded_by logic based on custom session setup
            $userId = $request->session()->get('user_id');
            $user = $userId ? \App\Models\User::find($userId) : null;
            $encodedBy = $user ? $user->name : 'System';

            DB::update(
                "UPDATE documents SET extracted_fields = ?, ocr_text = ?, personName = ?, barangay = ?, status = ?, parental_consent = ?, encoded_by = ?, detected_type = ? WHERE id = ?",
                [
                    json_encode($extractedFields, JSON_UNESCAPED_UNICODE),
                    $ocrText,
                    $personName,
                    $barangay,
                    $status,
                    $parentalConsent ? 1 : 0,
                    $encodedBy,
                    $detectedType,
                    $id,
                ]
            );

            // --- Automatically inject or UPDATE in Issuances (Master Registry) if Processed or Issued ---
            if ($status === 'Processed' || $status === 'Issued') {
                // 1. Check if a Master Record already exists for this document
                $existing = DB::select("SELECT id, certNumber FROM issuances WHERE document_id = ?", [$id]);
                
                $doc = DB::select("SELECT * FROM documents WHERE id = ?", [$id]);
                if (count($doc) > 0) {
                    $docType = $doc[0]->detected_type ?: $doc[0]->type;
                    
                    // Generate PDF (using full OCR text as primary output)
                    $pdf = app('dompdf.wrapper');
                    $pdf->setPaper('a4', 'portrait');
                    $pdf->loadView('pdf.ocr_report', [
                        'doc' => $doc[0], 
                        'fields' => $extractedFields,
                        'ocr_text' => $ocrText ?: $doc[0]->ocr_text
                    ]);
                    $pdfData = $pdf->output();

                    if (count($existing) > 0) {
                        // 2. UPDATE existing Master Record (Keep certNumber)
                        DB::table('issuances')->where('document_id', $id)->update([
                            'type' => $docType,
                            'name' => $personName,
                            'barangay' => $barangay,
                            'status' => 'Active',
                            'encoded_by' => $encodedBy,
                            'extracted_data' => json_encode($extractedFields, JSON_UNESCAPED_UNICODE),
                            'file_data' => $pdfData,
                            'updated_at' => now()
                        ]);
                    } else {
                        // 3. INSERT new Master Record (Generate NEW certNumber)
                        $prefix = ($docType === 'death') ? 'DC' : (($docType === 'marriage' || $docType === 'marriage_license') ? 'ML' : 'BC');
                        $year = date('Y');
                        
                        $pattern = $prefix . '-' . $year . '-%';
                        $results = DB::select("SELECT certNumber FROM issuances WHERE certNumber LIKE ? ORDER BY certNumber DESC LIMIT 1", [$pattern]);
                        
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

                        DB::table('issuances')->insert([
                            'certNumber' => $certNumber,
                            'type' => $docType,
                            'name' => $personName,
                            'barangay' => $barangay,
                            'issuanceDate' => $issuanceDate,
                            'status' => 'Active',
                            'encoded_by' => $encodedBy,
                            'document_id' => $id,
                            'extracted_data' => json_encode($extractedFields, JSON_UNESCAPED_UNICODE),
                            'file_data' => $pdfData,
                            'created_at' => now(),
                            'updated_at' => now()
                        ]);
                    }
                }
            }

            $this->logHistory($id, $status, [
                'person_name' => $personName,
                'barangay' => $barangay,
                'type' => $detectedType
            ]);

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            DB::rollBack();
            // Use mb_convert_encoding to ensure the error message is safe for JSON/Logging
            // We EXPLICITLY do NOT log the trace here because it may contain binary PDF data
            $safeError = mb_convert_encoding($e->getMessage(), 'UTF-8', 'UTF-8');
            \Log::error("Document Save/Approve Error: " . $safeError . " on line " . $e->getLine() . " in " . $e->getFile());
            
            return response()->json([
                'success' => false, 
                'error' => 'System sync failure: ' . $safeError
            ], 500);
        }
    });
}

    /**
     * Delete document
     */
    public function destroy($id)
    {
        // Log deletion before soft-deleting
        $this->logHistory($id, 'Deleted');

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
    /**
     * Download the document (as attachment)
     */
    public function download($id)
    {
        return $this->serveDocument($id, 'attachment');
    }

    /**
     * View the document (inline)
     */
    public function view($id)
    {
        return $this->serveDocument($id, 'inline');
    }

    /**
     * Shared logic for serving document content
     */
    private function serveDocument($id, $disposition = 'inline')
    {
        $request = request();
        $documents = DB::select("SELECT * FROM documents WHERE id = ?", [$id]);

        if (count($documents) === 0) {
            return response()->json(['error' => 'Document not found'], 404);
        }

        $doc = $documents[0];
        $metadata = json_decode($doc->metadata, true);
        $status = strtolower($doc->status ?? 'pending');
        
        // --- If extracted or processed, generate a PDF preview with the text ---
        // UNLESS we explicitly ask for the 'raw' original file
        if (!$request->has('raw') && ($status === 'extracted' || $status === 'processed' || $status === 'active')) {
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
                ->header('Content-Disposition', $disposition . '; filename="preview-' . $id . '.pdf"');
        }

        // Return the raw upload with binary safety
        $fileContent = $doc->file_data;
        if (empty($fileContent)) {
            \Log::error("File data missing for document ID: " . $id);
            return response()->json(['error' => 'File content not found'], 404);
        }

        // Clean output buffers to ensure binary safety
        if (ob_get_length()) ob_end_clean();

        $mimetype = $metadata['mimetype'] ?? null;
        if (!$mimetype) {
            $ext = pathinfo($metadata['originalName'] ?? 'file.png', PATHINFO_EXTENSION);
            $mimetype = match(strtolower($ext)) {
                'png' => 'image/png', 'jpg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp',
                'gif' => 'image/gif', 'pdf' => 'application/pdf', default => 'application/octet-stream'
            };
        }

        // Use a binary response with correct length
        return response($fileContent)
            ->header('Content-Type', $mimetype)
            ->header('Content-Disposition', $disposition . '; filename="' . ($metadata['originalName'] ?? 'document') . '"');
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

    /**
     * Helper to log document activity persistently
     */
    private function logHistory($id, $action, $overrides = [])
    {
        try {
            // Select ONLY non-binary columns to prevent UTF-8 encoding issues in logs/exceptions
            $doc = DB::selectOne("SELECT id, name, personName, type, detected_type, barangay, encoded_by FROM documents WHERE id = ?", [$id]);
            if (!$doc) return;

            $userId = request()->session()->get('user_id');
            $user = $userId ? \App\Models\User::find($userId) : null;
            $encodedBy = $user ? $user->name : ($doc->encoded_by ?? 'System');

            $data = [
                'filename'    => $overrides['filename'] ?? $doc->name,
                'person_name' => $overrides['person_name'] ?? $doc->personName,
                'type'        => $overrides['type'] ?? ($doc->detected_type ?: $doc->type),
                'barangay'    => $overrides['barangay'] ?? $doc->barangay,
                'encoded_by'  => $encodedBy,
                'details'     => json_encode($overrides['details'] ?? []),
                'updated_at'  => now()
            ];

            // Check if this action for this document already exists to prevent duplication
            $exists = DB::table('document_history_logs')
                ->where('document_id', $id)
                ->where('action', $action)
                ->first();

            if ($exists) {
                DB::table('document_history_logs')
                    ->where('id', $exists->id)
                    ->update($data);
            } else {
                $data['document_id'] = $id;
                $data['action']      = $action;
                $data['created_at']  = now();
                DB::table('document_history_logs')->insert($data);
            }
        } catch (\Exception $e) {
            \Log::error("Failed to log document history: " . $e->getMessage());
        }
    }
}
