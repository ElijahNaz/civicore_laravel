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
            $response = Http::timeout(120)->post('http://127.0.0.1:8080/ocr', [
                'file_path' => $this->imagePath,
                'doc_type' => $this->docType,
                'languages' => $this->languages,
                'ocr_mode' => 'balanced',
            ]);

            if ($response->failed() || !($response->json()['success'] ?? false)) {
                throw new \Exception("OCR Server error: " . $response->body());
            }

            $result = $response->json();
            $newText = $result['text'] ?? '';

            // ── Priority 1: Use Python Zonal Spatial OCR (most accurate) ──────
            // When quick_fill succeeds, Python returns clean extracted_fields
            // directly from the calibrated ROI boxes. Trust these fully.
            $detectedType = $result['detected_type'] ?? 'unknown';
            $newFields = $result['extracted_fields'] ?? [];

            // ── Priority 2: Fallback to Laravel OcrParserService ──────────────
            // When Zonal OCR fails (template not detected, low confidence, etc.)
            // Python returns an empty extracted_fields but still gives us the raw
            // full-page OCR text. Run our Laravel regex parser on that text so
            // the form is never completely blank for the user.
            if (empty($newFields) && !empty($newText)) {
                Log::info("ProcessImageOcrJob: Zonal OCR returned empty fields, using Laravel OcrParserService fallback for doc {$this->documentId}");
                $parser = new \App\Services\OcrParserService();
                $parsedData = $parser->parseText($newText);
                $newFields = $parsedData['extracted_fields'] ?? [];
                // Only override detected_type if Python returned 'unknown'
                if ($detectedType === 'unknown' && !empty($parsedData['detected_type'])) {
                    $detectedType = $parsedData['detected_type'];
                }
            }

            // Temporary metadata flags for the batch aggregator
            $newFields['_quick_fill_used'] = $result['quick_fill_used'] ?? false;
            $newFields['_template_family_detected'] = $result['template_family_detected'] ?? null;
            $newFields['_detected_type'] = $detectedType;

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
