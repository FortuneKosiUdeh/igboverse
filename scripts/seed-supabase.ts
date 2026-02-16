import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// --- Type Definitions (match your JSON structure) ---
interface RawWord {
    word: string;
    definitions: { text: string; lang: string }[];
    wordClass: string;
    variations?: string[];
    examples?: { igbo: string; english: string }[];
}

// --- Main Seeding Function ---
async function seedDatabase() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Supabase URL or Service Role Key not found in .env.local file");
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('Reading local JSON files...');
    const wordsPath = path.join(__dirname, '../data/words.min.json');
    const verbsPath = path.join(__dirname, '../data/verbs.min.json');

    const wordsRaw = fs.readFileSync(wordsPath, 'utf-8');
    const verbsRaw = fs.readFileSync(verbsPath, 'utf-8');

    const wordsData: RawWord[] = JSON.parse(wordsRaw);
    const verbsData: RawWord[] = JSON.parse(verbsRaw);
    
    // Create a set of verb words for quick lookup
    const verbWordSet = new Set(verbsData.map(v => v.word));

    // Combine and transform data into the schema format
    const allWords = wordsData.map(wordObj => ({
        word: wordObj.word,
        word_class: wordObj.wordClass,
        definitions: wordObj.definitions,
        is_verb: verbWordSet.has(wordObj.word), // Set the boolean flag
        examples: wordObj.examples || [],
        variations: wordObj.variations || [],
        // Add other fields as needed, defaulting to null or empty values
        pronunciation_url: null,
        metadata: {}
    }));

    console.log(`Preparing to upsert ${allWords.length} words...`);

    // Use upsert to prevent duplicates. If a word already exists, it will be updated.
    // 'word' is the column we use to check for conflicts.
    const { data, error } = await supabase
        .from('words')
        .upsert(allWords, { onConflict: 'word' });

    if (error) {
        console.error('Error during upsert:', error);
        return;
    }

    console.log('Successfully seeded database!');
}

seedDatabase().catch(console.error);
