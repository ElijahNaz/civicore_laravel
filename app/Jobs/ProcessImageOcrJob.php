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
    protected $pageNo;
    protected $docType;
    protected $languages;

    public function __construct($documentId, $imagePath, $pageNo = 1, $docType = '', $languages = 'en,tl')
    {
        $this->documentId = $documentId;
        $this->imagePath = $imagePath;
        $this->pageNo = $pageNo;
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

            DB::table('document_ocr_pages')->updateOrInsert(
                [
                    'document_id' => $this->documentId,
                    'page_no' => $this->pageNo,
                ],
                [
                    'text' => $newText,
                    'detected_type' => $detectedType,
                    'extracted_fields' => json_encode($newFields, JSON_UNESCAPED_UNICODE),
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );

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
