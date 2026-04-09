'use client';
/**
 * Word fetcher — DB-first with IgboAPI fallback.
 *
 * Strategy:
 *  1. Query Supabase `words` table WHERE theme_ids @> [theme.id]
 *     → If we get ≥3 words: return them (fast, offline-capable after first load)
 *  2. Fall back to IgboAPI (original live-fetch logic)
 *     → Auto-insert results into Supabase for next time
 *
 * Public API is unchanged — callers (IgboverseV2, lessonGenerator) need
 * no modifications.
 */

import { WordEntry, CurriculumTheme, ExampleSentence } from './types';
import { dbSelect, dbUpsert } from '../supabase';

const API_BASE = 'https://igboapi.com/api/v1';
const API_KEY  = process.env.NEXT_PUBLIC_IGBO_API_KEY;

// ─── In-memory cache (survives re-renders within a session) ──────

const wordCache = new Map<string, WordEntry[]>();

// ─── DB row type (matches our Supabase schema) ───────────────────

interface DbWord {
    id:          string;
    word:        string;
    word_class:  string;
    definitions: string[];
    audio_url:   string | null;
    theme_ids:   string[];
    examples:    { igbo: string; english: string; pronunciation?: string | null }[];
    dialects:    { word: string; pronunciation: string | null; communities: string[] }[];
}

// ─── Transform DB row → WordEntry ────────────────────────────────

function dbRowToWordEntry(row: DbWord): WordEntry {
    return {
        id:         row.id,
        word:       row.word,
        wordClass:  row.word_class,
        definitions: row.definitions,
        pronunciation: row.audio_url,
        examples: (row.examples || []).map((ex): ExampleSentence => ({
            igbo:          ex.igbo,
            english:       ex.english,
            pronunciation: ex.pronunciation ?? undefined,
        })),
        dialects: (row.dialects || []).map(d => ({
            word:          d.word,
            pronunciation: d.pronunciation,
            communities:   d.communities,
        })),
    };
}

// ─── Supabase fetch ───────────────────────────────────────────────

/**
 * Query Supabase for words belonging to this theme.
 * Uses the GIN-indexed `theme_ids @> ARRAY[theme.id]` query.
 * Returns [] on any error or when called server-side (caller falls back to IgboAPI).
 */
async function fetchThemeWordsFromDB(theme: CurriculumTheme): Promise<WordEntry[]> {
    if (typeof window === 'undefined') return [];
    try {
        // Use cs. (array contains) PostgREST operator for GIN-indexed theme_ids
        const { data, error } = await dbSelect<DbWord>('words', {
            select:    'id,word,word_class,definitions,audio_url,theme_ids,examples,dialects',
            theme_ids: `cs.{${theme.id}}`,
            order:     'word.asc',
        });
        if (error || !data) {
            console.warn('[wordFetcher] DB error:', error?.message);
            return [];
        }
        return data.map(dbRowToWordEntry);
    } catch (err) {
        console.warn('[wordFetcher] DB fetch failed:', err);
        return [];
    }
}

// ─── IgboAPI fetch (original logic, now the fallback path) ────────

async function fetchWordsFromAPI(
    keyword: string,
    wordClass?: string
): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams({
        keyword,
        examples: 'true',
        dialects: 'true',
    });
    if (wordClass) params.set('wordClass', wordClass.toLowerCase());

    const url = `${API_BASE}/words?${params}`;
    const headers: Record<string, string> = {};
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    try {
        const res = await fetch(url, { headers });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

/** Transform raw IgboAPI response into a WordEntry */
function apiRawToWordEntry(raw: Record<string, unknown>): WordEntry | null {
    const word = raw.word as string | undefined;
    const defs = raw.definitions as string[] | undefined;
    if (!word || !defs || defs.length === 0) return null;

    if ((defs[0] as string).split(/\s+/).length > 15) return null;
    if (word.startsWith('-') || word.startsWith('(')) return null;

    const rawExamples = (raw.examples || []) as Record<string, unknown>[];
    const examples: ExampleSentence[] = rawExamples
        .filter(ex => ex.igbo && ex.english)
        .map(ex => ({
            igbo:          ex.igbo as string,
            english:       ex.english as string,
            pronunciation: (ex.pronunciation as string) || undefined,
        }));

    return {
        id:           (raw._id as string) || (raw.id as string) || `word-${word}`,
        word,
        wordClass:    (raw.wordClass as string) || 'NNC',
        definitions:  defs,
        pronunciation: (raw.pronunciation as string) || null,
        examples,
        dialects: raw.dialects
            ? Object.values(raw.dialects as Record<string, Record<string, unknown>>)
                .filter(d => d?.word)
                .map(d => ({
                    word:          d.word as string,
                    pronunciation: (d.pronunciation as string) || null,
                    communities:   (d.dialects as string[]) || [],
                }))
            : [],
    };
}

/**
 * Fallback: fetch words from IgboAPI for a theme, then silently
 * upsert them into Supabase so future calls hit the DB.
 */
async function fetchThemeWordsFromAPI(theme: CurriculumTheme): Promise<WordEntry[]> {
    const results = await Promise.allSettled(
        theme.searchKeywords.map(kw => fetchWordsFromAPI(kw))
    );

    const allRaw: Record<string, unknown>[] = [];
    for (const r of results) {
        if (r.status === 'fulfilled') allRaw.push(...r.value);
    }

    const seen    = new Set<string>();
    const entries: WordEntry[] = [];

    for (const raw of allRaw) {
        const entry = apiRawToWordEntry(raw);
        if (!entry)                 continue;
        if (seen.has(entry.word))   continue;
        if (
            theme.wordClasses.length > 0 &&
            !theme.wordClasses.includes(entry.wordClass)
        ) continue;

        seen.add(entry.word);
        entries.push(entry);
    }

    entries.sort((a, b) => b.examples.length - a.examples.length);

    // Fire-and-forget: store these words in Supabase for next time
    if (entries.length > 0) {
        autoInsertToDb(entries, theme.id).catch(err =>
            console.warn('[wordFetcher] Auto-insert to DB failed:', err)
        );
    }

    return entries;
}

/**
 * Quietly upsert IgboAPI fallback results into Supabase
 * so the next session uses the DB cache.
 */
async function autoInsertToDb(entries: WordEntry[], themeId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const rows = entries.map(e => ({
            id:          e.id,
            word:        e.word,
            word_class:  e.wordClass,
            definitions: e.definitions,
            audio_url:   e.pronunciation,
            theme_ids:   [themeId],
            examples:    e.examples,
            dialects:    e.dialects || [],
        }));
        const { error } = await dbUpsert('words', rows, 'word');
        if (error) console.warn('[wordFetcher] Auto-insert error:', error.message);
        else console.log(`[wordFetcher] Auto-inserted ${rows.length} words for "${themeId}"`);
    } catch (err) {
        console.warn('[wordFetcher] Auto-insert exception:', err);
    }
}

// ─── Fetch by ID list (for SRS review sessions) ──────────────────

/**
 * Fetch a specific list of words by their IDs from Supabase.
 * Falls back to an empty array on error — callers should handle gracefully.
 */
export async function fetchWordsByIds(ids: string[]): Promise<WordEntry[]> {
    if (ids.length === 0) return [];
    if (typeof window === 'undefined') return [];
    try {
        const { data, error } = await dbSelect<DbWord>('words', {
            select: 'id,word,word_class,definitions,audio_url,theme_ids,examples,dialects',
            id:     `in.(${ids.join(',')})`,
        });
        if (error || !data) return [];
        return data.map(dbRowToWordEntry);
    } catch (err) {
        console.warn('[wordFetcher] fetchWordsByIds failed:', err);
        return [];
    }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Fetch words for a curriculum theme.
 *
 * Tries Supabase first. Falls back to IgboAPI only if the DB returns
 * fewer than 3 words (theme not yet seeded, or new theme added later).
 * Results are cached in-memory for the session.
 */
export async function fetchThemeWords(theme: CurriculumTheme): Promise<WordEntry[]> {
    // 1. In-memory cache hit
    if (wordCache.has(theme.id)) return wordCache.get(theme.id)!;

    // 2. Try Supabase first
    const dbWords = await fetchThemeWordsFromDB(theme);
    if (dbWords.length >= 3) {
        console.log(`[wordFetcher] DB hit: ${dbWords.length} words for theme "${theme.id}"`);
        wordCache.set(theme.id, dbWords);
        return dbWords;
    }

    // 3. Fallback to IgboAPI
    console.log(
        `[wordFetcher] DB returned ${dbWords.length} words for "${theme.id}" — falling back to IgboAPI`
    );
    const apiWords = await fetchThemeWordsFromAPI(theme);
    wordCache.set(theme.id, apiWords);
    return apiWords;
}

/**
 * Select N words for a lesson from a theme's word pool.
 * Prioritizes:
 *  1. Words due for SRS review
 *  2. New words not yet seen
 *  3. Words with the most examples (best for drills)
 *
 * Unchanged from original — lesson engine depends on this signature.
 */
export function selectLessonWords(
    pool:        WordEntry[],
    dueWordIds:  string[],
    seenWordIds: Set<string>,
    count:       number = 4
): WordEntry[] {
    const due      = pool.filter(w => dueWordIds.includes(w.id));
    if (due.length >= count) return due.slice(0, count);

    const newWords = pool.filter(w => !seenWordIds.has(w.id) && !dueWordIds.includes(w.id));
    const mixed    = [...due, ...newWords];
    if (mixed.length >= count) return mixed.slice(0, count);

    const remaining = pool.filter(w => !mixed.some(m => m.id === w.id));
    return [...mixed, ...remaining].slice(0, count);
}
