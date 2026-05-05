<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TemplateController extends Controller
{
    /**
     * Get all PDF templates from the Templates folder
     */
    public function index()
    {
        $directory = base_path('Templates');
        if (!File::exists($directory)) {
            return response()->json([]);
        }

        $files = File::files($directory);
        $templates = [];

        // Get profiles from DB
        try {
            $profiles = DB::table('template_profiles')->get()->keyBy('file_path');
        } catch (\Exception $e) {
            Log::error('Template profiles load failure: ' . $e->getMessage());
            $profiles = collect();
        }

        foreach ($files as $file) {
            if (strtolower($file->getExtension()) !== 'pdf') continue;

            $relativePath = $file->getFilename();
            $profile = $profiles->get($relativePath);
            
            $detectedType = 'unknown';
            if ($profile) {
                $detectedType = $profile->type;
            } else {
                // Heuristic matching based on filename
                $lowerName = strtolower($relativePath);
                if (str_contains($lowerName, 'birth')) $detectedType = 'birth';
                elseif (str_contains($lowerName, 'death')) $detectedType = 'death';
                elseif (str_contains($lowerName, 'marriage')) $detectedType = 'marriage';
            }

            $templates[] = [
                'name' => $profile->name ?? str_replace('.pdf', '', $relativePath),
                'file_path' => $relativePath,
                'type' => $detectedType,
                'config' => isset($profile->config) ? json_decode($profile->config) : null,
                'id' => $profile->id ?? null,
            ];
        }

        return response()->json($templates);
    }

    /**
     * Update or create a template profile/config
     */
    public function updateConfig(Request $request)
    {
        $filePath = $request->input('file_path');
        $config = $request->input('config');
        $name = $request->input('name');
        $type = $request->input('type');

        $exists = DB::table('template_profiles')->where('file_path', $filePath)->first();

        if ($exists) {
            DB::table('template_profiles')
                ->where('file_path', $filePath)
                ->update([
                    'config' => json_encode($config),
                    'name' => $name ?? $exists->name,
                    'type' => $type ?? $exists->type,
                    'updated_at' => now(),
                ]);
        } else {
            DB::table('template_profiles')->insert([
                'file_path' => $filePath,
                'name' => $name ?? str_replace('.pdf', '', $filePath),
                'type' => $type ?? 'unknown',
                'config' => json_encode($config),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json(['success' => true]);
    }

    /**
     * Upload a new PDF template to the Templates folder
     */
    public function upload(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:pdf|max:10240', // 10MB max
            'type' => 'required|string|in:birth,death,marriage,marriage_license'
        ]);

        $file = $request->file('file');
        $type = $request->input('type');
        $originalName = $file->getClientOriginalName();
        
        // Save to Templates directory
        $directory = base_path('Templates');
        if (!File::exists($directory)) {
            File::makeDirectory($directory, 0755, true);
        }

        $file->move($directory, $originalName);

        // Create initial profile
        DB::table('template_profiles')->updateOrInsert(
            ['file_path' => $originalName],
            [
                'name' => str_replace('.pdf', '', $originalName),
                'type' => $type,
                'updated_at' => now(),
                'created_at' => now()
            ]
        );

        return response()->json(['success' => true]);
    }

    /**
     * Get a preview image of a PDF template page
     */
    public function getPreview(Request $request)
    {
        $fileName = $request->query('file');
        $page = (int) $request->query('page', 1);

        if (!$fileName) {
            return response()->json(['error' => 'File parameter is required'], 400);
        }

        $filePath = base_path('Templates' . DIRECTORY_SEPARATOR . $fileName);
        if (!File::exists($filePath)) {
            return response()->json(['error' => 'File not found at ' . $filePath], 404);
        }

        // Check if we already have the split images
        $baseName = pathinfo($fileName, PATHINFO_FILENAME);
        $previewPath = base_path('Templates' . DIRECTORY_SEPARATOR . "{$baseName}_page_{$page}.jpg");

        if (!File::exists($previewPath)) {
            // Call Python OCR server to split PDF
            try {
                $response = Http::timeout(60)->post('http://127.0.0.1:5000/split', [
                    'file_path' => $filePath
                ]);

                if ($response->failed()) {
                    Log::error("Failed to split PDF: " . $response->body());
                    return response()->json(['error' => 'Failed to split PDF via OCR server'], 500);
                }
            } catch (\Exception $e) {
                Log::error("OCR server unreachable: " . $e->getMessage());
                return response()->json(['error' => 'OCR server unreachable: ' . $e->getMessage()], 500);
            }
        }

        if (File::exists($previewPath)) {
            return response()->file($previewPath);
        }

        return response()->json(['error' => 'Preview image generation failed for ' . $previewPath], 500);
    }
}

