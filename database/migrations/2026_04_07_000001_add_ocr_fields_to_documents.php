<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            if (!Schema::hasColumn('documents', 'extracted_fields')) {
                $table->json('extracted_fields')->nullable()->after('ocr_text');
            }
            if (!Schema::hasColumn('documents', 'detected_type')) {
                $table->string('detected_type')->nullable()->after('extracted_fields');
            }
            if (!Schema::hasColumn('documents', 'parental_consent')) {
                $table->boolean('parental_consent')->default(false)->after('detected_type');
            }
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn(['extracted_fields', 'detected_type', 'parental_consent']);
        });
    }
};
