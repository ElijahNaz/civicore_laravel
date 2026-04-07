<?php

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
        if (!Schema::hasTable('documents')) {
            Schema::create('documents', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('type');
                $table->string('date');
                $table->string('size');
                $table->string('status')->default('Uploaded');
                $table->longText('previewData')->nullable();
                $table->string('personName')->nullable();
                $table->string('barangay')->nullable();
                $table->json('metadata')->nullable();
                $table->longText('ocr_text')->nullable();
                $table->timestamps();
            });
            // Add LONGBLOB column separately — Laravel's binary() maps to TINYBLOB in MySQL
            DB::statement('ALTER TABLE documents ADD COLUMN file_data LONGBLOB NULL');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};
