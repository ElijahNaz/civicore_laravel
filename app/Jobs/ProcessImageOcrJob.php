<?php

namespace App\Jobs;

use Illuminate\Bus\Batchable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

class ProcessImageOcrJob implements ShouldQueue
{
    use Batchable, Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 300;
    public $tries = 3;

    protected $documentId;
    protected $imagePath;
    protected $docType;
    protected $languages;

    public function __construct($documentId, $imagePath, $docType = '', $languages = 'en,tl')
    {
        $this->documentId = $documentId;
        $this->imagePath = $imagePath;
        $this->docType = $docType;
        $this->languages = $languages;
    }

    public function handle(): void
    {
        if ($this->batch() && $this->batch()->cancelled()) {
            return;
        }

        Log::info("ProcessImageOcrJob starting for doc {$this->documentId}, image: {$this->imagePath}");

        try {
            $response = Http::timeout(120)->post('http://127.0.0.1:5000/ocr', [
                'file_path' => $this->imagePath,
                'doc_type' => $this->docType,
                'languages' => $this->languages,
                'ocr_mode' => 'fast',
            ]);

            if ($response->failed() || !($response->json()['success'] ?? false)) {
                throw new \Exception("OCR Server error: " . $response->body());
            }

            $result = $response->json();
            $newText = $result['text'] ?? '';
            $detectedType = $result['detected_type'] ?? '';
            $newFields = $result['extracted_fields'] ?? [];

            DB::transaction(function() use ($newText, $detectedType, $newFields) {
                // Get existing data with a row lock to prevent race conditions from multiple pages
                $currentDoc = DB::selectOne("SELECT ocr_text, detected_type, extracted_fields FROM documents WHERE id = ? FOR UPDATE", [$this->documentId]);
                $existingFields = json_decode($currentDoc->extracted_fields ?? '[]', true) ?: [];
                
                // Merge fields (prefer non-empty values from the new extraction)
                foreach ($newFields as $key => $value) {
                    if (!empty($value) || empty($existingFields[$key])) {
                        $existingFields[$key] = $value;
                    }
                }

                DB::update(
                    "UPDATE documents SET 
                     ocr_text = CONCAT(IFNULL(ocr_text, ''), '\n', ?), 
                     detected_type = IF(detected_type = '' OR detected_type IS NULL, ?, detected_type),
                     extracted_fields = ?
                     WHERE id = ?",
                    [
                        $newText, 
                        $detectedType, 
                        json_encode($existingFields, JSON_UNESCAPED_UNICODE),
                        $this->documentId
                    ]
                );
            });

            Log::info("ProcessImageOcrJob finished for image: {$this->imagePath}");

        } catch (\Exception $e) {
            Log::error("ProcessImageOcrJob failed for {$this->imagePath}: " . $e->getMessage());
            $this->fail($e);
        } finally {
            if (file_exists($this->imagePath)) {
                @unlink($this->imagePath); // cleanup temp image
            }
        }
    }
}
