#!/usr/bin/env node
'use strict';
/**
 * Igboverse — Vocabulary Seed Script
 *
 * Uses Supabase's REST API directly (no JS client) to avoid the
 * @supabase/realtime-js WebSocket hang bug on Node 22.
 *
 * Usage:
 *   npm run seed
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── Load .env.local ─────────────────────────────────────────────

const envPath = path.join(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
}

const IGBO_KEY  = process.env.NEXT_PUBLIC_IGBO_API_KEY  || '';
const SB_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL  || '';
const SB_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!IGBO_KEY || !SB_URL || !SB_KEY) {
    console.error('❌  Missing env vars (IGBO_API_KEY / SUPABASE_URL / SERVICE_ROLE_KEY)');
    process.exit(1);
}

console.log('✅  Env loaded');
console.log(`    Supabase: ${SB_URL}\n`);

// ─── Minimal HTTP helpers ─────────────────────────────────────────

/** GET request → parsed JSON */
function httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers, timeout: 20000 }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
                catch { resolve({ status: res.statusCode, data: [] }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

/** POST request with JSON body → parsed JSON */
function httpPost(urlStr, headers = {}, body = []) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const parsed  = new URL(urlStr);
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
            method:   'POST',
            headers:  {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                ...headers,
            },
            timeout: 20000,
        };
        const req = https.request(options, (res) => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
                catch { resolve({ status: res.statusCode, data: null }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(payload);
        req.end();
    });
}

// ─── Supabase REST helpers ────────────────────────────────────────

const SB_REST   = `${SB_URL}/rest/v1`;
const SB_HEADERS = {
    'apikey':        SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Prefer':        'resolution=merge-duplicates',   // upsert behaviour
};

/** Fetch existing rows so we can merge theme_ids */
async function fetchExisting(words) {
    if (words.length === 0) return new Map();
    const list = words.map(w => `"${w.replace(/"/g, '\\"')}"`).join(',');
    const url  = `${SB_REST}/words?select=word,theme_ids&word=in.(${encodeURIComponent(words.join(','))})`;
    const { data } = await httpGet(url, { ...SB_HEADERS, 'Accept': 'application/json' });
    const map = new Map();
    if (Array.isArray(data)) data.forEach(r => map.set(r.word, r.theme_ids || []));
    return map;
}

/** Upsert a batch of word rows via POST /words with Prefer: resolution=merge-duplicates */
async function upsertBatch(rows) {
    if (rows.length === 0) return 0;

    // Merge theme_ids with any existing rows
    const existingMap = await fetchExisting(rows.map(r => r.word));
    const merged = rows.map(row => {
        const prev    = existingMap.get(row.word) || [];
        const themeIds = Array.from(new Set([...prev, ...row.theme_ids]));
        return { ...row, theme_ids: themeIds };
    });

    const url = `${SB_REST}/words`;
    const headers = {
        ...SB_HEADERS,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    };

    const { status, data } = await httpPost(url, headers, merged);

    if (status >= 400) {
        console.error(`\n    ❌  Upsert HTTP ${status}:`, JSON.stringify(data).slice(0, 200));
        return 0;
    }
    return merged.length;
}

// ─── IgboAPI fetch ───────────────────────────────────────────────

const IGBO_BASE = 'https://igboapi.com/api/v1';

async function fetchFromIgboAPI(keyword) {
    const qs  = new URLSearchParams({ keyword, examples: 'true', dialects: 'true', limit: '24' });
    const url = `${IGBO_BASE}/words?${qs}`;
    try {
        const { status, data } = await httpGet(url, { 'X-API-Key': IGBO_KEY });
        if (status !== 200) { process.stdout.write(`⚠${status} `); return []; }
        return Array.isArray(data) ? data : [];
    } catch (e) {
        process.stdout.write(`⚠err `);
        return [];
    }
}

// ─── Transform raw API row → DB row ──────────────────────────────

function toDbRow(raw, themeId) {
    const word = raw.word;
    const defs = raw.definitions;
    if (!word || !Array.isArray(defs) || defs.length === 0) return null;
    if (typeof defs[0] !== 'string') return null;
    if (defs[0].split(/\s+/).length > 15) return null;
    if (word.startsWith('-') || word.startsWith('('))  return null;

    const examples = (raw.examples || [])
        .filter(ex => ex.igbo && ex.english)
        .map(ex => ({ igbo: ex.igbo, english: ex.english, pronunciation: ex.pronunciation || null }));

    const dialects = raw.dialects
        ? Object.values(raw.dialects)
            .filter(d => d && d.word)
            .map(d => ({ word: d.word, pronunciation: d.pronunciation || null, communities: d.dialects || [] }))
        : [];

    return {
        id:          raw._id || `word-${word}`,
        word,
        word_class:  raw.wordClass || 'NNC',
        definitions: defs.filter(d => typeof d === 'string'),
        audio_url:   raw.pronunciation || null,
        theme_ids:   [themeId],
        examples,
        dialects,
    };
}

// ─── Curriculum ───────────────────────────────────────────────────

const CURRICULUM = [
    { id: 'greetings',    wordClasses: ['INTJ','NNC','AV'],      searchKeywords: ['good morning','hello','thank','please','welcome','good night','sorry'] },
    { id: 'food-drink',   wordClasses: ['NNC','AV'],             searchKeywords: ['food','eat','water','drink','cook','yam','rice','pepper','meat','fish','oil','salt'] },
    { id: 'family',       wordClasses: ['NNC','NM'],             searchKeywords: ['mother','father','child','brother','sister','friend','person','woman','man','wife','husband'] },
    { id: 'core-verbs',   wordClasses: ['AV'],                   searchKeywords: ['go','come','eat','see','buy','give','run','say','want','do','know','hear','take','bring','open','close'] },
    { id: 'body',         wordClasses: ['NNC'],                  searchKeywords: ['head','hand','eye','mouth','body','leg','ear','nose','stomach','back','tooth'] },
    { id: 'home-places',  wordClasses: ['NNC'],                  searchKeywords: ['house','door','market','school','church','road','village','town','bed','room','land'] },
    { id: 'nature',       wordClasses: ['NNC','AV'],             searchKeywords: ['dog','cat','bird','tree','fire','rain','sun','moon','goat','chicken','river'] },
    { id: 'time-numbers', wordClasses: ['NNC','CD','ADV'],       searchKeywords: ['one','two','three','four','five','day','night','morning','year','today','tomorrow','week'] },
    { id: 'emotions',     wordClasses: ['AV','ADJ','NNC'],       searchKeywords: ['happy','sad','angry','fear','love','hate','laugh','cry','worry','tired'] },
    { id: 'clothing',     wordClasses: ['NNC','AV','ADJ'],       searchKeywords: ['cloth','shoe','hat','dress','wear','red','white','black','beautiful','big','small'] },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Main ────────────────────────────────────────────────────────

async function seed() {
    console.log('🌱  Igboverse Vocabulary Seed');
    console.log('━'.repeat(48));

    const summary  = [];
    let grandTotal = 0;

    for (const theme of CURRICULUM) {
        console.log(`\n📚  [${theme.id}]`);
        const seen = new Set();
        const rows = [];

        for (const keyword of theme.searchKeywords) {
            process.stdout.write(`    "${keyword}" → `);
            const raw = await fetchFromIgboAPI(keyword);
            let kept  = 0;

            for (const item of raw) {
                const row = toDbRow(item, theme.id);
                if (!row) continue;
                if (seen.has(row.word)) continue;
                if (theme.wordClasses.length && !theme.wordClasses.includes(row.word_class)) continue;
                seen.add(row.word);
                rows.push(row);
                kept++;
            }
            console.log(`${raw.length} fetched, ${kept} kept`);
            await sleep(300);
        }

        let themeTotal = 0;
        for (let i = 0; i < rows.length; i += 50) {
            themeTotal += await upsertBatch(rows.slice(i, i + 50));
        }

        const status = themeTotal > 0 ? '✅' : '⚠️ ';
        console.log(`    ${status}  ${themeTotal} words saved for [${theme.id}]`);
        summary.push({ theme: theme.id, count: themeTotal });
        grandTotal += themeTotal;
        await sleep(400);
    }

    console.log('\n' + '━'.repeat(48));
    console.log('📊  Summary:\n');
    for (const { theme, count } of summary) {
        const bar = '█'.repeat(Math.min(Math.round(count / 2), 24));
        console.log(`  ${theme.padEnd(16)} ${String(count).padStart(3)}  ${bar}`);
    }
    console.log('\n' + '━'.repeat(48));
    console.log(`🎉  Done! ${grandTotal} words upserted.\n`);
    console.log('    Verify in Supabase: Table Editor → words\n');
}

seed().catch(err => {
    console.error('\n❌  Fatal:', err.message || err);
    process.exit(1);
});
