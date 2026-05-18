<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\IssuanceController;
use App\Http\Controllers\BarangayController;
use App\Http\Controllers\TemplateController;
use App\Http\Controllers\OcrController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\PublicController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\VerificationController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| All routes use the 'web' middleware group so that Laravel session cookies
| (laravel_session) are available — required for session-based auth.
|
*/

Route::middleware('api')->group(function () {

    // ── Public APIs (no session start required)
    Route::get('/public/config',    [PublicController::class, 'config']);
    Route::get('/public/stats',     [PublicController::class, 'stats']);
    Route::get('/announcements',    [AnnouncementController::class, 'index']);
    Route::get('/templates',        [TemplateController::class, 'index']);
    Route::get('/templates/preview', [TemplateController::class, 'getPreview']);
    Route::post('/documents/bulk-process', [DocumentController::class, 'bulkProcess']);
});

Route::middleware('web')->group(function () {

    // ── Auth ───────────────────────────────────────────────────────────────
    Route::post('/login',           [AuthController::class, 'login']);
    Route::get('/session',          [AuthController::class, 'session']);
    Route::post('/logout',          [AuthController::class, 'logout']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);
    Route::post('/verify-password', [AuthController::class, 'verifyPassword']);

    // ── Users ──────────────────────────────────────────────────────────────
    Route::get('/users',                [UserController::class, 'index']);
    Route::get('/users/{id}',           [UserController::class, 'show']);
    Route::post('/users',               [UserController::class, 'store']);
    Route::post('/create-account',      [UserController::class, 'createAccount']);
    Route::put('/users/{id}',           [UserController::class, 'update']);
    Route::put('/users/{id}/profile',   [UserController::class, 'updateProfile']);
    Route::delete('/users/{id}',        [UserController::class, 'destroy']);

    // ── Dashboard ──────────────────────────────────────────────────────────
    Route::get('/dashboard/stats',      [DashboardController::class, 'stats']);

    // ── Settings & Announcements ───────────────────────────────────────────
    Route::post('/settings',            [SettingController::class, 'update']);
    Route::post('/announcements',       [AnnouncementController::class, 'store']);
    Route::put('/announcements/{id}',   [AnnouncementController::class, 'update']);
    Route::delete('/announcements/{id}',[AnnouncementController::class, 'destroy']);

    // ── Email Verification ─────────────────────────────────────────────────────
    Route::post('/verification/send',   [VerificationController::class, 'send']);
    Route::post('/verification/verify', [VerificationController::class, 'verify']);

    // ── Documents ──────────────────────────────────────────────────────────
    Route::get('/documents',                    [DocumentController::class, 'index']);
    Route::get('/documents/history',            [DocumentController::class, 'history']);
    Route::post('/documents',                   [DocumentController::class, 'store']);
    Route::put('/documents/{id}',               [DocumentController::class, 'update']);
    Route::delete('/documents/{id}',            [DocumentController::class, 'destroy']);
    Route::post('/documents/{id}/undo',         [DocumentController::class, 'undo']);
    Route::post('/documents/upload',            [DocumentController::class, 'upload']);
    Route::post('/documents/{id}/quick-approve', [DocumentController::class, 'quickApprove']);
    Route::post('/documents/{id}/toggle-ocr',   [DocumentController::class, 'toggleOcr']);
    Route::get('/documents/download/{id}',      [DocumentController::class, 'download']);
    Route::get('/documents/view/{id}',          [DocumentController::class, 'view']);
    Route::get('/documents/download-txt/{id}',  [DocumentController::class, 'downloadTxt']);

    // ── OCR ────────────────────────────────────────────────────────────────
    Route::post('/ocr/process', [OcrController::class, 'process']);
    Route::get('/documents/{id}/status', function ($id) {
        $doc = DB::selectOne("SELECT status FROM documents WHERE id = ?", [$id]);
        return response()->json(['status' => $doc ? $doc->status : 'not_found']);
    });

    // ── Issuances ──────────────────────────────────────────────────────────
    Route::get('/issuances',                          [IssuanceController::class, 'index']);
    Route::get('/issuances/{id}',                     [IssuanceController::class, 'show']);
    Route::get('/issuances/download/{id}',            [IssuanceController::class, 'download']);
    Route::get('/issuances/view/{id}',                [IssuanceController::class, 'view']);
    Route::post('/issuances',                         [IssuanceController::class, 'store']);
    Route::put('/issuances/{id}',                     [IssuanceController::class, 'update']);
    Route::delete('/issuances/{id}',                  [IssuanceController::class, 'destroy']);
    Route::post('/issuances/{id}/undo',               [IssuanceController::class, 'undo']);
    Route::post('/issuances/{id}/issue',              [IssuanceController::class, 'markAsIssued']);
    Route::get('/issuances/next-cert-number/{type}',  [IssuanceController::class, 'nextCertNumber']);

    // ── Barangays ──────────────────────────────────────────────────────────
    Route::get('/barangays', [BarangayController::class, 'index']);

    // ── Templates ──────────────────────────────────────────────────────────
    Route::post('/templates/upload',      [TemplateController::class, 'upload']);
    Route::post('/templates/config',      [TemplateController::class, 'updateConfig']);

    // ── Activity Logs ──────────────────────────────────────────────────────
    Route::get('/activity-logs',     [ActivityLogController::class, 'index']);
    Route::post('/activity-logs',    [ActivityLogController::class, 'store']);
});
