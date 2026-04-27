<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_ocr_pages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id');
            $table->unsignedInteger('page_no');
            $table->longText('text')->nullable();
            $table->json('extracted_fields')->nullable();
            $table->string('detected_type')->nullable();
            $table->timestamps();

            $table->unique(['document_id', 'page_no']);
            $table->index('document_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_ocr_pages');
    }
};
