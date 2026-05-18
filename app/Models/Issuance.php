<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Issuance extends Model
{
    use SoftDeletes;

    protected $table = 'issuances';

    protected $fillable = [
        'document_id',
        'certNumber',
        'type',
        'name',
        'barangay',
        'issuanceDate',
        'status',
        'encoded_by',
        'extracted_data',
        'file_path',
    ];

    public function document()
    {
        return $this->belongsTo(Document::class);
    }
}
