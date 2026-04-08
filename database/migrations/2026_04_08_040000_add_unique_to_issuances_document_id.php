<?php
/** ── Master Registry Iron Guard ────────────────────────────────────────────── */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Safety Check: If there are existing duplicates, we need to handle them
        // This migration will fail if duplicates exist. For a production-ready fix:
        // Identify duplicates and keep only the LATEST one before applying constraint.
        
        Schema::table('issuances', function (Blueprint $table) {
            // Check if column exists first (it should from previous migration)
            if (Schema::hasColumn('issuances', 'document_id')) {
                // Remove duplicates first if any (keeps the one with the highest ID)
                DB::statement("DELETE t1 FROM issuances t1
                    INNER JOIN issuances t2 
                    WHERE t1.id < t2.id AND t1.document_id = t2.document_id AND t1.document_id IS NOT NULL");

                // Apply unique constraint
                $table->unique('document_id', 'unique_document_registry');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('issuances', function (Blueprint $table) {
            $table->dropUnique('unique_document_registry');
        });
    }
};
