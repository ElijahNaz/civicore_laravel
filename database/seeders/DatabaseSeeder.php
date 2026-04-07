<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Admin — full system access
        User::create([
            'name'     => 'Admin Officer',
            'email'    => 'admin@civicore.gov.ph',
            'password' => Hash::make('admin2024'),
            'role'     => 'Admin',
        ]);

        // Staff — internal employee, restricted to own account
        User::create([
            'name'     => 'Staff Member',
            'email'    => 'staff@civicore.gov.ph',
            'password' => Hash::make('staff2024'),
            'role'     => 'Staff',
        ]);

        // User — external/civilian, restricted to own account
        User::create([
            'name'     => 'Civilian User',
            'email'    => 'user@civicore.gov.ph',
            'password' => Hash::make('user2024'),
            'role'     => 'User',
        ]);
    }
}
