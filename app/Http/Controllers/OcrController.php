<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class OcrController extends Controller
{
    /**
     * Process OCR on a document stored in the database.
     * POST /api/ocr/process
     *
     * Body params:
     *   documentId  int     required
     *   docType     string  optional  (birth|death|marriage)
     */
    public function process(Request $request)
    {
        $documentId = $request->input('documentId');
        $docType    = strtolower(trim($request->input('docType', '')));
        $languages  = $request->input('languages', 'en,tl');

        if (!$documentId) {
            return response()->json(['success' => false, 'error' => 'documentId is required'], 400);
        }

        // ── Fetch document from DB ───────────────────────────────────────────
        $documents = DB::select("SELECT * FROM documents WHERE id = ?", [$documentId]);
        if (count($documents) === 0) {
            return response()->json(['success' => false, 'error' => 'Document not found'], 404);
        }

        $doc         = $documents[0];
        $fileContent = $doc->file_data;

        if (empty($fileContent)) {
            return response()->json(['success' => false, 'error' => 'File content not found in database'], 404);
        }

        // ── Determine extension ──────────────────────────────────────────────
        $metadata  = json_decode($doc->metadata, true);
        $mimetype  = $metadata['mimetype'] ?? 'image/jpeg';

        $extension = 'jpg';
        if (str_contains($mimetype, 'pdf'))  $extension = 'pdf';
        elseif (str_contains($mimetype, 'png'))  $extension = 'png';
        elseif (str_contains($mimetype, 'tiff')) $extension = 'tiff';
        elseif (str_contains($mimetype, 'bmp'))  $extension = 'bmp';

        // ── Write to temp file ───────────────────────────────────────────────
        $tempDir  = sys_get_temp_dir();
        $tempFile = $tempDir . DIRECTORY_SEPARATOR . 'ocr_' . $documentId . '_' . time() . '.' . $extension;

        if (file_put_contents($tempFile, $fileContent) === false) {
            return response()->json(['success' => false, 'error' => 'Could not write temp file for OCR'], 500);
        }

        try {
            // ── Build command as array (Windows-safe, no shell escaping issues) ──
            $ocrScript = base_path('ocr_processor.py');
            $pythonBin = PHP_OS_FAMILY === 'Windows' ? 'python' : 'python3';

            $cmdParts = [
                $pythonBin,
                $ocrScript,
                $tempFile,
                '--lang',     $languages,
                '--type',     'auto',
                '--doc_type', $docType,
            ];

            Log::info('OCR command: ' . implode(' ', $cmdParts));

            // Build shell command manually (cross-platform safe)
            $cmd = $pythonBin
                . ' "' . addslashes($ocrScript) . '"'
                . ' "' . addslashes($tempFile)  . '"'
                . ' --lang '     . escapeshellarg($languages)
                . ' --type auto'
                . ' --doc_type ' . escapeshellarg($docType ?: 'birth');

            Log::info('OCR shell command: ' . $cmd);

            // Use proc_open for Windows compatibility
            $descriptors = [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
            ];

            $process = proc_open($cmd, $descriptors, $pipes);

            if (!is_resource($process)) {
                return response()->json([
                    'success' => false,
                    'error'   => 'Failed to start Python process. Make sure python is installed and in PATH.',
                ], 500);
            }

            fclose($pipes[0]);

            // Read stdout and stderr with 180s timeout
            $stdout  = '';
            $stderr  = '';
            $timeout = 180;
            $start   = time();

            stream_set_blocking($pipes[1], false);
            stream_set_blocking($pipes[2], false);

            while (true) {
                $chunk = fread($pipes[1], 8192);
                if ($chunk !== false) $stdout .= $chunk;

                $errChunk = fread($pipes[2], 8192);
                if ($errChunk !== false) $stderr .= $errChunk;

                $status = proc_get_status($process);
                if (!$status['running']) break;

                if ((time() - $start) >= $timeout) {
                    proc_terminate($process);
                    return response()->json([
                        'success' => false,
                        'error'   => 'OCR processing timed out after ' . $timeout . ' seconds.',
                        'stderr'  => $stderr,
                    ], 500);
                }

                usleep(200000); // 200ms
            }

            // Read any remaining output
            $stdout .= stream_get_contents($pipes[1]);
            $stderr .= stream_get_contents($pipes[2]);

            fclose($pipes[1]);
            fclose($pipes[2]);

            $exitCode = proc_close($process);

            Log::info('OCR exit code: ' . $exitCode);
            Log::info('OCR stderr: ' . substr($stderr, 0, 500));
            Log::info('OCR stdout: ' . substr($stdout, 0, 1000));

            $stdout = trim($stdout);

            if ($exitCode !== 0 || empty($stdout)) {
                return response()->json([
                    'success' => false,
                    'error'   => 'OCR processing failed (exit code: ' . $exitCode . ')',
                    'details' => $stderr,
                ], 500);
            }

            // ── Try to parse the last JSON line from stdout ──────────────────
            // (EasyOCR may print progress msgs before the JSON)
            $jsonLine = null;
            foreach (array_reverse(explode("\n", $stdout)) as $line) {
                $line = trim($line);
                if (str_starts_with($line, '{')) {
                    $jsonLine = $line;
                    break;
                }
            }

            if (!$jsonLine) {
                return response()->json([
                    'success'   => false,
                    'error'     => 'OCR did not return valid JSON',
                    'rawOutput' => substr($stdout, 0, 500),
                    'stderr'    => substr($stderr, 0, 500),
                ], 500);
            }

            $result = json_decode($jsonLine, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                return response()->json([
                    'success'   => false,
                    'error'     => 'Failed to parse OCR JSON result',
                    'rawOutput' => substr($jsonLine, 0, 500),
                ], 500);
            }

            // ── Persist results ──────────────────────────────────────────────
            if ($result['success'] ?? false) {
                $ocrText         = $result['text']             ?? '';
                $extractedFields = $result['extracted_fields'] ?? [];
                $detectedType    = $result['detected_type']    ?? '';

                DB::update(
                    "UPDATE documents SET ocr_text = ?, extracted_fields = ?, detected_type = ? WHERE id = ?",
                    [
                        $ocrText,
                        json_encode($extractedFields, JSON_UNESCAPED_UNICODE),
                        $detectedType,
                        $documentId,
                    ]
                );

                $result['ocr_text_saved'] = true;
                $result['fields_saved']   = true;
            }

            return response()->json($result);

        } finally {
            if (file_exists($tempFile)) {
                @unlink($tempFile);
            }
        }
    }
}
