<?php

namespace App\Services;

/**
 * OcrParserService — Anchor-Based Text Extraction
 * ================================================
 * Instead of fixed coordinate boxes (which break when scan size/rotation changes),
 * this parser uses a "label → value" anchor strategy:
 *
 *   1. Split OCR text into clean lines
 *   2. For each known label keyword, find it in the text
 *   3. Grab the text that is directly AFTER it (same line, or next non-empty line)
 *   4. Apply a field-specific cleaning step to remove OCR noise
 *
 * This approach works regardless of DPI, scan size, or slight rotation because
 * we're searching for the CONTENT of the label, not its pixel position.
 *
 * Author note: This replaced a fragile Zonal ROI system that used fixed
 * percentage coordinates (x1,y1,x2,y2) from roi_profiles.json. The ROI system
 * required exact calibration per-document and broke on any size variation.
 */
class OcrParserService
{
    // ── Known label strings for each field ───────────────────────────────────
    // Each entry maps a field key to an array of label patterns to search for.
    // Patterns are checked case-insensitively in order.
    private const BIRTH_ANCHORS = [
        'registry_number'            => ['registry no', 'registry number', 'regis', 'reg. no'],
        'province'                   => ['province'],
        'city_municipality'          => ['city/municipality', 'city municipality', 'municipality'],
        'first_name'                 => ['(first)', '1. name', 'child.*first', 'name.*first'],
        'middle_name'                => ['(middle)', 'child.*middle', 'name.*middle'],
        'last_name'                  => ['(last)', 'child.*last', 'name.*last'],
        'sex'                        => ['sex(male', 'sex/male', '2. sex', 'sex'],
        'dob_day'                    => ['date of birth.*day', '(day)', 'dob.*day'],
        'dob_month'                  => ['(month)', 'dob.*month'],
        'dob_year'                   => ['(year)', 'dob.*year'],
        'place_of_birth_hospital'    => ['4. place of birth', 'place of birth'],
        'place_of_birth_city'        => ['place.*city/municipality', 'birth.*city'],
        'place_of_birth_province'    => ['place.*province', 'birth.*province'],
        'type_of_birth'              => ['5a. type of birth', 'type of birth'],
        'multiple_birth_order'       => ['5b. if multiple', 'multiple birth'],
        'birth_order'                => ['5c. birth order', 'birth order'],
        'weight_at_birth'            => ['6. weight', 'weight at birth'],
        'mother_first_name'          => ['7. maiden.*first', 'maiden.*first', 'mother.*first'],
        'mother_middle_name'         => ['7. maiden.*middle', 'maiden.*middle', 'mother.*middle'],
        'mother_last_name'           => ['7. maiden.*last', 'maiden.*last', 'mother.*last'],
        'mother_citizenship'         => ['8. citizenship', 'mother.*citizenship'],
        'mother_religion'            => ['9. religion', 'mother.*religion'],
        'mother_children_total'      => ['10a. total', 'total.*children'],
        'mother_children_living'     => ['10b.*living', 'children.*living'],
        'mother_children_dead'       => ['10c.*dead', 'children.*dead'],
        'mother_occupation'          => ['11. occupation', 'mother.*occupation'],
        'mother_age'                 => ['12. age.*time.*birth', 'mother.*age'],
        'mother_residence_house'     => ['13. residence.*house', 'mother.*residence'],
        'father_first_name'          => ['14. name.*first', 'father.*first'],
        'father_middle_name'         => ['14. name.*middle', 'father.*middle'],
        'father_last_name'           => ['14. name.*last', 'father.*last'],
        'father_citizenship'         => ['15. citizenship', 'father.*citizenship'],
        'father_religion'            => ['16. religion', 'father.*religion'],
        'father_occupation'          => ['17. occupation', 'father.*occupation'],
        'father_age'                 => ['18. age', 'father.*age'],
        'father_residence_house'     => ['19. residence.*house', 'father.*residence'],
        'marriage_parents_day'       => ['20a. date.*day', 'marriage.*day'],
        'marriage_parents_month'     => ['20a. date.*month', 'marriage.*month'],
        'marriage_parents_year'      => ['20a. date.*year', 'marriage.*year'],
        'marriage_parents_place_city'=> ['20b. place.*city', 'marriage.*place.*city'],
    ];

    // Month name corrections — OCR frequently drops the first letter
    private const MONTH_FIX = [
        '/^[aA]nuary/i' => 'January',
        '/^[eE]bruary/i' => 'February',
        '/^[aA]rch/i' => 'March',
        '/^[pP]ril/i' => 'April',
        '/^[uU]ne/i' => 'June',
        '/^[uU]ly/i' => 'July',
        '/^[uU]gust/i' => 'August',
        '/^[eE]ptember/i' => 'September',
        '/^[cC]tober/i' => 'October',
        '/^[oO]vember/i' => 'November',
        '/^[eE]cember/i' => 'December',
    ];

    public function parseText(string $rawText): array
    {
        $fields = [];
        $detectedType = 'unknown';

        if (!trim($rawText)) {
            return ['detected_type' => $detectedType, 'extracted_fields' => $fields];
        }

        // ── 1. Detect document type ──────────────────────────────────────────
        $lower = strtolower($rawText);
        if (str_contains($lower, 'live birth') || str_contains($lower, 'certificate of birth')) {
            $detectedType = 'birth';
        } elseif (str_contains($lower, 'certificate of death') || str_contains($lower, 'cause of death')) {
            $detectedType = 'death';
        } elseif (str_contains($lower, 'certificate of marriage') || str_contains($lower, 'marriage license')) {
            $detectedType = 'marriage';
        }

        // ── 2. Split into clean lines ────────────────────────────────────────
        $lines = array_values(array_filter(
            array_map('trim', preg_split('/\r?\n/', $rawText)),
            fn($l) => strlen($l) >= 2
        ));

        // ── 3. Anchor-based extraction ───────────────────────────────────────
        if ($detectedType === 'birth') {
            $fields = $this->extractByAnchors($lines, self::BIRTH_ANCHORS);
        }

        // ── 4. Heuristic fallback for names (OCR often reads them as bare lines) ──
        // If name fields are empty, try to find VENTURA-style all-caps name blobs
        // that appear near the top of the form
        if (empty($fields['last_name']) || empty($fields['first_name'])) {
            $nameCandidates = $this->findNameCandidates($lines);
            if (!empty($nameCandidates)) {
                $fields['first_name']  = $fields['first_name']  ?? ($nameCandidates[0] ?? '');
                $fields['middle_name'] = $fields['middle_name'] ?? ($nameCandidates[1] ?? '');
                $fields['last_name']   = $fields['last_name']   ?? ($nameCandidates[2] ?? '');
            }
        }

        // ── 5. Sex field normalization ───────────────────────────────────────
        if (!empty($fields['sex'])) {
            $s = strtoupper($fields['sex']);
            if (str_contains($s, 'FEM') || $s === 'F') {
                $fields['sex'] = 'Female';
            } elseif (str_contains($s, 'MAL') || $s === 'M') {
                $fields['sex'] = 'Male';
            }
        } else {
            // Scan for standalone MALE/FEMALE line
            foreach ($lines as $line) {
                if (preg_match('/^\s*(MALE|FEMALE)\s*$/i', $line, $m)) {
                    $fields['sex'] = ucfirst(strtolower($m[1]));
                    break;
                }
            }
        }

        // ── 6. Registry number fallback ──────────────────────────────────────
        if (empty($fields['registry_number'])) {
            foreach ($lines as $line) {
                if (preg_match('/\b(\d{4}-\d{3,6})\b/', $line, $m)) {
                    $fields['registry_number'] = $m[1];
                    break;
                }
            }
        }

        // ── 7. Month fix ──────────────────────────────────────────────────────
        if (!empty($fields['dob_month'])) {
            foreach (self::MONTH_FIX as $pattern => $replacement) {
                if (preg_match($pattern, $fields['dob_month'])) {
                    $fields['dob_month'] = $replacement;
                    break;
                }
            }
        } else {
            // Scan all lines for a standalone month name
            $months = 'january|february|march|april|may|june|july|august|september|october|november|december';
            foreach ($lines as $line) {
                if (preg_match('/\b(' . $months . ')\b/i', $line, $m)) {
                    $fields['dob_month'] = ucfirst(strtolower($m[1]));
                    break;
                }
            }
        }

        // ── 8. Year fallback ──────────────────────────────────────────────────
        if (empty($fields['dob_year'])) {
            foreach ($lines as $line) {
                if (preg_match('/\b(19\d{2}|20[012]\d)\b/', $line, $m)) {
                    $fields['dob_year'] = $m[1];
                    break;
                }
            }
        }

        // Clean up empty values
        $fields = array_filter($fields, fn($v) => trim((string)$v) !== '');

        return [
            'detected_type'   => $detectedType,
            'extracted_fields' => $fields,
        ];
    }

    /**
     * For each anchor pattern, scan lines for a match, then grab the value
     * that appears either on the same line (after a colon/tab) or on the next line.
     */
    private function extractByAnchors(array $lines, array $anchors): array
    {
        $fields = [];
        $lineCount = count($lines);

        foreach ($anchors as $fieldKey => $patterns) {
            foreach ($patterns as $pattern) {
                for ($i = 0; $i < $lineCount; $i++) {
                    if (!preg_match('/' . $pattern . '/i', $lines[$i])) {
                        continue;
                    }

                    // Try same-line value (text after colon, pipe, or tab)
                    $sameLine = preg_replace('/' . $pattern . '/i', '', $lines[$i]);
                    $sameLine = preg_replace('/^[\s:|\-]+/', '', $sameLine);
                    $sameLine = trim($sameLine);

                    if (strlen($sameLine) >= 2 && !$this->isLabel($sameLine)) {
                        $fields[$fieldKey] = $this->cleanValue($fieldKey, $sameLine);
                        break 2;
                    }

                    // Try next non-empty line
                    for ($j = $i + 1; $j < $lineCount && $j <= $i + 3; $j++) {
                        $nextLine = trim($lines[$j]);
                        if (strlen($nextLine) >= 2 && !$this->isLabel($nextLine)) {
                            $fields[$fieldKey] = $this->cleanValue($fieldKey, $nextLine);
                            break 3;
                        }
                    }
                    break;
                }
            }
        }

        return $fields;
    }

    /**
     * Find name candidates: all-caps words that look like Filipino names.
     * Used as fallback when anchor search finds nothing.
     */
    private function findNameCandidates(array $lines): array
    {
        $candidates = [];
        // Look for lines that are all-uppercase words, likely in the name section
        // (skip form header words like OFFICE, CERTIFICATE, REPUBLIC, etc.)
        $skipWords = ['OFFICE', 'CERTIFICATE', 'REPUBLIC', 'PHILIPPINES', 'BIRTH',
                      'DEATH', 'MARRIAGE', 'PROVINCIAL', 'MUNICIPAL', 'CIVIL',
                      'REGISTRAR', 'GENERAL', 'DEPARTMENT', 'HEALTH', 'FORM', 'NO'];

        foreach ($lines as $line) {
            $clean = trim($line);
            // Must be mostly letters, 3-30 chars, no digits
            if (preg_match('/^[A-Z][A-Z\s\-\.]{2,28}$/', $clean)) {
                $words = explode(' ', $clean);
                $isSkip = false;
                foreach ($words as $w) {
                    if (in_array($w, $skipWords)) {
                        $isSkip = true;
                        break;
                    }
                }
                if (!$isSkip) {
                    $candidates[] = ucwords(strtolower($clean));
                }
            }
            if (count($candidates) >= 3) break;
        }

        return $candidates;
    }

    /**
     * Returns true if a string looks like a form label rather than a value.
     */
    private function isLabel(string $text): bool
    {
        $labelWords = [
            'province', 'city', 'municipality', 'registry', 'sex', 'name',
            'first', 'middle', 'last', 'date', 'birth', 'place', 'hospital',
            'mother', 'father', 'citizenship', 'religion', 'occupation', 'age',
            'residence', 'marriage', 'attendant', 'weight', 'order', 'type',
            'maiden', 'barangay', 'country', 'accomplishment', 'certification',
        ];
        $lower = strtolower($text);
        foreach ($labelWords as $label) {
            if ($lower === $label || str_starts_with($lower, $label . ' ')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Field-specific value cleaning.
     */
    private function cleanValue(string $fieldKey, string $value): string
    {
        $value = trim($value);

        // Strip leading noise chars
        $value = preg_replace('/^[|\-=.:]+/', '', $value);
        $value = trim($value);

        if (str_contains($fieldKey, 'name')) {
            // Remove isolated digits, title case
            $value = preg_replace('/\b\d{1,2}\b/', '', $value);
            $value = trim(preg_replace('/\s+/', ' ', $value));
            $value = ucwords(strtolower($value));
        }

        if ($fieldKey === 'registry_number') {
            $value = preg_replace('/[^A-Za-z0-9\-]/', '', $value);
        }

        if ($fieldKey === 'dob_year') {
            preg_match('/\b(19\d{2}|20[012]\d)\b/', $value, $m);
            $value = $m[1] ?? $value;
        }

        if ($fieldKey === 'dob_day') {
            preg_match('/\b(\d{1,2})\b/', $value, $m);
            $value = $m[1] ?? $value;
        }

        return trim($value);
    }
}
