<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'first_name',
        'middle_name',
        'last_name',
        'email',
        'password',
        'role',
        'permissions',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed',
            'permissions'       => 'array',
        ];
    }

    protected $appends = ['name'];

    public function getNameAttribute()
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    // ─── Role helpers ────────────────────────────────────────────────────────

    public function isAdmin(): bool
    {
        return $this->role === 'Admin';
    }

    public function isStaff(): bool
    {
        return $this->role === 'Staff';
    }

    public function isUser(): bool
    {
        return $this->role === 'User';
    }
}
