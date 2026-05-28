<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Ticket extends Model
{
    use HasFactory;

    protected $fillable = [
        'ticket_number',
        'client_name',
        'email',
        'phone',
        'purpose',
        'status',
        'details',
        'token',
        'document_id',
        'expires_at',
        'source',
        'qr_code_path',
    ];

    protected $casts = [
        'details'    => 'array',
        'expires_at' => 'datetime',
    ];

    public function document()
    {
        return $this->belongsTo(Document::class);
    }

    /**
     * Whether this ticket has expired (past 5 PM on submission day).
     */
    public function isExpired(): bool
    {
        if (!$this->expires_at) return false;
        return now()->gt($this->expires_at);
    }
}
