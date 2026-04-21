<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

class ProcessDocumentOcr implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * The number of seconds the job can run before timing out.
     *
     * @var int
     */
    public $timeout = 600; // 10 minutes max (extra safe for large files)

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
        Log::info("Starting OCR Job (v2 - Server Mode) for Document ID: " . $this->documentId);

        // Fetch document
        $doc = DB::selectOne("SELECT * FROM documents WHERE id = ?", [$this->documentId]);
        if (!$doc) {
            Log::error("Document not found: " . $this->documentId);
            return;
        }

        if (empty($doc->file_data)) {
            Log::error("No file data for document: " . $this->documentId);
            DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
            return;
        }

        // Determine extension
        $metadata = json_decode($doc->metadata, true);
        $mimetype = $metadata['mimetype'] ?? 'image/jpeg';
        
        $extension = 'jpg';
        if (str_contains($mimetype, 'pdf')) $extension = 'pdf';
        elseif (str_contains($mimetype, 'wordprocessingml') || str_contains($mimetype, 'msword')) $extension = 'docx';
        elseif (str_contains($mimetype, 'png')) $extension = 'png';
        elseif (str_contains($mimetype, 'tiff')) $extension = 'tiff';

        // Write to temp file for the Python server to read
        // (In a distributed system we'd send binary, but since it's local, path is faster)
        $tempFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ocr_v2_' . $this->documentId . '.' . $extension;
        file_put_contents($tempFile, $doc->file_data);

        try {
            Log::info("Calling OCR Server for ID: " . $this->documentId);
            
            $response = Http::timeout(300)->post('http://127.0.0.1:5000/ocr', [
                'file_path' => $tempFile,
                'doc_type' => $this->docType ?: 'birth',
                'languages' => $this->languages ?: 'en,tl'
            ]);

            if ($response->failed()) {
                throw new \Exception("OCR Server returned error: " . $response->body());
            }

            $result = $response->json();
            
            if (!($result['success'] ?? false)) {
                throw new \Exception("OCR Result indicates failure: " . ($result['error'] ?? 'Unknown error'));
            }

            // Standardize status: 'extracted' is our "Done" state
            DB::update(
                "UPDATE documents SET ocr_text = ?, extracted_fields = ?, detected_type = ?, status = 'extracted' WHERE id = ?",
                [
                    $result['text'] ?? '',
                    json_encode($result['extracted_fields'] ?? [], JSON_UNESCAPED_UNICODE),
                    $result['detected_type'] ?? '',
                    $this->documentId,
                ]
            );

            Log::info("OCR Job (v2) completed successfully for ID: " . $this->documentId);

        } catch (\Exception $e) {
            Log::error("OCR Job (v2) failed: " . $e->getMessage());
            DB::update("UPDATE documents SET status = 'failed' WHERE id = ?", [$this->documentId]);
        } finally {
            if (file_exists($tempFile)) {
                @unlink($tempFile);
            }
        }
    }
}
