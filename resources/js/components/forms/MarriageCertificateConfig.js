import { NAIC_BARANGAYS, NAME_FIELDS } from './SharedConfig.js';

export const MarriageConfig = [
    { section: "Husband's Profile", fields: NAME_FIELDS('husband_') },
    { section: "Wife's Profile", fields: NAME_FIELDS('wife_') },
    { section: 'Registry Details', fields: [
        { key: 'date_of_marriage', label: 'Date of Marriage', type: 'date', required: false },
        { key: 'place_of_marriage', label: 'Place of Marriage', type: 'text', required: false },
        { key: 'registry_number', label: 'Registry No.', type: 'text', required: true },
        { key: 'barangay', label: 'Barangay', type: 'select', options: NAIC_BARANGAYS, required: true },
    ]}
];
