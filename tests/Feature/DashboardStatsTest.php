<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DashboardStatsTest extends TestCase
{
    use RefreshDatabase;

    protected int $userId;

    protected function setUp(): void
    {
        parent::setUp();

        // Create a mock user for session auth
        $this->userId = DB::table('users')->insertGetId([
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => 'test@civicore.gov.ph',
            'password' => bcrypt('password'),
            'role' => 'Admin',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_dashboard_stats_filters_out_pending_and_extracted_queue_documents()
    {
        // 1. Processed documents (status: processed, active, issued) - should be in totalDocs and processedDocs
        DB::table('documents')->insert([
            [
                'name' => 'ProcessedBirth.pdf',
                'type' => 'birth',
                'date' => '2026-05-26',
                'size' => '1024',
                'status' => 'processed',
                'deleted_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'ActiveDeath.pdf',
                'type' => 'death',
                'date' => '2026-05-26',
                'size' => '1024',
                'status' => 'active',
                'deleted_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        ]);

        // 2. Draft/Queue documents (status: pending, extracted, processing, uploaded) - should NOT be in totalDocs
        DB::table('documents')->insert([
            [
                'name' => 'ExtractedDraft.pdf',
                'type' => 'birth',
                'date' => '2026-05-26',
                'size' => '1024',
                'status' => 'extracted',
                'deleted_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'PendingUpload.pdf',
                'type' => 'marriage',
                'date' => '2026-05-26',
                'size' => '1024',
                'status' => 'pending',
                'deleted_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'ProcessingDoc.pdf',
                'type' => 'birth',
                'date' => '2026-05-26',
                'size' => '1024',
                'status' => 'processing',
                'deleted_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'UploadedOnly.pdf',
                'type' => 'birth',
                'date' => '2026-05-26',
                'size' => '1024',
                'status' => 'uploaded',
                'deleted_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        ]);

        // 3. Make the API call with session auth
        $response = $this->withSession(['user_id' => $this->userId])
                         ->getJson('/api/dashboard/stats');

        $response->assertStatus(200);

        // 4. Verify statistics
        // totalDocs (Master registry) should only count Processed and Active (= 2)
        // pendingDocs (Queue) should count extracted, pending, processing, uploaded (= 4)
        $response->assertJsonPath('stats.totalDocs', 2);
        $response->assertJsonPath('stats.pendingDocs', 4);
        $response->assertJsonPath('stats.processedDocs', 2);
    }
}
