<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ProcessDocumentOcr implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * The number of seconds the job can run before timing out.
     *
     * @var int
     */
    public $timeout = 300; // 5 minutes max

    protected $documentId;
    protected $docType;
    protected $languages;

    /**
     * Create a new job instance.
     */
    public function __construct($documentId, $docType = '', $languages = 'en,tl')
    {
        $this->documentId = $documentId;
        $this->docType = $docType;
        $this->languages = $languages;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        Log::info("Starting OCR Job for Document ID: " . $this->documentId);

        // Fetch document from DB
        $documents = DB::select("SELECT * FROM documents WHERE id = ?", [$this->documentId]);
        if (count($documents) === 0) {
            Log::error("Document not found for OCR Job: " . $this->documentId);
            return;
        }

        $doc = $documents[0];
        $fileContent = $doc->file_data;

        if (empty($fileContent)) {
            Log::error("File content not found in database for Document ID: " . $this->documentId);
            DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
            return;
        }

        // Determine extension
        $metadata = json_decode($doc->metadata, true);
        $mimetype = $metadata['mimetype'] ?? 'image/jpeg';

        $extension = 'jpg';
        if (str_contains($mimetype, 'pdf'))  $extension = 'pdf';
        elseif (str_contains($mimetype, 'png'))  $extension = 'png';
        elseif (str_contains($mimetype, 'tiff')) $extension = 'tiff';
        elseif (str_contains($mimetype, 'bmp'))  $extension = 'bmp';

        // Write to temp file
        $tempDir = sys_get_temp_dir();
        $tempFile = $tempDir . DIRECTORY_SEPARATOR . 'ocr_' . $this->documentId . '_' . time() . '.' . $extension;

        if (file_put_contents($tempFile, $fileContent) === false) {
            Log::error("Could not write temp file for Document ID: " . $this->documentId);
            DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
            return;
        }

        try {
            // Build command
            $ocrScript = base_path('ocr_processor.py');
            $pythonBin = PHP_OS_FAMILY === 'Windows' ? 'python' : 'python3';

            // Build setup
            $cmd = $pythonBin
                . ' "' . addslashes($ocrScript) . '"'
                . ' "' . addslashes($tempFile)  . '"'
                . ' --lang '     . escapeshellarg($this->languages)
                . ' --type auto'
                . ' --doc_type ' . escapeshellarg($this->docType ?: 'birth');

            Log::info("Job running shell command: " . $cmd);

            $descriptors = [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
            ];

            $process = proc_open($cmd, $descriptors, $pipes);

            if (!is_resource($process)) {
                Log::error("Failed to start Python process in OCR Job for Document ID: " . $this->documentId);
                DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
                return;
            }

            fclose($pipes[0]);

            $stdout = '';
            $stderr = '';
            $start = time();
            $timeout = 240; // 4 minutes

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
                    Log::error("OCR processing timed out for Document ID: " . $this->documentId);
                    DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
                    return;
                }

                usleep(200000); // 200ms
            }

            $stdout .= stream_get_contents($pipes[1]);
            $stderr .= stream_get_contents($pipes[2]);

            fclose($pipes[1]);
            fclose($pipes[2]);

            $exitCode = proc_close($process);

            Log::info("Job OCR exit code: " . $exitCode);

            $stdout = trim($stdout);

            if ($exitCode !== 0 || empty($stdout)) {
                Log::error("OCR processing failed for Document ID: " . $this->documentId . " with exit code: " . $exitCode);
                Log::error("Stderr: " . $stderr);
                DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
                return;
            }

            // Parse valid JSON
            $jsonLine = null;
            foreach (array_reverse(explode("\n", $stdout)) as $line) {
                $line = trim($line);
                if (str_starts_with($line, '{')) {
                    $jsonLine = $line;
                    break;
                }
            }

            if (!$jsonLine) {
                Log::error("OCR did not return valid JSON for Document ID: " . $this->documentId);
                DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
                return;
            }

            $result = json_decode($jsonLine, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                Log::error("Failed to parse OCR JSON for Document ID: " . $this->documentId);
                DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
                return;
            }

            // Persist valid results exactly as before!
            if ($result['success'] ?? false) {
                $ocrText         = $result['text']             ?? '';
                $extractedFields = $result['extracted_fields'] ?? [];
                $detectedType    = $result['detected_type']    ?? '';

                DB::update(
                    "UPDATE documents SET ocr_text = ?, extracted_fields = ?, detected_type = ?, status = 'extracted' WHERE id = ?",
                    [
                        $ocrText,
                        json_encode($extractedFields, JSON_UNESCAPED_UNICODE),
                        $detectedType,
                        $this->documentId,
                    ]
                );
                
                Log::info("OCR Job completed successfully for Document ID: " . $this->documentId);
            } else {
                Log::error("OCR Job failed according to JSON response for Document ID: " . $this->documentId);
                DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
            }

        } finally {
            if (file_exists($tempFile)) {
                @unlink($tempFile);
            }
        }
    }
}
