import { NAIC_BARANGAYS, NAME_FIELDS } from './SharedConfig.js';

export const DeathConfig = [
    { section: 'Deceased Information', fields: [
        ...NAME_FIELDS(''),
        { key: 'sex', label: '2. Sex', type: 'select', options: ['Male', 'Female'], required: true, width: 'sm:col-span-1' },
        { key: 'date_of_death', label: '3. Date of Death', type: 'date', required: true, width: 'sm:col-span-1' },
        { key: 'date_of_birth', label: '4. Date of Birth', type: 'date', required: false, width: 'sm:col-span-1' },
        { key: 'age', label: '5. Age', type: 'text', required: false, width: 'sm:col-span-1' },
        { key: 'place_of_death', label: '6. Place of Death', type: 'text', required: false },
        { key: 'civil_status', label: '7. Civil Status', type: 'select', options: ['Single', 'Married', 'Widowed', 'Divorced'], required: false, width: 'sm:col-span-1' },
        { key: 'religion', label: '8. Religion', type: 'text', required: false, width: 'sm:col-span-1' },
        { key: 'citizenship', label: '9. Citizenship', type: 'text', required: false, width: 'sm:col-span-1' },
        { key: 'residence', label: '10. Residence', type: 'text', required: false },
        { key: 'occupation', label: '11. Occupation', type: 'text', required: false },
    ]},
    { section: 'Parents Information', fields: [
        ...NAME_FIELDS('father_'),
        ...NAME_FIELDS('mother_maiden_'),
    ]},
    { section: 'Medical Certificate', fields: [
        { key: 'cause_of_death', label: '19b. Cause of Death', type: 'text', required: false },
        { key: 'registry_number', label: 'Registry No.', type: 'text', required: true },
        { key: 'barangay', label: 'Barangay', type: 'select', options: NAIC_BARANGAYS, required: true },
    ]}
];
