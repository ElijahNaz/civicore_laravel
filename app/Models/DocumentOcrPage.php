<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentOcrPage extends Model
{
    protected $table = 'document_ocr_pages';

    protected $fillable = [
        'document_id',
        'page_no',
        'text',
        'extracted_fields',
        'detected_type',
    ];

    protected $casts = [
        'extracted_fields' => 'json',
    ];

    public function document()
    {
        return $this->belongsTo(Document::class);
    }
}
