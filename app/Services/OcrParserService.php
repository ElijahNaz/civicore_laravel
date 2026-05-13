<?php

namespace App\Services;

/**
 * OcrParserService — Smart Anchor-Based Extraction
 * ================================================
 * This parser uses a "semantic anchor" strategy to extract form data:
 * 
 * 1. Global Patterns: Search for highly unique IDs like Registry Numbers first.
 * 2. Targeted Anchors: Find labels (like "Province") and grab the next non-label word.
 * 3. Skip Lists: Intelligently ignore common OCR headers like "OFFICE", "REPUBLIC", etc.
 * 4. Normalization: Clean up common OCR artifacts (typos, case issues).
 *
 * This approach is DPI-independent and works on any scan size/rotation.
 */
class OcrParserService
{
    private const BIRTH_ANCHORS = [
        'province'                   => ['\bprovince\b'],
        'city_municipality'          => ['city/municipality', 'city municipality', '\bmunicipality\b'],
        'first_name'                 => ['\(first\)', '1\. name', 'child.*first', 'name.*first'],
        'middle_name'                => ['\(middle\)', 'child.*middle', 'name.*middle'],
        'last_name'                  => ['\(last\)', 'child.*last', 'name.*last'],
        'sex'                        => ['sex\(male', 'sex/male', '2\. sex', '\bsex\b'],
        'dob_day'                    => ['date of birth.*day', '\(day\)', 'dob.*day'],
        'dob_month'                  => ['\(month\)', 'dob.*month'],
        'dob_year'                   => ['\(year\)', 'dob.*year'],
        'place_of_birth_hospital'    => ['4\. place of birth', 'place of birth'],
        'place_of_birth_city'        => ['place.*city/municipality', 'birth.*city'],
        'place_of_birth_province'    => ['place.*province', 'birth.*province'],
        'type_of_birth'              => ['5a\. type of birth', 'type of birth'],
        'mother_first_name'          => ['7\. maiden.*first', 'maiden.*first', 'mother.*first'],
        'mother_middle_name'         => ['7\. maiden.*middle', 'maiden.*middle', 'mother.*middle'],
        'mother_last_name'           => ['7\. maiden.*last', 'maiden.*last', 'mother.*last'],
        'father_first_name'          => ['14\. name.*first', 'father.*first'],
        'father_middle_name'         => ['14\. name.*middle', 'father.*middle'],
        'father_last_name'           => ['14\. name.*last', 'father.*last'],
    ];

    private const SKIP_WORDS = [
        'OFFICE', 'GENERAL', 'REGISTRAR', 'CERTIFICATE', 'BIRTH', 'REPUBLIC', 'FORM', 
        'PHILIPPINES', 'DEPARTMENT', 'HEALTH', 'STATISTICS', 'AUTHORITY', 'MUNICIPAL', 
        'PROVINCIAL', 'CIVIL', 'REGISURY', 'REGISTRY', 'NUMBER'
    ];

    public function parseText(string $rawText): array
    {
        $fields = [];
        $detectedType = 'unknown';

        if (!trim($rawText)) {
            return ['detected_type' => $detectedType, 'extracted_fields' => $fields];
        }

        // ── 1. Detect Type ───────────────────────────────────────────────────
        $lower = strtolower($rawText);
        if (preg_match('/live\s*birth|birth\s*certificate/i', $rawText)) {
            $detectedType = 'birth';
        } elseif (preg_match('/death|deceased/i', $rawText)) {
            $detectedType = 'death';
        } elseif (preg_match('/marriage/i', $rawText)) {
            $detectedType = 'marriage';
        }

        // ── 2. Global Patterns (High Confidence) ────────────────────────────
        // Registry No: XXXX-XXXXXX
        if (preg_match('/\b(\d{4}-\d{3,10})\b/', $rawText, $m)) {
            $fields['registry_number'] = $m[1];
        }

        // ── 3. Anchor Extraction ─────────────────────────────────────────────
        $lines = array_values(array_filter(
            array_map('trim', preg_split('/\r?\n/', $rawText)),
            fn($l) => strlen($l) >= 2
        ));

        if ($detectedType === 'birth') {
            $fields = array_merge($fields, $this->extractByAnchors($lines, self::BIRTH_ANCHORS));
        }

        // ── 4. Fallback for Names ───────────────────────────────────────────
        if (empty($fields['first_name'])) {
            $names = $this->findNameCandidates($lines);
            if (count($names) >= 2) {
                $fields['first_name'] = $names[0];
                $fields['middle_name'] = $fields['middle_name'] ?? ($names[1] ?? '');
                $fields['last_name'] = $fields['last_name'] ?? ($names[2] ?? '');
            }
        }

        // ── 5. Normalization ────────────────────────────────────────────────
        if (!empty($fields['sex'])) {
            $s = strtoupper($fields['sex']);
            if (str_contains($s, 'FEM') || $s === 'F') $fields['sex'] = 'Female';
            else if (str_contains($s, 'MAL') || $s === 'M') $fields['sex'] = 'Male';
        }

        // Month fix
        if (!empty($fields['dob_month'])) {
            $fields['dob_month'] = $this->fixMonth($fields['dob_month']);
        }

        return [
            'detected_type'   => $detectedType,
            'extracted_fields' => array_filter($fields, fn($v) => trim((string)$v) !== ''),
        ];
    }

    private function extractByAnchors(array $lines, array $anchors): array
    {
        $fields = [];
        $count = count($lines);
        foreach ($anchors as $key => $patterns) {
            foreach ($patterns as $pattern) {
                for ($i = 0; $i < $count; $i++) {
                    if (!preg_match('#' . $pattern . '#i', $lines[$i])) continue;

                    // Try same line
                    $val = trim(preg_replace('#' . $pattern . '#i', '', $lines[$i]));
                    $val = preg_replace('/^[\s:|\-]+/', '', $val);
                    if (strlen($val) >= 2 && !$this->isLabel($val)) {
                        $fields[$key] = $this->clean($key, $val);
                        break 2;
                    }

                    // Try next 3 lines
                    for ($j = $i + 1; $j < $count && $j <= $i + 3; $j++) {
                        $val = trim($lines[$j]);
                        if (strlen($val) >= 2 && !$this->isLabel($val)) {
                            $fields[$key] = $this->clean($key, $val);
                            break 3;
                        }
                    }
                    break;
                }
            }
        }
        return $fields;
    }

    private function findNameCandidates(array $lines): array
    {
        $names = [];
        foreach ($lines as $line) {
            $u = strtoupper(trim($line));
            if (preg_match('/^[A-Z\s\-\.]{3,}$/', $u)) {
                $words = explode(' ', $u);
                if (!in_array($words[0], self::SKIP_WORDS) && !preg_match('/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i', $words[0])) {
                    $names[] = ucwords(strtolower($line));
                }
            }
            if (count($names) >= 3) break;
        }
        return $names;
    }

    private function isLabel(string $text): bool
    {
        $text = strtoupper(trim($text));
        if (in_array($text, self::SKIP_WORDS)) return true;
        $labels = ['PROVINCE', 'CITY', 'MUNICIPALITY', 'NAME', 'REGISTRY', 'SEX', 'BIRTH', 'DATE', 'PLACE', 'HOSPITAL'];
        foreach ($labels as $l) {
            if ($text === $l || str_starts_with($text, $l . ' ')) return true;
        }
        return false;
    }

    private function fixMonth(string $m): string
    {
        $map = ['jan'=>'January','feb'=>'February','mar'=>'March','apr'=>'April','may'=>'May','jun'=>'June','jul'=>'July','aug'=>'August','sep'=>'September','oct'=>'October','nov'=>'November','dec'=>'December'];
        $m = strtolower(trim($m));
        foreach ($map as $k => $v) if (str_starts_with($m, $k)) return $v;
        return ucfirst($m);
    }

    private function clean(string $key, string $val): string
    {
        $val = trim(preg_replace('/^[|\-=.:]+/', '', $val));
        if (str_contains($key, 'name')) return ucwords(strtolower(preg_replace('/\b\d+\b/', '', $val)));
        return $val;
    }
}
