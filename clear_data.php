<?php

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$tables = collect(DB::select('SHOW TABLES'))->map(function($t) {
    return array_values((array)$t)[0];
});

$keep = [
    'users',
    'roles',
    'permissions',
    'model_has_permissions',
    'model_has_roles',
    'role_has_permissions',
    'migrations',
    'password_reset_tokens',
    'sessions',
    'personal_access_tokens'
];

DB::statement('SET FOREIGN_KEY_CHECKS=0;');

foreach ($tables as $table) {
    if (!in_array($table, $keep)) {
        DB::table($table)->truncate();
        echo "Truncated: $table\n";
    } else {
        echo "Kept: $table\n";
    }
}

DB::statement('SET FOREIGN_KEY_CHECKS=1;');

echo "Done.\n";
