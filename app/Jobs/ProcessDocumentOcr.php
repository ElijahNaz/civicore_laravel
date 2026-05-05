<?php

namespace App\Jobs;

use Illuminate\Bus\Batch;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Bus;
use App\Jobs\ProcessImageOcrJob;
use Throwable;

class ProcessDocumentOcr implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;
    public $backoff = [60, 120, 300];
    public $timeout = 900;
    public $uniqueFor = 3600;

    protected $documentId;
    protected $docType;
    protected $languages;

    public function __construct($documentId, $docType = '', $languages = 'en,tl')
    {
        $this->documentId = $documentId;
        $this->docType = $docType;
        $this->languages = $languages;
        $this->onQueue('high');
    }

    public function uniqueId()
    {
        return (string) $this->documentId;
    }

    public function handle(): void
    {
        Log::info("ProcessDocumentOcr Coordinator starting for Document ID: " . $this->documentId);

        $doc = DB::selectOne("SELECT * FROM documents WHERE id = ?", [$this->documentId]);
        
        // 1. Check if the document exists and has a file path mapped
        if (!$doc || empty($doc->file_path)) {
            Log::error("Invalid document or missing file_path on disk for ID: " . $this->documentId);
            return;
        }

        if (strtolower($doc->status) === 'stopped') {
            Log::info("ProcessDocumentOcr job skipped because status is stopped for Document ID: " . $this->documentId);
            return;
        }

        // 2. Get the actual physical path on your Windows machine in the local disk
        $sourceFilePath = storage_path('app/public/' . $doc->file_path);

        if (!file_exists($sourceFilePath)) {
            Log::error("Physical file is missing from storage folder: " . $sourceFilePath);
            DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
            return;
        }

        // 3. Determine extension dynamically from the file path
        $extension = strtolower(pathinfo($sourceFilePath, PATHINFO_EXTENSION));

        try {
            $jobs = [];

            // If it's a PDF, we must split it into images first
            if ($extension === 'pdf') {
                Log::info("PDF detected. Requesting Python to split into pages...");
                
                // Pass the Windows file path directly to the local Python server
                $response = Http::retry(3, 1000) // Retry 3 times, waiting 1s between each
                    ->timeout(600)
                    ->post('http://127.0.0.1:8080/split', [
                    'file_path' => $sourceFilePath,
                ]);

                if ($response->failed() || !($response->json()['success'] ?? false)) {
                    throw new \Exception("Failed to split PDF: " . $response->body());
                }

                $pages = $response->json()['pages'];
                Log::info("PDF split into " . count($pages) . " pages.");

                foreach ($pages as $index => $pageImage) {
                    // low priority queue for batch pages
                    $jobs[] = (new ProcessImageOcrJob(
                        $this->documentId,
                        $pageImage,
                        $index + 1,
                        $this->docType,
                        $this->languages
                    ))->onQueue('low');
                }
                
                // IMPORTANT: We removed the @unlink() here so the original PDF stays saved in CiviCORE!

            } else {
                // Single image or native document (docx/txt bypass)
                // high priority
                $jobs[] = (new ProcessImageOcrJob(
                    $this->documentId,
                    $sourceFilePath, // Using the direct disk path
                    1,
                    $this->docType,
                    $this->languages
                ))->onQueue('high');
            }

            $docId = $this->documentId;
            DB::table('document_ocr_pages')->where('document_id', $docId)->delete();

            // Dispatch batch
            $batch = Bus::batch($jobs)
                ->name("Document OCR - {$docId}")
                ->then(function (Batch $batch) use ($docId) {
                    // All jobs completed successfully
                    Log::info("Batch {$batch->id} completed for doc {$docId}");

                    $pageRows = DB::table('document_ocr_pages')
                        ->where('document_id', $docId)
                        ->orderBy('page_no')
                        ->get();

                    $ocrText = $pageRows
                        ->pluck('text')
                        ->filter(fn ($value) => filled($value))
                        ->implode("\n");

                    $detectedType = '';
                    $aggregatedFields = [];

                    foreach ($pageRows as $pageRow) {
                        $pageDetectedType = (string) ($pageRow->detected_type ?? '');
                        if ($detectedType === '' && $pageDetectedType !== '') {
                            $detectedType = $pageDetectedType;
                        }

                        $pageFields = json_decode($pageRow->extracted_fields ?? '[]', true) ?: [];
                        foreach ($pageFields as $key => $value) {
                            if (!empty($value) || empty($aggregatedFields[$key])) {
                                $aggregatedFields[$key] = $value;
                            }
                        }
                    }

                    DB::update(
                        "UPDATE documents
                         SET ocr_text = ?, detected_type = ?, extracted_fields = ?, status = 'extracted'
                         WHERE id = ?",
                        [
                            $ocrText,
                            $detectedType,
                            json_encode($aggregatedFields, JSON_UNESCAPED_UNICODE),
                            $docId,
                        ]
                    );
                })
                ->catch(function (Batch $batch, Throwable $e) use ($docId) {
                    // First batch job failure detected
                    Log::error("Batch {$batch->id} failed for doc {$docId}: " . $e->getMessage());
                    DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$docId]);
                })
                ->finally(function (Batch $batch) use ($docId) {
                    // The batch has finished executing (whether successful or not)
                })
                ->dispatch();

            // Store batch ID in document metadata so frontend can poll progress
            $metadata = json_decode($doc->metadata ?? '{}', true) ?: [];
            $metadata['batch_id'] = $batch->id;
            DB::update("UPDATE documents SET metadata = ? WHERE id = ?", [json_encode($metadata), $docId]);

            Log::info("Dispatched batch {$batch->id} for Document ID: " . $docId);

        } catch (\Throwable $e) { // Use \Throwable to catch even fatal errors
            Log::error("CRITICAL FAILURE in ProcessDocumentOcr: " . $e->getMessage());
            Log::error("Stack trace: " . $e->getTraceAsString()); // ADD THIS
            DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
        }
    }
}
