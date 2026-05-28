<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$req = \Illuminate\Http\Request::create('/api/issuances/1', 'PUT', [
    'name' => 'Tinker Test',
    'barangay' => 'Makina',
    'extracted_data' => ['first_name' => 'Tinker']
]);
$ctrl = app(App\Http\Controllers\IssuanceController::class);
try {
    $res = $ctrl->update($req, 1);
    echo $res->getContent();
} catch (\Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n" . $e->getTraceAsString();
}
