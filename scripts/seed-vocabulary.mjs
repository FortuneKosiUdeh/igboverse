#!/usr/bin/env node
/**
 * Igboverse — Vocabulary Seed Script
 *
 * Fetches words from IgboAPI for every curriculum theme and upserts
 * them into the Supabase `words` table. Run once before launch.
 *
 * Usage:
 *   node scripts/seed-vocabulary.mjs
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_IGBO_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Load .env.local manually (no dotenv dependency needed) ─────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');

try {
    const envFile = readFileSync(envPath, 'utf-8');
    for (const line of envFile.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        process.env[key] = val;
    }
} catch {
    console.error('❌  Could not read .env.local — make sure it exists');
    process.exit(1);
}

// ─── Validate env vars ───────────────────────────────────────────

const IGBO_API_KEY  = process.env.NEXT_PUBLIC_IGBO_API_KEY;
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!IGBO_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌  Missing env vars. Need:');
    console.error('    NEXT_PUBLIC_IGBO_API_KEY');
    console.error('    NEXT_PUBLIC_SUPABASE_URL');
    console.error('    SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// ─── Supabase client (service role — bypasses RLS) ───────────────

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Curriculum themes (mirrors src/lib/lesson/curriculum.ts) ────

const CURRICULUM = [
    {
        id: 'greetings',
        searchKeywords: ['good morning', 'hello', 'thank', 'please', 'welcome', 'good night', 'sorry'],
        wordClasses: ['INTJ', 'NNC', 'AV'],
    },
    {
        id: 'food-drink',
        searchKeywords: ['food', 'eat', 'water', 'drink', 'cook', 'yam', 'rice', 'pepper', 'meat', 'fish', 'oil', 'salt'],
        wordClasses: ['NNC', 'AV'],
    },
    {
        id: 'family',
        searchKeywords: ['mother', 'father', 'child', 'brother', 'sister', 'friend', 'person', 'woman', 'man', 'wife', 'husband'],
        wordClasses: ['NNC', 'NM'],
    },
    {
        id: 'core-verbs',
        searchKeywords: ['go', 'come', 'eat', 'see', 'buy', 'give', 'run', 'say', 'want', 'do', 'know', 'hear', 'take', 'bring', 'open', 'close'],
        wordClasses: ['AV'],
    },
    {
        id: 'body',
        searchKeywords: ['head', 'hand', 'eye', 'mouth', 'body', 'leg', 'ear', 'nose', 'stomach', 'back', 'tooth'],
        wordClasses: ['NNC'],
    },
    {
        id: 'home-places',
        searchKeywords: ['house', 'door', 'market', 'school', 'church', 'road', 'village', 'town', 'bed', 'room', 'land'],
        wordClasses: ['NNC'],
    },
    {
        id: 'nature',
        searchKeywords: ['dog', 'cat', 'bird', 'tree', 'fire', 'rain', 'sun', 'moon', 'goat', 'chicken', 'river'],
        wordClasses: ['NNC', 'AV'],
    },
    {
        id: 'time-numbers',
        searchKeywords: ['one', 'two', 'three', 'four', 'five', 'day', 'night', 'morning', 'year', 'today', 'tomorrow', 'week'],
        wordClasses: ['NNC', 'CD', 'ADV'],
    },
    {
        id: 'emotions',
        searchKeywords: ['happy', 'sad', 'angry', 'fear', 'love', 'hate', 'laugh', 'cry', 'worry', 'tired'],
        wordClasses: ['AV', 'ADJ', 'NNC'],
    },
    {
        id: 'clothing',
        searchKeywords: ['cloth', 'shoe', 'hat', 'dress', 'wear', 'red', 'white', 'black', 'beautiful', 'big', 'small'],
        wordClasses: ['NNC', 'AV', 'ADJ'],
    },
];

// ─── IgboAPI fetch ───────────────────────────────────────────────

const API_BASE = 'https://igboapi.com/api/v1';

async function fetchFromIgboAPI(keyword) {
    const params = new URLSearchParams({
        keyword,
        examples: 'true',
        dialects: 'true',
        limit: '24',            // max per request to avoid huge payloads
    });
    const url = `${API_BASE}/words?${params}`;

    try {
        const res = await fetch(url, {
            headers: { 'X-API-Key': IGBO_API_KEY },
        });
        if (!res.ok) {
            console.warn(`    ⚠  IgboAPI ${res.status} for "${keyword}"`);
            return [];
        }
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.warn(`    ⚠  Network error for "${keyword}": ${err.message}`);
        return [];
    }
}

// ─── Transform raw API word → our DB schema ──────────────────────

function toDbRow(raw, themeId) {
    const word = raw.word;
    const defs = raw.definitions;

    if (!word || !Array.isArray(defs) || defs.length === 0) return null;
    if (defs[0].split(/\s+/).length > 15) return null;           // too abstract
    if (word.startsWith('-') || word.startsWith('(')) return null; // suffixes/prefixes

    const examples = (raw.examples || [])
        .filter(ex => ex.igbo && ex.english)
        .map(ex => ({
            igbo: ex.igbo,
            english: ex.english,
            pronunciation: ex.pronunciation || null,
        }));

    const dialects = raw.dialects
        ? Object.values(raw.dialects)
            .filter(d => d?.word)
            .map(d => ({
                word: d.word,
                pronunciation: d.pronunciation || null,
                communities: d.dialects || [],
            }))
        : [];

    return {
        id:         raw._id || `word-${word}`,
        word:       word,
        word_class: raw.wordClass || 'NNC',
        definitions: defs,
        audio_url:  raw.pronunciation || null,
        theme_ids:  [themeId],   // will be merged if word appears in multiple themes
        examples,
        dialects,
    };
}

// ─── Upsert in batches ───────────────────────────────────────────

async function upsertBatch(rows) {
    if (rows.length === 0) return 0;

    // First check which words already exist (to merge theme_ids)
    const words = rows.map(r => r.word);
    const { data: existing } = await supabase
        .from('words')
        .select('id, word, theme_ids')
        .in('word', words);

    const existingMap = new Map((existing || []).map(e => [e.word, e]));

    // Merge theme_ids for words that already exist in the DB
    const mergedRows = rows.map(row => {
        const prev = existingMap.get(row.word);
        if (prev) {
            const merged = Array.from(new Set([...prev.theme_ids, ...row.theme_ids]));
            return { ...row, theme_ids: merged };
        }
        return row;
    });

    const { error } = await supabase
        .from('words')
        .upsert(mergedRows, { onConflict: 'word' });

    if (error) {
        console.error('    ❌  Upsert error:', error.message);
        return 0;
    }
    return mergedRows.length;
}

// ─── Small delay to stay within IgboAPI rate limits ─────────────

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Main ────────────────────────────────────────────────────────

async function seed() {
    console.log('\n🌱  Igboverse Vocabulary Seed');
    console.log('━'.repeat(44));

    let totalInserted = 0;
    const allThemeResults = [];

    for (const theme of CURRICULUM) {
        console.log(`\n📚  Theme: ${theme.id}`);
        const seen = new Set();
        const rows = [];

        for (const keyword of theme.searchKeywords) {
            process.stdout.write(`    Fetching "${keyword}"... `);
            const raw = await fetchFromIgboAPI(keyword);
            process.stdout.write(`${raw.length} results\n`);

            for (const item of raw) {
                const row = toDbRow(item, theme.id);
                if (!row) continue;
                if (seen.has(row.word)) continue;

                // Filter by word class if theme specifies it
                if (theme.wordClasses.length > 0 && !theme.wordClasses.includes(row.word_class)) {
                    continue;
                }

                seen.add(row.word);
                rows.push(row);
            }

            // Small delay between keyword requests (~200ms)
            await sleep(200);
        }

        // Upsert this theme's words in batches of 50
        let themeCount = 0;
        for (let i = 0; i < rows.length; i += 50) {
            const batch = rows.slice(i, i + 50);
            themeCount += await upsertBatch(batch);
        }

        console.log(`    ✅  ${themeCount} words upserted for "${theme.id}"`);
        totalInserted += themeCount;
        allThemeResults.push({ theme: theme.id, count: themeCount });

        // Longer pause between themes to be gentle on IgboAPI
        await sleep(500);
    }

    // ─── Summary ─────────────────────────────────────────────────

    console.log('\n' + '━'.repeat(44));
    console.log('📊  Summary:\n');
    for (const r of allThemeResults) {
        const bar = '█'.repeat(Math.min(Math.ceil(r.count / 2), 20));
        console.log(`  ${r.theme.padEnd(16)} ${String(r.count).padStart(3)} words  ${bar}`);
    }
    console.log('\n' + '━'.repeat(44));
    console.log(`🎉  Total words in database: ${totalInserted}`);
    console.log('    (Words shared across themes are counted once per theme)\n');
}

seed().catch(err => {
    console.error('\n❌  Seed failed:', err);
    process.exit(1);
});
