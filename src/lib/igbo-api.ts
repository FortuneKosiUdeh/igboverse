import { Verb } from './drills/VerbDrillEngine';
import { StructureQuestion } from './drills/StructureDrillEngine';
import { DialectVariant, COMMUNITY_TO_GROUP, resolveGroups } from './dialect';

const IGBO_API_BASE_URL = 'https://igboapi.com/api/v1';
const IGBO_API_KEY = process.env.NEXT_PUBLIC_IGBO_API_KEY;

// --- Fallback Verbs (used when API is unreachable) ---

const FALLBACK_VERBS = [
  {
    infinitive: 'Ịbịa',
    english: 'to come',
    examples: [
      { igbo: 'Ha ga-abịa echi', english: 'They will come tomorrow' },
      { igbo: 'Biko bịa ebe a', english: 'Please come here' }
    ]
  },
  {
    infinitive: 'Ịri',
    english: 'to eat',
    examples: [
      { igbo: 'Ana m eri nri', english: 'I am eating food' },
      { igbo: 'Anyị riri ji', english: 'We ate yam' }
    ]
  },
  {
    infinitive: 'Ịga',
    english: 'to go',
    examples: [
      { igbo: 'Anyị na-eje ahịa', english: 'We are going to the market' },
      { igbo: 'Gaa n\'ụlọ', english: 'Go home' }
    ]
  },
  {
    infinitive: 'Ịhụ',
    english: 'to see',
    examples: [
      { igbo: 'Ahụrụ m ya', english: 'I saw him' }
    ]
  },
  {
    infinitive: 'Ịzụ',
    english: 'to buy',
    examples: [
      { igbo: 'Zụọ akwa ọhụrụ', english: 'Buy new clothes' }
    ]
  },
  { infinitive: 'Ịbụ', english: 'to be', examples: [] },
  { infinitive: 'Ịchọ', english: 'to want', examples: [] },
  { infinitive: 'Ịgwa', english: 'to tell', examples: [] },
  { infinitive: 'Ịhapụ', english: 'to leave', examples: [] },
  { infinitive: 'Ịma', english: 'to know', examples: [] },
  { infinitive: 'Ịme', english: 'to do', examples: [] },
  { infinitive: 'Ịnye', english: 'to give', examples: [] },
  { infinitive: 'Ịrụ', english: 'to work', examples: [] },
  { infinitive: 'Ịsị', english: 'to say', examples: [] },
  { infinitive: 'Ịta', english: 'to chew', examples: [] },
  { infinitive: 'Ịtụ', english: 'to throw', examples: [] },
  { infinitive: 'Ịza', english: 'to answer', examples: [] },
  { infinitive: 'Ịgba', english: 'to run', examples: [] },
  { infinitive: 'Ịnụ', english: 'to hear', examples: [] },
  { infinitive: 'Ịhụ n\'anya', english: 'to love', examples: [] },
  { infinitive: 'Ịmụ', english: 'to learn', examples: [] },
  { infinitive: 'Ịkụzi', english: 'to teach', examples: [] }
];

// --- API Word Entry (matches live IgboAPI v1 response schema) ---

interface APIDialectEntry {
  word: string;
  dialects: string[];       // Community names: ["Owere", "Mbaise"]
  pronunciation: string;    // Dialect-specific audio URL
  variations: string[];
  _id: string;
}

interface APITenses {
  infinitive: string | null;
  imperative: string | null;
  simplePast: string | null;
  simplePresent: string | null;
  presentContinuous: string | null;
  presentPassive: string | null;
  future: string | null;
}

interface APIWordEntry {
  id: string;
  word: string;
  definitions: string[];
  pronunciation?: string;
  wordClass?: string;
  examples?: { igbo: string; english: string; pronunciation?: string }[];
  tenses?: APITenses;
  dialects?: Record<string, APIDialectEntry>;
  attributes?: {
    isStandardIgbo?: boolean;
    isAccented?: boolean;
    isSlang?: boolean;
    isConstructedTerm?: boolean;
    isBorrowedTerm?: boolean;
    isStem?: boolean;
    isCommon?: boolean;
  };
  [key: string]: any;
}

// --- Verb Generation ---

/**
 * Converts an API word entry to an internal Verb with dialect variants.
 *
 * Conjugation: Uses API tenses when available, falls back to vowel-harmony generation.
 * Dialects: Parsed from the `dialects` field; each variant gets resolved to regional groups.
 */
function generateVerb(entry: APIWordEntry, id: number): Verb {
  const root = entry.word;
  let cleanRoot = root.trim();

  // Strip infinitive prefix if present
  if (
    (cleanRoot.startsWith('Ị') || cleanRoot.startsWith('I') ||
      cleanRoot.startsWith('ị') || cleanRoot.startsWith('i')) &&
    cleanRoot.length > 2
  ) {
    cleanRoot = cleanRoot.substring(1);
  }

  // Vowel Harmony Logic for fallback conjugation
  const vowels = ['a', 'e', 'i', 'o', 'u', 'ị', 'ọ', 'ụ'];
  const parts = cleanRoot.split(' ');
  const verbPart = parts[0];
  const objectPart = parts.slice(1).join(' ');

  let lastVowel = 'a';
  for (let i = verbPart.length - 1; i >= 0; i--) {
    const c = verbPart[i].toLowerCase();
    if (vowels.includes(c)) {
      lastVowel = c;
      break;
    }
  }

  const lightGroup = ['a', 'ị', 'ọ', 'ụ'];
  const isLight = lightGroup.includes(lastVowel);
  const prefix = isLight ? 'a' : 'e';
  const presentPrefix = isLight ? 'na-a' : 'na-e';
  const futurePrefix = isLight ? 'ga-a' : 'ga-e';
  const pastVerb = `${verbPart}r${lastVowel}`;

  // Infinitive display
  const displayInfinitive =
    (entry.word.startsWith('I') || entry.word.startsWith('Ị') ||
      entry.word.startsWith('i') || entry.word.startsWith('ị'))
      ? entry.word
      : (isLight ? 'Ị' : 'I') + entry.word;

  const englishDef =
    entry.definitions && entry.definitions.length > 0
      ? entry.definitions[0]
      : 'to ???';

  // --- Use API tenses when available, fallback to generated ---
  const obj = objectPart ? ' ' + objectPart : '';
  const conjugations = {
    present: {
      m: entry.tenses?.simplePresent
        ? `Ana m ${prefix}${verbPart}${obj}`
        : `Ana m ${prefix}${verbPart}${obj}`,
      f: `Ana m ${prefix}${verbPart}${obj}`,
      we: entry.tenses?.simplePresent
        ? `Anyị ${presentPrefix}${verbPart}${obj}`
        : `Anyị ${presentPrefix}${verbPart}${obj}`,
      they: `Ha ${presentPrefix}${verbPart}${obj}`
    },
    past: {
      m: entry.tenses?.simplePast
        ? `${pastVerb} m${obj}`
        : `${pastVerb} m${obj}`,
      f: `${pastVerb} m${obj}`,
      we: `Anyị ${pastVerb}${obj}`,
      they: `Ha ${pastVerb}${obj}`
    },
    future: {
      m: entry.tenses?.future
        ? `Aga m ${prefix}${verbPart}${obj}`
        : `Aga m ${prefix}${verbPart}${obj}`,
      f: `Aga m ${prefix}${verbPart}${obj}`,
      we: `Anyị ${futurePrefix}${verbPart}${obj}`,
      they: `Ha ${futurePrefix}${verbPart}${obj}`
    }
  };

  // --- Parse dialect variants ---
  const dialectVariants: DialectVariant[] = [];

  if (entry.dialects && typeof entry.dialects === 'object') {
    for (const [, variantData] of Object.entries(entry.dialects)) {
      if (!variantData || !variantData.word) continue;

      const communities = variantData.dialects || [];
      const groups = resolveGroups(communities);

      dialectVariants.push({
        word: variantData.word,
        pronunciation: variantData.pronunciation || null,
        communities,
        groups
      });
    }
  }

  return {
    id,
    infinitive: displayInfinitive,
    english: englishDef,
    audioUrl: entry.pronunciation || null,
    examples: entry.examples || [],
    dialectVariants,
    conjugations
  };
}

// --- In-memory cache ---
let verbsCache: Verb[] = [];
let questionsCache: StructureQuestion[] = [];

// --- API Fetch Helper ---

async function fetchFromApi(endpoint: string, params: Record<string, string>): Promise<any> {
  const query = new URLSearchParams(params).toString();
  const url = `${IGBO_API_BASE_URL}${endpoint}?${query}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (IGBO_API_KEY) {
    headers['X-API-Key'] = IGBO_API_KEY;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}

// --- Public API: getVerbs ---

export const getVerbs = async (): Promise<Verb[]> => {
  if (verbsCache.length > 0) return verbsCache;

  try {
    // Always request dialects + examples from API
    const results = await Promise.allSettled([
      fetchFromApi('/words', { keyword: 'a', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'i', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'me', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'ga', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'bi', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'kp', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'come', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'eat', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'go', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'see', wordClass: 'verb', dialects: 'true', examples: 'true' }),
      fetchFromApi('/words', { keyword: 'buy', wordClass: 'verb', dialects: 'true', examples: 'true' }),
    ]);

    let allEntries: APIWordEntry[] = [];
    results.forEach(r => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        allEntries = [...allEntries, ...r.value];
      }
    });

    // Deduplicate by id (preferred) or word
    const seen = new Map<string, APIWordEntry>();
    allEntries.forEach(item => {
      const key = item.id || item.word;
      if (!seen.has(key)) seen.set(key, item);
    });
    const validEntries = Array.from(seen.values());

    // Transform
    verbsCache = validEntries.map((entry, idx) => generateVerb(entry, idx));

    if (verbsCache.length < 10) {
      console.warn('API returned too few verbs, adding fallback');
      const fallbackVerbs = FALLBACK_VERBS.map((v, i) =>
        generateVerb(
          {
            id: `fallback-${i}`,
            word: v.infinitive,
            definitions: [v.english],
            examples: v.examples
          } as APIWordEntry,
          i + 1000
        )
      );
      verbsCache = [...verbsCache, ...fallbackVerbs];
    }

    return verbsCache;
  } catch (error) {
    console.error('getVerbs failed:', error);
    // Full fallback
    const fallbackVerbs = FALLBACK_VERBS.map((v, i) =>
      generateVerb(
        {
          id: `fallback-${i}`,
          word: v.infinitive,
          definitions: [v.english],
          examples: v.examples
        } as APIWordEntry,
        i
      )
    );
    verbsCache = fallbackVerbs;
    return fallbackVerbs;
  }
};

// --- Public API: getStructureQuestions ---
// Structure exercises remain Standard Igbo only (verified API limitation).

function shuffleArray<T>(array: T[]): T[] {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

export const getStructureQuestions = async (): Promise<StructureQuestion[]> => {
  if (questionsCache.length > 0) return questionsCache;

  const verbs = await getVerbs();
  const questions: StructureQuestion[] = [];

  // Sentence Builder from Examples
  const exampleVerbs = verbs.filter(v => v.examples && v.examples.length > 0);

  exampleVerbs.forEach((v, idx) => {
    v.examples?.forEach((ex, exIdx) => {
      if (ex.igbo.split(' ').length > 8 || ex.igbo.split(' ').length < 3) return;

      const cleanIgbo = ex.igbo.trim().replace(/\s+/g, ' ');
      const segments = shuffleArray(cleanIgbo.split(' '));

      questions.push({
        id: `sb-${v.id}-${exIdx}`,
        type: 'sentence-builder',
        prompt: `Translate: "${ex.english}"`,
        segments,
        correctOrder: cleanIgbo.split(' ')
      });

      // Translation questions
      if (idx % 2 === 0 && exIdx === 0) {
        const distractors: string[] = [];
        for (let k = 0; k < 3; k++) {
          const rV = exampleVerbs[Math.floor(Math.random() * exampleVerbs.length)];
          const rE = rV.examples?.[0]?.english;
          if (rE && rE !== ex.english && !distractors.includes(rE)) {
            distractors.push(rE);
          }
        }
        if (distractors.length === 3) {
          const options = shuffleArray([ex.english, ...distractors]);
          questions.push({
            id: `tr-${v.id}-${exIdx}`,
            type: 'translation',
            prompt: `What matches: "${ex.igbo}"?`,
            options,
            correctAnswer: ex.english
          });
        }
      }
    });
  });

  questionsCache = shuffleArray(questions).slice(0, 50);

  // Fallback
  if (questionsCache.length === 0) {
    questionsCache.push({
      id: 'sb-fallback-1',
      type: 'sentence-builder',
      prompt: 'Translate: "We are going to the market"',
      segments: ['ahịa', 'Anyị', 'na-eje'],
      correctOrder: ['Anyị', 'na-eje', 'ahịa']
    });
  }

  return questionsCache;
};
