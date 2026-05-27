<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Bus;
use App\Models\Document;
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
        
        // Get paginated results without loading binary content.
        $query = "SELECT id, name, type, date, size, status, personName, barangay, metadata, ocr_text, extracted_fields, detected_type, created_at, updated_at, encoded_by, file_path 
                  FROM documents" . $whereClause . " ORDER BY id DESC LIMIT ? OFFSET ?";
        $params[] = $perPage;
        $params[] = ($page - 1) * $perPage;
        
        $documents = DB::select($query, $params);
        
        // Enhance documents with real-time batch progress and duplicate detection
        foreach ($documents as $doc) {
            $metadata = json_decode($doc->metadata, true) ?: [];
            $doc->has_duplicate = !empty($metadata['has_duplicate']);
            $status = strtolower($doc->status ?? '');
            if ($status === 'processing' || $status === 'pending') {
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
            } elseif ($status === 'extracted' || $status === 'checking') {
                if ($doc->has_duplicate) {
                    // Skip redundant query if metadata already flagged it
                } else {
                    // Check if similar records already exist in the issuances table
                    $fields = json_decode($doc->extracted_fields, true) ?: [];
                    $type = $doc->detected_type ?: $doc->type;
                    if ($type === 'marriage_license') {
                        $type = 'marriage';
                    }

                    $dupQuery = DB::table('issuances')
                        ->where('type', $type)
                    ->where('document_id', '!=', $doc->id)
                    ->whereNull('deleted_at');

                    if ($type === 'birth' || $type === 'death') {
                        $firstName = trim($fields['first_name'] ?? '');
                        $lastName = trim($fields['last_name'] ?? '');
                        if (!empty($firstName) && !empty($lastName)) {
                            $dupQuery->where('name', 'like', "%{$lastName}%")
                                     ->where('name', 'like', "%{$firstName}%");
                            if ($dupQuery->exists()) {
                                $doc->has_duplicate = true;
                            }
                        }
                    } elseif ($type === 'marriage') {
                        $hLastName = trim($fields['husband_last_name'] ?? '');
                        $wLastName = trim($fields['wife_last_name'] ?? '');
                        if (!empty($hLastName) || !empty($wLastName)) {
                            if (!empty($hLastName)) {
                                $dupQuery->where('name', 'like', "%{$hLastName}%");
                            }
                            if (!empty($wLastName)) {
                                $dupQuery->where('name', 'like', "%{$wLastName}%");
                            }
                            if ($dupQuery->exists()) {
                                $doc->has_duplicate = true;
                            }
                        }
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

    public function bulkProcess(Request $request) 
    {
        // 1. Make sure we actually received an array of IDs
        $request->validate([
            'document_ids' => 'required|array',
            'document_ids.*' => 'integer|exists:documents,id' // Make sure they exist in the DB!
        ]);

        $queuedCount = 0;

        // 2. Loop through each ID and dispatch the background job if it is not already queued
        foreach ($request->document_ids as $id) {
            DB::transaction(function () use ($id, &$queuedCount) {
                $doc = DB::table('documents')->where('id', $id)->lockForUpdate()->first();
                if (!$doc) {
                    return;
                }

                $status = strtolower($doc->status ?? '');
                if (in_array($status, ['pending', 'processing'], true)) {
                    return;
                }

                DB::table('documents')->where('id', $id)->update([
                    'status' => 'Pending',
                    'updated_at' => now(),
                ]);

                ProcessDocumentOcr::dispatch($id, $doc->type)->onQueue('low');
                $queuedCount++;
            });
        }

        // 3. Return success instantly
        return response()->json([
            'success' => true, 
            'queued_count' => $queuedCount
        ]);
    }

    public function toggleOcr(Request $request, $id)
    {
        $doc = DB::table('documents')->where('id', $id)->first();
        if (!$doc) {
            return response()->json(['success' => false, 'error' => 'Document not found'], 404);
        }

        $status = strtolower($doc->status ?? '');

        if (in_array($status, ['pending', 'processing'])) {
            // Stop it
            DB::table('documents')->where('id', $id)->update([
                'status' => 'Stopped',
                'updated_at' => now(),
            ]);
            
            // Cancel batch if it exists
            $metadata = json_decode($doc->metadata, true);
            if (isset($metadata['batch_id'])) {
                $batch = Bus::findBatch($metadata['batch_id']);
                if ($batch) {
                    $batch->cancel();
                }
            }
            return response()->json(['success' => true, 'new_status' => 'Stopped']);
        } else {
            // Retry / Resume
            DB::table('documents')->where('id', $id)->update([
                'status' => 'Pending',
                'updated_at' => now(),
            ]);
            ProcessDocumentOcr::dispatch($id, $doc->type)->onQueue('low');
            return response()->json(['success' => true, 'new_status' => 'Pending']);
        }
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
        // 1. Validate the file exists
        $request->validate([
            'document' => 'required|file|mimes:pdf,png,jpg,jpeg|max:10240', // max 10MB
        ]);

        $this->validateUploadedFile($request->file('document'));
        // 2. Permanently save the file to storage/app/public/documents (public disk)
        $path = $request->file('document')->store('documents', 'public');

        // 3. Create the database record immediately
        $document = Document::create([
            'file_name' => $request->file('document')->getClientOriginalName(),
            'file_path' => $path,
            'status' => 'pending',
            'raw_text' => null,
            'extracted_data' => null
        ]);

        // 4. Pass the database record to the background worker
        ProcessDocumentOcr::dispatch($document->id, 'Uncategorized')->onQueue('low');

        // 5. Return success instantly to the React frontend
        return response()->json([
            'success' => true, 
            'message' => 'Upload successful. Processing in background...',
            'document_id' => $document->id
        ]);
    }

    /**
     * Upload file - saves to disk and processes OCR
     * 
     * Workflow:
     * 1. Save file to storage/app/public/documents with unique name
     * 2. Send file to OCR server at http://localhost:8000/process
     * 3. Store raw OCR text and extracted fields in database
     * 4. Dynamically rename file based on OCR results
     * 5. Queue async job for post-processing
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
        $this->validateUploadedFile($file);

        // Enforce Daily Scan Limit (Token budget manager check) on upload
        $dailyLimit = (int) env('DAILY_SCAN_LIMIT', 500);
        $todayDate = date('Y-m-d');
        $todayScans = DB::table('documents')
            ->whereIn('status', ['extracted', 'Processed', 'Issued'])
            ->whereDate('updated_at', $todayDate)
            ->count();

        if ($todayScans >= $dailyLimit) {
            return response()->json([
                'success' => false,
                'error' => 'Daily paid API scan limit reached (' . $dailyLimit . '). Please contact your administrator.'
            ], 400);
        }

        $docType = $request->input('docType', 'Uncategorized');
        $personName = $request->input('personName', '');
        $barangay = $request->input('barangay', '');
        
        // Resolve uploader name from session
        $userId = $request->session()->get('user_id');
        $user = $userId ? \App\Models\User::find($userId) : null;
        $encodedBy = $user ? $user->name : 'System';

        // Generate unique filename and size
        $originalName = $file->getClientOriginalName();
        $extension = $file->getClientOriginalExtension();
        $tempFilename = 'doc-' . time() . '-' . rand(100000000, 999999999) . '.' . $extension;
        $size = number_format($file->getSize() / (1024 * 1024), 2) . ' MB';

        try {
            // STEP 1: Save file to a non-public disk instantly
            $filePath = $this->saveDocumentFile($file, $tempFilename);
            \Log::info("File saved to disk instantly: {$filePath}");

            // STEP 2: Save initial record to database as PENDING (No OCR wait!)
            $newId = DB::table('documents')->insertGetId([
                'name' => $originalName,
                'type' => $docType,
                'date' => date('m/d/Y'),
                'size' => $size,
                'status' => 'Pending', // <--- IMPORTANT: Starts as pending
                'personName' => $personName,
                'barangay' => $barangay,
                'file_path' => $filePath, 
                'encoded_by' => $encodedBy,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // STEP 3: Log history
            $this->logHistory($newId, 'Uploaded');

            // STEP 4: Hand off to the Background Queue to do the OCR later!
            ProcessDocumentOcr::dispatch($newId, $docType)->onQueue('low');

            // STEP 5: Return to React INSTANTLY (< 500ms)
            return response()->json([
                'success' => true,
                'message' => 'Upload successful. Processing in background...',
                'id' => $newId,
                'filename' => basename($filePath),
                'originalName' => $originalName,
                'size' => $size,
                'status' => 'Pending'
            ]);

        } catch (\Exception $e) {
            \Log::error("Document upload failed: " . $e->getMessage());
            
            if (isset($filePath) && \Storage::disk('public')->exists($filePath)) {
                \Storage::disk('public')->delete($filePath);
            }

            return response()->json([
                'success' => false,
                'error' => 'Upload failed: ' . $e->getMessage()
            ], 500);
        }
    }

    private function validateUploadedFile($file)
    {
        $allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp', 'docx', 'doc', 'txt', 'webp', 'rtf'];
        $extension = strtolower($file->getClientOriginalExtension());

        if (!in_array($extension, $allowedExtensions, true)) {
            abort(400, 'Unsupported file type.');
        }

        $path = $file->getRealPath();
        if (!$path || !file_exists($path) || filesize($path) === 0) {
            abort(400, 'Uploaded file is empty or invalid.');
        }

        $magic = file_get_contents($path, false, null, 0, 16);
        $isValid = match ($extension) {
            'pdf' => str_starts_with($magic, '%PDF-'),
            'png' => str_starts_with($magic, "\x89PNG\r\n\x1a\n"),
            'jpg', 'jpeg' => substr($magic, 0, 2) === "\xFF\xD8",
            'webp' => substr($magic, 0, 4) === 'RIFF' && substr($magic, 8, 4) === 'WEBP',
            'tiff' => in_array(substr($magic, 0, 4), ["II*\x00", "MM\x00*"], true),
            'bmp' => substr($magic, 0, 2) === 'BM',
            'docx' => substr($magic, 0, 4) === 'PK\x03\x04',
            'doc' => substr($magic, 0, 8) === "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1",
            'txt', 'rtf' => true,
            default => false,
        };

        if (!$isValid) {
            abort(400, 'File content does not match the allowed type.');
        }

        return true;
    }

    /**
     * Save uploaded file to storage/app/public/documents on the public disk
     * 
     * @param \Illuminate\Http\UploadedFile $file
     * @param string $filename
     * @return string Path to saved file
     */
    private function saveDocumentFile($file, $filename)
    {
        $path = $file->storeAs(
            'documents',
            $filename,
            'public'
        );

        if (!$path) {
            throw new \Exception("Failed to save file to disk");
        }

        return $path;
    }

    /**
     * Send file to local OCR server and extract text + fields
     * 
     * Sends POST request to http://localhost:8000/process with file attachment
     * Uses multipart/form-data for file transfer
     * 
     * Expected OCR server response format:
     * {
     *     "raw_text": "Full extracted OCR text",
     *     "extracted_fields": {
     *         "first_name": "...",
     *         "last_name": "...",
     *         "date_of_birth": "..."
     *     },
     *     "detected_type": "birth|death|marriage"
     * }
     * 
     * @param string $filePath Path to file in storage
     * @return array OCR result containing raw_text, extracted_fields, detected_type
     */
    private function processDocumentOcr($filePath)
    {
        try {
            $fullPath = \Storage::disk('public')->path($filePath);
            
            if (!file_exists($fullPath)) {
                throw new \Exception("File not found at: {$fullPath}");
            }

            \Log::info("Sending file to OCR server: {$fullPath}");

            // Create multipart request with actual file
            $fileHandle = fopen($fullPath, 'r');
            
            // Send file to OCR server using Http::attach() for multipart form data
            $response = \Illuminate\Support\Facades\Http::retry(3, 1000)
                ->timeout(300)
                ->attach(
                    'file',
                    $fileHandle,
                    basename($fullPath)
                )
                ->post('http://localhost:8080/process');

            fclose($fileHandle);

            if ($response->failed()) {
                \Log::error("OCR server returned error: " . $response->status() . " - " . $response->body());
                throw new \Exception("OCR server error: " . $response->status());
            }

            $ocrData = $response->json();

            if (!isset($ocrData['raw_text'])) {
                \Log::warning("OCR response missing raw_text: " . json_encode($ocrData));
                // Return graceful fallback
                return [
                    'raw_text' => '',
                    'extracted_fields' => $ocrData['extracted_fields'] ?? [],
                    'detected_type' => $ocrData['detected_type'] ?? 'unknown',
                ];
            }

            \Log::info("OCR processing successful, extracted " . strlen($ocrData['raw_text']) . " characters");

            return [
                'raw_text' => $ocrData['raw_text'] ?? '',
                'extracted_fields' => $ocrData['extracted_fields'] ?? [],
                'detected_type' => $ocrData['detected_type'] ?? 'unknown',
            ];

        } catch (\Exception $e) {
            \Log::error("OCR processing error: " . $e->getMessage());
            
            // Return graceful fallback - don't fail the upload
            return [
                'raw_text' => '',
                'extracted_fields' => [],
                'detected_type' => 'unknown',
            ];
        }
    }

    /**
     * Dynamically rename file based on OCR extracted data
     * 
     * Pattern: [DOC_TYPE]_[LAST_NAME]_[FIRST_NAME]_[TIMESTAMP].ext
     * Example: BIRTH_SANTOS_JUAN_20260409120000.pdf
     * 
     * @param int $documentId
     * @param string $currentPath Current file path
     * @param array $extractedData Extracted OCR data
     * @param string $detectedType Document type
     * @return string New file path
     */
    private function renameDocumentFile($documentId, $currentPath, $extractedData, $detectedType)
    {
        try {
            if (!$extractedData || count($extractedData) === 0) {
                \Log::info("No extracted data to rename file: {$documentId}");
                return $currentPath;
            }

            // Extract relevant name fields based on document type
            $lastName = '';
            $firstName = '';

            if ($detectedType === 'marriage' || $detectedType === 'marriage_license') {
                $lastName = $extractedData['husband_last_name'] ?? $extractedData['wife_last_name'] ?? '';
                $firstName = $extractedData['husband_first_name'] ?? $extractedData['wife_first_name'] ?? '';
            } else {
                // Birth, Death, or other
                $lastName = $extractedData['last_name'] ?? '';
                $firstName = $extractedData['first_name'] ?? '';
            }

            // Sanitize names (remove special characters, spaces)
            $lastName = preg_replace('/[^a-zA-Z0-9]/', '', $lastName);
            $firstName = preg_replace('/[^a-zA-Z0-9]/', '', $firstName);

            // If we don't have names, use the document ID instead
            if (empty($lastName) && empty($firstName)) {
                \Log::info("No names extracted, keeping original filename");
                return $currentPath;
            }

            // Build new filename: [TYPE]_[LASTNAME]_[FIRSTNAME]_[DOCID].[ext]
            $extension = pathinfo($currentPath, PATHINFO_EXTENSION);
            $typePrefix = strtoupper($detectedType);
            $timestamp = date('YmdHis');
            
            $newFilename = "{$typePrefix}_{$lastName}_{$firstName}_{$documentId}.{$extension}";
            $newPath = 'documents/' . $newFilename;

            // Rename in storage
            if (\Storage::disk('public')->exists($currentPath)) {
                \Storage::disk('public')->move($currentPath, $newPath);
                \Log::info("File renamed: {$currentPath} -> {$newPath}");
                return $newPath;
            } else {
                \Log::warning("Cannot rename: source file not found at {$currentPath}");
                return $currentPath;
            }

        } catch (\Exception $e) {
            \Log::error("File rename failed: " . $e->getMessage());
            // Don't fail the whole upload if rename fails
            return $currentPath;
        }
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

        // Normalize date parts (day, year) to integers if they look numeric
        if (is_array($extractedFields)) {
            foreach (['dob_day', 'dob_year', 'marriage_parents_day', 'marriage_parents_year', 'death_day', 'death_year'] as $dateKey) {
                if (isset($extractedFields[$dateKey]) && is_string($extractedFields[$dateKey])) {
                    $cleaned = preg_replace('/[^0-9]/', '', $extractedFields[$dateKey]);
                    if ($cleaned !== '') {
                        $extractedFields[$dateKey] = (int)$cleaned;
                    }
                }
            }
        }

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
        
        if ($detectedType === 'marriage_license') {
            $detectedType = 'marriage';
        }

        // Duplicate registry validation check
        $dupQuery = DB::table('issuances')
            ->where('type', $detectedType)
            ->where('document_id', '!=', $id)
            ->whereNull('deleted_at');

        $hasDuplicate = false;
        if ($detectedType === 'birth' || $detectedType === 'death') {
            $firstName = trim($fields['first_name'] ?? '');
            $lastName = trim($fields['last_name'] ?? '');
            if (!empty($firstName) && !empty($lastName)) {
                $dupQuery->where('name', 'like', "%{$lastName}%")
                         ->where('name', 'like', "%{$firstName}%");
                if ($dupQuery->exists()) $hasDuplicate = true;
            }
        } elseif ($detectedType === 'marriage') {
            $hLastName = trim($fields['husband_last_name'] ?? '');
            $wLastName = trim($fields['wife_last_name'] ?? '');
            if (!empty($hLastName) || !empty($wLastName)) {
                if (!empty($hLastName)) $dupQuery->where('name', 'like', "%{$hLastName}%");
                if (!empty($wLastName)) $dupQuery->where('name', 'like', "%{$wLastName}%");
                if ($dupQuery->exists()) $hasDuplicate = true;
            }
        }

        if ($hasDuplicate) {
            return response()->json([
                'success' => false,
                'error' => 'Direct approval is blocked. This record has a potential duplicate in the Master Registry.'
            ], 422);
        }

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

                    // --- Logic Fix: Infer type from certNumber prefix if unknown ---
                    if (empty($docType) || strtolower($docType) === 'unknown') {
                        $p = strtoupper($prefix ?? '');
                        if (str_starts_with($p, 'BC')) $docType = 'birth';
                        elseif (str_starts_with($p, 'DC')) $docType = 'death';
                        elseif (str_starts_with($p, 'ML') || str_starts_with($p, 'MC')) $docType = 'marriage';
                    }
                    
                    // --- Dynamic Composite PDF Generation ---
                    $overlayFields = \App\Services\TemplateConfigService::getFieldsForType($docType);
                    
                    $pdf = app('dompdf.wrapper');
                    $pdf->setPaper('a4', 'portrait');
                    $pdf->loadView('pdf.composite_document', [
                        'doc' => $doc[0], 
                        'fields' => $extractedFields,
                        'overlayFields' => $overlayFields
                    ]);
                    $pdfData = $pdf->output();

                    // Save the PDF to disk instead of the database
                    $issuanceFilePath = 'issuances/' . $docType . '_' . $id . '_' . time() . '.pdf';
                    \Storage::disk('public')->put($issuanceFilePath, $pdfData);

                    $normCertType = 'birth';
                    if ($docType === 'death') {
                        $normCertType = 'death';
                    } elseif ($docType === 'marriage' || $docType === 'marriage_license') {
                        $normCertType = 'marriage';
                    }

                    if (count($existing) > 0) {
                        // 2. UPDATE existing Master Record (Keep certNumber)
                        DB::table('issuances')->where('document_id', $id)->update([
                            'type' => $docType,
                            'certificate_type' => $normCertType,
                            'name' => $personName,
                            'barangay' => $barangay,
                            'status' => 'Active',
                            'encoded_by' => $encodedBy,
                            'extracted_data' => json_encode($extractedFields, JSON_UNESCAPED_UNICODE),
                            'file_path' => $issuanceFilePath,
                            'updated_at' => now()
                        ]);
                    } else {
                        // 3. INSERT new Master Record (Generate NEW certNumber)
                        $prefix = ($docType === 'death') ? 'DC' : (($docType === 'marriage' || $docType === 'marriage_license') ? 'ML' : 'BC');
                        $year = date('Y');
                        
                        $results = DB::select("SELECT MAX(id) as max_id FROM issuances");
                        $nextNum = 1;
                        if (count($results) > 0 && $results[0]->max_id !== null) {
                            $nextNum = intval($results[0]->max_id) + 1;
                        }
                        
                        $certNumber = $prefix . '-' . $year . '-' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);
                        $issuanceDate = date('m/d/Y');

                        DB::table('issuances')->insert([
                            'certNumber' => $certNumber,
                            'type' => $docType,
                            'certificate_type' => $normCertType,
                            'name' => $personName,
                            'barangay' => $barangay,
                            'issuanceDate' => $issuanceDate,
                            'status' => 'Active',
                            'encoded_by' => $encodedBy,
                            'document_id' => $id,
                            'extracted_data' => json_encode($extractedFields, JSON_UNESCAPED_UNICODE),
                            'file_path' => $issuanceFilePath,
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
        $document = DB::table('documents')->where('id', $id)->first();
        if (!$document) {
            return response()->json(['success' => false, 'error' => 'Document not found'], 404);
        }

        DB::transaction(function () use ($id) {
            $this->logHistory($id, 'Deleted');

            DB::table('documents')->where('id', $id)->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('issuances')->where('document_id', $id)->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return response()->json(['success' => true]);
    }

    /**
     * Undo soft delete for document
     */
    public function undo($id)
    {
        $document = DB::table('documents')->where('id', $id)->first();
        if (!$document) {
            return response()->json(['success' => false, 'error' => 'Document not found'], 404);
        }

        DB::transaction(function () use ($id) {
            DB::table('documents')->where('id', $id)->update([
                'deleted_at' => null,
                'updated_at' => now(),
            ]);

            DB::table('issuances')->where('document_id', $id)->update([
                'deleted_at' => null,
                'updated_at' => now(),
            ]);
        });
        
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
        $metadata = json_decode($doc->metadata ?? '[]', true) ?: [];
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
        $mimetype = $metadata['mimetype'] ?? null;
        if (!$mimetype) {
            $ext = pathinfo($metadata['originalName'] ?? 'file.png', PATHINFO_EXTENSION);
            $mimetype = match(strtolower($ext)) {
                'png' => 'image/png', 'jpg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp',
                'gif' => 'image/gif', 'pdf' => 'application/pdf', default => 'application/octet-stream'
            };
        }

        if (empty($doc->file_path) || !\Storage::disk('public')->exists($doc->file_path)) {
            \Log::error("File path missing for document ID: " . $id);
            return response()->json(['error' => 'File content not found'], 404);
        }

        $fullPath = \Storage::disk('public')->path($doc->file_path);

        // If it's a PDF and we're asking for the raw preview, prefer generated page images.
        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
        if ($request->has('raw') && $ext === 'pdf') {
            $dir = dirname($fullPath);
            $base = pathinfo($fullPath, PATHINFO_FILENAME);

            $candidates = [
                $dir . '/' . $base . '_page_1_proc.jpg',
                $dir . '/' . $base . '_page_2_proc.jpg',
                $dir . '/' . $base . '_page_1.jpg',
                $dir . '/' . $base . '_page_2.jpg',
            ];

            foreach ($candidates as $candidate) {
                if (file_exists($candidate)) {
                    return response()->file($candidate, [
                        'Content-Type' => 'image/jpeg',
                        'Content-Disposition' => 'inline; filename="preview.jpg"'
                    ]);
                }
            }
        }

        return response()->file($fullPath, [
            'Content-Type' => $mimetype,
            'Content-Disposition' => $disposition . '; filename="' . ($metadata['originalName'] ?? $doc->name ?? 'document') . '"'
        ]);
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

    /**
     * Get soft-deleted documents (Archive Manager view)
     */
    public function archived(Request $request)
    {
        $page = (int) $request->query('page', 1);
        $perPage = min((int) $request->query('per_page', 20), 100);
        $type = $request->query('type', '');
        $search = $request->query('search', '');

        // Build query
        $whereClause = " WHERE deleted_at IS NOT NULL";
        $params = [];

        if (!empty($type) && $type !== 'all') {
            $whereClause .= " AND type = ?";
            $params[] = $type;
        }

        if (!empty($search)) {
            $whereClause .= " AND (name LIKE ? OR personName LIKE ? OR barangay LIKE ?)";
            $searchTerm = "%{$search}%";
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }

        // Get total count
        $countQuery = "SELECT COUNT(*) as total FROM documents" . $whereClause;
        $totalResult = DB::select($countQuery, $params);
        $total = $totalResult[0]->total;

        // Get paginated results
        $query = "SELECT id, name, type, date, size, status, personName, barangay, metadata, ocr_text, extracted_fields, detected_type, created_at, updated_at, encoded_by, deleted_at 
                  FROM documents" . $whereClause . " ORDER BY deleted_at DESC LIMIT ? OFFSET ?";
        
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
     * Permanently delete a document from the system (Purge)
     */
    public function purge(Request $request, $id)
    {
        $document = DB::table('documents')->where('id', $id)->first();
        
        if (!$document) {
            return response()->json(['success' => false, 'error' => 'Document not found'], 404);
        }

        return DB::transaction(function () use ($request, $id, $document) {
            // 1. Delete actual file from storage
            if (!empty($document->file_path)) {
                if (Storage::disk('public')->exists($document->file_path)) {
                    Storage::disk('public')->delete($document->file_path);
                }
            }

            // 2. Delete linked issuance files if applicable
            $issuances = DB::table('issuances')->where('document_id', $id)->get();
            foreach ($issuances as $iss) {
                if (!empty($iss->file_path)) {
                    if (Storage::disk('public')->exists($iss->file_path)) {
                        Storage::disk('public')->delete($iss->file_path);
                    }
                }
            }

            // 3. Log history of purge
            $this->logHistory($id, 'Purged', [
                'filename' => $document->name,
                'person_name' => $document->personName,
                'type' => $document->detected_type ?: $document->type,
                'barangay' => $document->barangay
            ]);

            // 4. Delete DB records
            DB::table('documents')->where('id', $id)->delete();
            DB::table('issuances')->where('document_id', $id)->delete();
            DB::table('document_ocr_pages')->where('document_id', $id)->delete();

            return response()->json(['success' => true]);
        });
    }

    /**
     * POST /api/documents/{id}/check-duplicate
     * Check if similar fields exist in the Master Registry (issuances table).
     */
    public function checkDuplicate(Request $request, $id)
    {
        $type = $request->input('type');
        $fields = $request->input('fields', []);

        if (empty($type) || empty($fields)) {
            return response()->json([
                'success' => true,
                'duplicate' => false,
                'candidate' => null
            ]);
        }

        // Normalize matching type to match standard issuances types
        $normType = $type;
        if ($type === 'marriage_license') {
            $normType = 'marriage';
        }

        // We look for duplicate records in issuances table
        $query = DB::table('issuances')
            ->where('type', $normType)
            ->whereNull('deleted_at');

        // Let's filter candidates based on matching criteria depending on type:
        if ($normType === 'birth') {
            $firstName = trim($fields['first_name'] ?? '');
            $lastName = trim($fields['last_name'] ?? '');
            
            if (empty($firstName) && empty($lastName)) {
                return response()->json(['success' => true, 'duplicate' => false, 'candidate' => null]);
            }

            $query->where(function ($q) use ($firstName, $lastName) {
                if (!empty($firstName) && !empty($lastName)) {
                    $q->where('name', 'like', "%{$lastName}%")
                      ->where('name', 'like', "%{$firstName}%");
                }
            });
        } elseif ($normType === 'death') {
            $firstName = trim($fields['first_name'] ?? '');
            $lastName = trim($fields['last_name'] ?? '');

            if (empty($firstName) && empty($lastName)) {
                return response()->json(['success' => true, 'duplicate' => false, 'candidate' => null]);
            }

            $query->where(function ($q) use ($firstName, $lastName) {
                if (!empty($firstName) && !empty($lastName)) {
                    $q->where('name', 'like', "%{$lastName}%")
                      ->where('name', 'like', "%{$firstName}%");
                }
            });
        } elseif ($normType === 'marriage') {
            $hFirstName = trim($fields['husband_first_name'] ?? '');
            $hLastName = trim($fields['husband_last_name'] ?? '');
            $wFirstName = trim($fields['wife_first_name'] ?? '');
            $wLastName = trim($fields['wife_last_name'] ?? '');

            if (empty($hFirstName) && empty($hLastName) && empty($wFirstName) && empty($wLastName)) {
                return response()->json(['success' => true, 'duplicate' => false, 'candidate' => null]);
            }

            $query->where(function ($q) use ($hFirstName, $hLastName, $wFirstName, $wLastName) {
                if (!empty($hLastName)) {
                    $q->where('name', 'like', "%{$hLastName}%");
                }
                if (!empty($wLastName)) {
                    $q->where('name', 'like', "%{$wLastName}%");
                }
            });
        }

        // Get matching candidates (exclude the issuance representing this document itself if it exists)
        $query->where('document_id', '!=', $id);

        $candidate = $query->first();

        if ($candidate) {
            return response()->json([
                'success' => true,
                'duplicate' => true,
                'candidate' => [
                    'id' => $candidate->id,
                    'certNumber' => $candidate->certNumber,
                    'type' => $candidate->type,
                    'name' => $candidate->name,
                    'barangay' => $candidate->barangay,
                    'issuanceDate' => $candidate->issuanceDate,
                    'encoded_by' => $candidate->encoded_by,
                    'extracted_fields' => json_decode($candidate->extracted_data, true) ?: []
                ]
            ]);
        }

        return response()->json([
            'success' => true,
            'duplicate' => false,
            'candidate' => null
        ]);
    }

    /**
     * POST /api/documents/manual
     * Create a manual document record without any file upload.
     */
    public function storeManual(Request $request)
    {
        $request->validate([
            'type' => 'required|string|in:birth,death,marriage,marriage_license',
            'extracted_fields' => 'required|array',
            'parental_consent' => 'nullable|boolean'
        ]);

        $userId = $request->session()->get('user_id');
        $user = $userId ? \App\Models\User::find($userId) : null;
        $encodedBy = $user ? $user->name : 'System';

        $docType = $request->input('type');
        $extractedFields = $request->input('extracted_fields', []);
        $parentalConsent = $request->input('parental_consent', false);
        
        $normType = $docType;
        if ($docType === 'marriage_license') {
            $normType = 'marriage';
        }

        // Duplicate Check
        $dupQuery = DB::table('issuances')
            ->where('type', $normType)
            ->whereNull('deleted_at');

        $hasDuplicate = false;
        if ($normType === 'birth' || $normType === 'death') {
            $firstName = trim($extractedFields['first_name'] ?? '');
            $lastName = trim($extractedFields['last_name'] ?? '');
            if (!empty($firstName) && !empty($lastName)) {
                $dupQuery->where('name', 'like', "%{$lastName}%")
                         ->where('name', 'like', "%{$firstName}%");
                if ($dupQuery->exists()) $hasDuplicate = true;
            }
        } elseif ($normType === 'marriage') {
            $hLastName = trim($extractedFields['husband_last_name'] ?? '');
            $wLastName = trim($extractedFields['wife_last_name'] ?? '');
            if (!empty($hLastName) || !empty($wLastName)) {
                if (!empty($hLastName)) $dupQuery->where('name', 'like', "%{$hLastName}%");
                if (!empty($wLastName)) $dupQuery->where('name', 'like', "%{$wLastName}%");
                if ($dupQuery->exists()) $hasDuplicate = true;
            }
        }

        if ($hasDuplicate) {
            return response()->json([
                'success' => false,
                'error' => 'A record with this name already exists in the Master Registry. Direct creation is blocked.'
            ], 422);
        }

        // Build personName
        $personName = $this->buildFullName($extractedFields, $normType);
        $barangay = $extractedFields['barangay'] ?? '';
        $name = 'Manual Entry - ' . date('m/d/Y H:i');

        // Create document record with Processed status directly (so it never appears in the queue)
        $newId = DB::table('documents')->insertGetId([
            'name' => $name,
            'type' => $docType,
            'date' => date('m/d/Y'),
            'size' => '0 KB',
            'status' => 'Processed',
            'personName' => $personName,
            'barangay' => $barangay,
            'file_path' => null, 
            'encoded_by' => $encodedBy,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // This method does dynamic template compilation and handles Master registry insert
        return $this->performSave($request, $newId, $extractedFields, '', $personName, $barangay, 'Processed', $parentalConsent, $docType);
    }
}

