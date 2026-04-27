<?php

namespace App\Jobs;

use Illuminate\Bus\Batch;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Bus;
use Throwable;

class ProcessDocumentOcr implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 600;

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

    public function handle(): void
    {
        Log::info("ProcessDocumentOcr Coordinator starting for Document ID: " . $this->documentId);

        $doc = DB::selectOne("SELECT * FROM documents WHERE id = ?", [$this->documentId]);
        if (!$doc || empty($doc->file_data)) {
            Log::error("Invalid document or empty file data: " . $this->documentId);
            return;
        }

        $metadata = json_decode($doc->metadata, true);
        $mimetype = $metadata['mimetype'] ?? 'image/jpeg';
        
        $extension = 'jpg';
        if (str_contains($mimetype, 'pdf')) $extension = 'pdf';
        elseif (str_contains($mimetype, 'wordprocessingml') || str_contains($mimetype, 'msword')) $extension = 'docx';
        elseif (str_contains($mimetype, 'png')) $extension = 'png';
        elseif (str_contains($mimetype, 'tiff')) $extension = 'tiff';
        elseif (str_contains($mimetype, 'text')) $extension = 'txt';

        $tempFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ocr_source_' . $this->documentId . '.' . $extension;
        file_put_contents($tempFile, $doc->file_data);

        try {
            $jobs = [];

            // If it's a PDF, we must split it into images first
            if ($extension === 'pdf') {
                Log::info("PDF detected. Requesting Python to split into pages...");
                $response = Http::timeout(300)->post('http://127.0.0.1:5000/split', [
                    'file_path' => $tempFile
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
                
                // Cleanup original PDF since we have images
                @unlink($tempFile);
            } else {
                // Single image or native document (docx/txt bypass)
                // high priority
                $jobs[] = (new ProcessImageOcrJob(
                    $this->documentId,
                    $tempFile,
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
            $metadata['batch_id'] = $batch->id;
            DB::update("UPDATE documents SET metadata = ? WHERE id = ?", [json_encode($metadata), $docId]);

            Log::info("Dispatched batch {$batch->id} for Document ID: " . $docId);

        } catch (\Exception $e) {
            Log::error("ProcessDocumentOcr coordinator failed: " . $e->getMessage());
            DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
            if (file_exists($tempFile)) @unlink($tempFile);
        }
    }
}
