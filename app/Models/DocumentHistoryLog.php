<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentHistoryLog extends Model
{
    protected $table = 'document_history_logs';

    protected $fillable = [
        'document_id',
        'filename',
        'person_name',
        'type',
        'barangay',
        'encoded_by',
        'action',
        'details',
    ];

    public function document()
    {
        return $this->belongsTo(Document::class);
    }
}
