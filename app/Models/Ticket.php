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
        'document_id'
    ];

    protected $casts = [
        'details' => 'array',
    ];

    public function document()
    {
        return $this->belongsTo(Document::class);
    }
}
