<?php

namespace App\Services;

class OcrParserService
{
    public function parseText(string $rawText): array
    {
        $fields = [];
        $detectedType = 'Uncategorized';

        // 1. Detect Document Type
        if (preg_match('/(LIVE\s*Birth|CERTIFICATE\s*OF\s*LIVE\s*Birth)/i', $rawText)) {
            $detectedType = 'birth';
        } elseif (preg_match('/MARRIAGE/i', $rawText)) {
            $detectedType = 'marriage';
        } elseif (preg_match('/DEATH/i', $rawText)) {
            $detectedType = 'death';
        }

        // 2. Extract Data (Customized for Philippine Civil Registry Forms)
        if ($detectedType === 'birth') {
            // --- CHILD'S NAME ---
            if (preg_match('/NAME.*?([A-Z]{3,})\s+([A-Z]{3,})\s+([A-Z]{3,}iiQ|[A-Za-z]{3,})/s', $rawText, $matches)) {
                $fields['first_name'] = trim($matches[1]);
                $fields['middle_name'] = trim($matches[2]);
                $fields['last_name'] = trim($matches[3]);
            }

            // --- SEX ---
            if (preg_match('/SEX\s*(Ferne|Female|Male|M|F)/i', $rawText, $matches)) {
                $sex = strtoupper($matches[1]);
                $fields['sex'] = in_array($sex, ['FERNE', 'FEMALE', 'F']) ? 'Female' : 'Male';
            }

            // --- MOTHER'S MAIDEN NAME ---
            if (preg_match('/(?:MADEN|MAIDEN).*?NaME\s+([A-Z]+)\s+([A-Z]+)\s+([A-Za-z]+)/s', $rawText, $matches)) {
                $fields['mother_first_name'] = trim($matches[1]);
                $fields['mother_middle_name'] = trim($matches[2]);
                $fields['mother_last_name'] = trim($matches[3]);
            }

            // --- DATE OF BIRTH ---
            if (preg_match('/(?:KAI|MAI|MAY|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[a-z]*\s+\d{1,2},\s*\d{4}/i', $rawText, $matches)) {
                $fields['date_of_birth'] = trim($matches[0]);
            }

            // --- PLACE OF BIRTH ---
            if (preg_match('/AT\s+([A-Z]+),\s*([A-Z]+)/i', $rawText, $matches)) {
                $fields['place_of_birth'] = trim($matches[1]) . ', ' . trim($matches[2]);
            }
        }

        return [
            'detected_type' => $detectedType,
            'extracted_fields' => $fields,
        ];
    }
}
