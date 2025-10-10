export const MOCK_VERBS = [
  {
    id: 1,
    infinitive: 'iri',
    english: 'to eat',
    conjugations: {
      present: { m: 'ana m eri', f: 'ana m eri', we: 'anyi na-eri', they: 'ha na-eri' },
      past: { m: 'e riri m', f: 'e riri m', we: 'anyi riri', they: 'ha riri' },
      future: { m: 'ga m eri', f: 'ga m eri', we: 'anyi ga-eri', they: 'ha ga-eri' }
    }
  },
  {
    id: 2,
    infinitive: 'ịgụ',
    english: 'to read',
    conjugations: {
      present: { m: 'ana m agụ', f: 'ana m agụ', we: 'anyi na-agụ', they: 'ha na-agụ' },
      past: { m: 'e gụrụ m', f: 'e gụrụ m', we: 'anyi gụrụ', they: 'ha gụrụ' },
      future: { m: 'ga m agụ', f: 'ga m agụ', we: 'anyi ga-agụ', they: 'ha ga-agụ' }
    }
  },
  {
    id: 3,
    infinitive: 'ịbịa',
    english: 'to come',
    conjugations: {
      present: { m: 'ana m abịa', f: 'ana m abịa', we: 'anyi na-abịa', they: 'ha na-abịa' },
      past: { m: 'abịara m', f: 'abịara m', we: 'anyi bịara', they: 'ha bịara' },
      future: { m: 'ga m abịa', f: 'ga m abịa', we: 'anyi ga-abịa', they: 'ha ga-abịa' }
    }
  }
];

export const PRONOUNS = [
  { key: 'm', label: 'I (m)', igbo: 'M/Mụ' },
  { key: 'f', label: 'I (f)', igbo: 'M/Mụ' },
  { key: 'we', label: 'We', igbo: 'Anyị' },
  { key: 'they', label: 'They', igbo: 'Ha' }
];

export const TENSES = [
  { key: 'present', label: 'Present' },
  { key: 'past', label: 'Past' },
  { key: 'future', label: 'Future' }
];