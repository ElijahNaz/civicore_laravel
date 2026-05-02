<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add file_path, raw_text, and extracted_data columns for OCR document management
     */
    public function up(): void
    {
        if (Schema::hasTable('documents')) {
            Schema::table('documents', function (Blueprint $table) {
                // Add file_path column to store disk-based file location
                if (!Schema::hasColumn('documents', 'file_path')) {
                    $table->string('file_path')->nullable()->after('metadata')->comment('Path to stored file in storage/app/public/documents');
                }

                // Add raw_text column for full-text search
                // Stores the complete raw OCR output before any processing
                if (!Schema::hasColumn('documents', 'raw_text')) {
                    $table->longText('raw_text')->nullable()->after('file_path')->comment('Raw OCR text for full-text searchability');
                }

                // Add extracted_data column (alias for extracted_fields for clarity)
                if (!Schema::hasColumn('documents', 'extracted_data')) {
                    $table->json('extracted_data')->nullable()->after('raw_text')->comment('JSON extracted fields from OCR (Name, Date, etc.)');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('documents')) {
            Schema::table('documents', function (Blueprint $table) {
                $table->dropColumn(['file_path', 'raw_text', 'extracted_data']);
            });
        }
    }
};
