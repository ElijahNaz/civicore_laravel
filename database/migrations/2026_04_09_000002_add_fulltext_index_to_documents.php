<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Add FULLTEXT index on raw_text and name for lightning-fast search performance
     * Recommended: Run after raw_text data is populated for initial indexing
     */
    public function up(): void
    {
        if (Schema::hasTable('documents')) {
            // Create FULLTEXT index for full-text search on raw_text and name
            DB::statement('ALTER TABLE documents ADD FULLTEXT INDEX ft_raw_text_name (raw_text, name)');
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('documents')) {
            DB::statement('ALTER TABLE documents DROP INDEX ft_raw_text_name');
        }
    }
};
