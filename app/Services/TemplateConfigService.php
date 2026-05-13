<?php

namespace App\Services;

class TemplateConfigService
{
    public static function getFieldsForType($type)
    {
        if ($type === 'birth') {
            return [
                // REGISTRY DETAILS
                ['key' => 'registry_number', 'x' => 0.63, 'y' => 0.10, 'w' => 0.20, 'h' => 0.015],
                ['key' => 'province', 'x' => 0.22, 'y' => 0.095, 'w' => 0.34, 'h' => 0.015],
                ['key' => 'city_municipality', 'x' => 0.28, 'y' => 0.110, 'w' => 0.20, 'h' => 0.015],

                // CHILD
                ['key' => 'first_name', 'x' => 0.29, 'y' => 0.14, 'w' => 0.10, 'h' => 0.015],
                ['key' => 'middle_name', 'x' => 0.48, 'y' => 0.14, 'w' => 0.10, 'h' => 0.015],
                ['key' => 'last_name', 'x' => 0.67, 'y' => 0.14, 'w' => 0.10, 'h' => 0.015],
                ['key' => 'sex', 'x' => 0.20, 'y' => 0.16, 'w' => 0.10, 'h' => 0.015],
                ['key' => 'dob_day', 'x' => 0.53, 'y' => 0.16, 'w' => 0.06, 'h' => 0.015],
                ['key' => 'dob_month', 'x' => 0.63, 'y' => 0.16, 'w' => 0.10, 'h' => 0.015],
                ['key' => 'dob_year', 'x' => 0.76, 'y' => 0.16, 'w' => 0.08, 'h' => 0.015],
                ['key' => 'place_of_birth_hospital', 'x' => 0.25, 'y' => 0.19, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'place_of_birth_city', 'x' => 0.50, 'y' => 0.19, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'place_of_birth_province', 'x' => 0.69, 'y' => 0.19, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'type_of_birth', 'x' => 0.20, 'y' => 0.23, 'w' => 0.12, 'h' => 0.015],
                ['key' => 'multiple_birth_order', 'x' => 0.40, 'y' => 0.23, 'w' => 0.12, 'h' => 0.015],
                ['key' => 'birth_order', 'x' => 0.58, 'y' => 0.23, 'w' => 0.12, 'h' => 0.015],
                ['key' => 'weight_at_birth', 'x' => 0.75, 'y' => 0.23, 'w' => 0.05, 'h' => 0.015],

                // MOTHER
                ['key' => 'mother_first_name', 'x' => 0.26, 'y' => 0.26, 'w' => 0.14, 'h' => 0.015],
                ['key' => 'mother_middle_name', 'x' => 0.45, 'y' => 0.26, 'w' => 0.14, 'h' => 0.015],
                ['key' => 'mother_last_name', 'x' => 0.68, 'y' => 0.26, 'w' => 0.14, 'h' => 0.015],
                ['key' => 'mother_citizenship', 'x' => 0.19, 'y' => 0.28, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'mother_religion', 'x' => 0.53, 'y' => 0.28, 'w' => 0.20, 'h' => 0.015],
                ['key' => 'mother_children_total', 'x' => 0.18, 'y' => 0.31, 'w' => 0.09, 'h' => 0.015],
                ['key' => 'mother_children_living', 'x' => 0.31, 'y' => 0.31, 'w' => 0.09, 'h' => 0.015],
                ['key' => 'mother_children_dead', 'x' => 0.43, 'y' => 0.31, 'w' => 0.09, 'h' => 0.015],
                ['key' => 'mother_occupation', 'x' => 0.55, 'y' => 0.31, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'mother_age', 'x' => 0.76, 'y' => 0.31, 'w' => 0.10, 'h' => 0.015],
                ['key' => 'mother_residence_house', 'x' => 0.28, 'y' => 0.34, 'w' => 0.13, 'h' => 0.015],
                ['key' => 'mother_residence_city', 'x' => 0.45, 'y' => 0.34, 'w' => 0.13, 'h' => 0.015],
                ['key' => 'mother_residence_province', 'x' => 0.62, 'y' => 0.34, 'w' => 0.13, 'h' => 0.015],
                ['key' => 'mother_residence_country', 'x' => 0.76, 'y' => 0.34, 'w' => 0.10, 'h' => 0.015],

                // FATHER
                ['key' => 'father_first_name', 'x' => 0.27, 'y' => 0.37, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'father_middle_name', 'x' => 0.45, 'y' => 0.37, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'father_last_name', 'x' => 0.68, 'y' => 0.37, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'father_citizenship', 'x' => 0.18, 'y' => 0.40, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'father_religion', 'x' => 0.37, 'y' => 0.40, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'father_occupation', 'x' => 0.57, 'y' => 0.40, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'father_age', 'x' => 0.77, 'y' => 0.40, 'w' => 0.08, 'h' => 0.015],
                ['key' => 'father_residence_house', 'x' => 0.28, 'y' => 0.43, 'w' => 0.13, 'h' => 0.015],
                ['key' => 'father_residence_city', 'x' => 0.45, 'y' => 0.43, 'w' => 0.13, 'h' => 0.015],
                ['key' => 'father_residence_province', 'x' => 0.62, 'y' => 0.43, 'w' => 0.13, 'h' => 0.015],
                ['key' => 'father_residence_country', 'x' => 0.76, 'y' => 0.43, 'w' => 0.10, 'h' => 0.015],

                // MARRIAGE
                ['key' => 'marriage_parents_day', 'x' => 0.24, 'y' => 0.48, 'w' => 0.06, 'h' => 0.015],
                ['key' => 'marriage_parents_month', 'x' => 0.30, 'y' => 0.48, 'w' => 0.06, 'h' => 0.015],
                ['key' => 'marriage_parents_year', 'x' => 0.36, 'y' => 0.48, 'w' => 0.06, 'h' => 0.015],
                ['key' => 'marriage_parents_place_city', 'x' => 0.52, 'y' => 0.48, 'w' => 0.10, 'h' => 0.015],
                ['key' => 'marriage_parents_place_province', 'x' => 0.64, 'y' => 0.48, 'w' => 0.10, 'h' => 0.015],
                ['key' => 'marriage_parents_place_country', 'x' => 0.75, 'y' => 0.48, 'w' => 0.10, 'h' => 0.015],

                // ATTENDANT
                ['key' => 'attendant_type', 'x' => 0.17, 'y' => 0.51, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'attendant_time', 'x' => 0.65, 'y' => 0.51, 'w' => 0.15, 'h' => 0.015],
                ['key' => 'attendant_name', 'x' => 0.25, 'y' => 0.57, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'attendant_title', 'x' => 0.25, 'y' => 0.585, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'attendant_address', 'x' => 0.57, 'y' => 0.56, 'w' => 0.20, 'h' => 0.015],
                ['key' => 'attendant_date', 'x' => 0.55, 'y' => 0.585, 'w' => 0.20, 'h' => 0.015],

                // INFORMANT & OTHERS
                ['key' => 'informant_name', 'x' => 0.25, 'y' => 0.65, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'informant_relationship', 'x' => 0.29, 'y' => 0.667, 'w' => 0.21, 'h' => 0.015],
                ['key' => 'informant_address', 'x' => 0.22, 'y' => 0.684, 'w' => 0.28, 'h' => 0.015],
                ['key' => 'informant_date', 'x' => 0.21, 'y' => 0.70, 'w' => 0.20, 'h' => 0.015],
                ['key' => 'prepared_by_name', 'x' => 0.60, 'y' => 0.656, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'prepared_by_title', 'x' => 0.61, 'y' => 0.675, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'prepared_by_date', 'x' => 0.56, 'y' => 0.69, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'received_by_name', 'x' => 0.24, 'y' => 0.743, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'received_by_title', 'x' => 0.25, 'y' => 0.758, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'received_by_date', 'x' => 0.23, 'y' => 0.773, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'registered_by_name', 'x' => 0.60, 'y' => 0.743, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'registered_by_title', 'x' => 0.61, 'y' => 0.758, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'registered_by_date', 'x' => 0.56, 'y' => 0.773, 'w' => 0.25, 'h' => 0.015],
                ['key' => 'remarks', 'x' => 0.17, 'y' => 0.80, 'w' => 0.70, 'h' => 0.070],
            ];
        }
        
        return [];
    }
    
    public static function getTemplatePath($type)
    {
        $type = strtolower($type);
        if ($type === 'birth') {
            return base_path('Templates/certificate of live birth template_page_1.jpg');
        } elseif ($type === 'death') {
            return base_path('Templates/Certificate of death template_page_1.jpg');
        } elseif ($type === 'marriage' || $type === 'marriage_license') {
            // Handle the specific typo in the existing filename
            $path1 = base_path('Templates/certificate of marriage template_page_1.jpg');
            $path2 = base_path('Templates/certificate of marriage tempalte_page_1.jpg');
            if (file_exists($path1)) return $path1;
            if (file_exists($path2)) return $path2;
        }
        
        return null;
    }
}
