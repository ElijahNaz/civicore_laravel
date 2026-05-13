<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <style>
        @page {
            margin: 0;
        }
        body {
            margin: 0;
            padding: 0;
            font-family: 'Helvetica', 'Arial', sans-serif;
            width: 210mm;
            height: 297mm;
        }
        .background-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
        }
        .field-value {
            position: absolute;
            font-size: 8.5pt;
            font-weight: bold;
            color: #000;
            white-space: nowrap;
            overflow: hidden;
            text-transform: uppercase;
            line-height: 1;
        }
    </style>
</head>
<body>
    @php
        $docType = $docType ?? $doc->detected_type ?? $doc->type ?? 'birth';
        $templatePath = \App\Services\TemplateConfigService::getTemplatePath($docType);
        
        $imagePath = '';
        if ($templatePath && file_exists($templatePath)) {
            $imagePath = $templatePath;
        } else {
            // ONLY fallback to original if NO template is defined for this type
            $originalPath = storage_path('app/public/' . $doc->file_path);
            $extension = strtolower(pathinfo($originalPath, PATHINFO_EXTENSION));
            
            if ($extension === 'pdf') {
                // Try to find the page image that actually has content
                $pageOnePath = str_replace('.pdf', '_page_1.jpg', $originalPath);
                $pageTwoPath = str_replace('.pdf', '_page_2.jpg', $originalPath);
                
                if (file_exists($pageOnePath)) {
                    $imagePath = $pageOnePath;
                } elseif (file_exists($pageTwoPath)) {
                    $imagePath = $pageTwoPath;
                }
            } else {
                $imagePath = $originalPath;
            }
        }

        $base64 = '';
        if (!empty($imagePath) && file_exists($imagePath)) {
            $ext = pathinfo($imagePath, PATHINFO_EXTENSION);
            // dompdf prefers jpg/png. If it's a pdf here, it still won't work in <img> tag.
            if (strtolower($ext) !== 'pdf') {
                $data = file_get_contents($imagePath);
                $base64 = 'data:image/' . $ext . ';base64,' . base64_encode($data);
            }
        }
    @endphp

    @if($base64)
        <img src="{{ $base64 }}" class="background-image">
    @endif

    @foreach($overlayFields as $field)
        @php
            $val = $fields[$field['key']] ?? '';
            // If empty, try to see if it's a sub-key
            if (empty($val)) {
                $cleanKey = str_replace(['child_', 'mother_', 'father_'], '', $field['key']);
                $val = $fields[$cleanKey] ?? '';
            }
            if (empty($val)) continue;

            $top = $field['y'] ?? ($field['roi'][1] ?? 0);
            $left = $field['x'] ?? ($field['roi'][0] ?? 0);
            $width = $field['w'] ?? (($field['roi'][2] ?? 0) - ($field['roi'][0] ?? 0));
        @endphp
        <div class="field-value" style="
            left: {{ $left * 100 }}%;
            top: {{ $top * 100 }}%;
            width: {{ $width * 100 }}%;
            text-align: left;
            padding-left: 2px;
            font-size: 8.5pt;
        ">
            {{ strtoupper($val) }}
        </div>
    @endforeach
</body>
</html>
