'use client';
/**
 * Review Generator — builds SRS review sessions from due or hard words.
 *
 * Session structure per word (hard-path):
 *   Recognition → Cloze → Assembly
 *
 * Fast-path (skip Cloze) activated for well-known words (high ease, many reps):
 *   Recognition → Assembly
 *
 * No Exposure or Pattern steps — the user has seen these words before.
 */

import {
    WordEntry,
    LessonUnit,
    LessonStep,
    RecognitionStep,
    ClozeStep,
    AssemblyStep,
    SRSMetadata,
} from './types';
import { loadDiagnostic } from '@/components/ui/OnboardingDiagnostic';

// ─── Utilities (mirrored from lessonGenerator) ─────────────────────

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function chunkSentence(sentence: string): string[] {
    const clean = sentence.replace(/[.!?]+$/, '').trim();
    const words = clean.split(/\s+/);
    if (words.length <= 3) return words;

    const chunks: string[] = [];
    let i = 0;
    const chunkSize = words.length <= 5 ? 1 : 2;
    while (i < words.length) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
        i += chunkSize;
    }
    return chunks;
}

// ─── Step builders ─────────────────────────────────────────────────

function buildRecognition(word: WordEntry, wordPool: WordEntry[]): RecognitionStep | null {
    const meaning = word.definitions[0];
    if (!meaning) return null;

    // Distractor pool — wrong answers from the word pool
    const distractorPool = wordPool.filter(w => w.id !== word.id && w.definitions[0]);
    const distractors = shuffle(distractorPool)
        .slice(0, 3)
        .map(w => w.word);

    if (distractors.length < 2) return null;

    const options = shuffle([word.word, ...distractors.slice(0, 3)]);

    return {
        type: 'recognition',
        wordId: word.id,
        prompt: `Which Igbo word means "${meaning}"?`,
        direction: 'english-to-igbo',
        distractorType: 'theme',
        options,
        correctAnswer: word.word,
        audioUrl: word.pronunciation ?? null,
    };
}

function buildCloze(word: WordEntry, wordPool: WordEntry[]): ClozeStep | null {
    // Pick an example sentence that contains the word
    const usable = word.examples.filter(ex =>
        ex.igbo.toLowerCase().includes(word.word.toLowerCase())
    );
    if (usable.length === 0) return null;

    const ex = usable[Math.floor(Math.random() * usable.length)];

    // Build a regex-safe blank
    const regex = new RegExp(word.word, 'i');
    const blanked = ex.igbo.replace(regex, '___');
    if (!blanked.includes('___')) return null;

    // Distractors for cloze options
    const distractors = shuffle(
        wordPool.filter(w => w.id !== word.id)
    ).slice(0, 3).map(w => w.word);

    const options = shuffle([word.word, ...distractors.slice(0, 3)]);

    return {
        type: 'cloze',
        wordId: word.id,
        sentenceWithBlank: blanked,
        fullSentence: ex.igbo,
        translation: ex.english,
        options,
        correctAnswer: word.word,
        audioUrl: ex.pronunciation ?? null,
    };
}

function buildAssembly(word: WordEntry, timerMode?: 'auto' | 'show-only'): AssemblyStep | null {
    const usable = word.examples.filter(ex => {
        const wc = ex.igbo.split(/\s+/).length;
        return wc >= 3 && wc <= 7;
    });
    if (usable.length === 0) return null;

    const ex = usable[Math.floor(Math.random() * usable.length)];
    const correctOrder = chunkSentence(ex.igbo);

    // Timer based on chunk count
    let timerSeconds: number | undefined;
    let timerAutoSubmit: boolean | undefined;
    if (timerMode) {
        const n = correctOrder.length;
        timerSeconds = n <= 3 ? 8 : n === 4 ? 12 : 16;
        timerAutoSubmit = timerMode === 'auto';
    }

    return {
        type: 'assembly',
        wordId: word.id,
        chunks: shuffle(correctOrder),
        correctOrder,
        translation: ex.english,
        audioUrl: ex.pronunciation ?? null,
        timerSeconds,
        timerAutoSubmit,
    };
}

// ─── Fast-path heuristic ───────────────────────────────────────────

/**
 * Words that the learner clearly knows well skip the Cloze phase.
 * Threshold: ≥3 successful repetitions AND ease ≥ 2.0
 */
function isWellKnown(entry: SRSMetadata): boolean {
    return entry.repetitions >= 3 && entry.easeFactor >= 2.0;
}

// ─── Public: Review lesson ─────────────────────────────────────────

export interface ReviewLessonResult {
    lesson: LessonUnit;
    /**
     * Set of wordIds that are on the fast-path (Recognition → Assembly only).
     * The drill screen uses this to skip Cloze when Recognition is answered
     * correctly on the first try.
     */
    fastPathWordIds: Set<string>;
}

/**
 * Generate a review-mode LessonUnit for the given due/hard words.
 *
 * @param words      WordEntry objects for the words to review
 * @param srsEntries Matching SRS metadata (used for fast-path heuristic)
 * @param wordPool   Full pool for distractor generation
 * @param sessionId  'due' | 'hard' — used in the unit name
 */
export function generateReviewLesson(
    words: WordEntry[],
    srsEntries: SRSMetadata[],
    wordPool: WordEntry[],
    sessionId: 'due' | 'hard' = 'due',
): ReviewLessonResult {
    const diagnostic = loadDiagnostic();

    const timerMode: 'auto' | 'show-only' | undefined =
        (diagnostic?.translationDependent === 'Yes, always' ||
         diagnostic?.translationDependent === 'Sometimes')
            ? 'auto'
            : diagnostic?.translationDependent === 'I try to think directly in Igbo'
            ? 'show-only'
            : undefined;

    const srsMap = new Map(srsEntries.map(e => [e.wordId, e]));
    const fastPathWordIds = new Set<string>();
    const steps: LessonStep[] = [];

    for (const word of words) {
        const entry = srsMap.get(word.id);
        const wellKnown = entry ? isWellKnown(entry) : false;
        if (wellKnown) fastPathWordIds.add(word.id);

        // Phase 1: Recognition (always)
        const rec = buildRecognition(word, wordPool);
        if (rec) steps.push(rec);

        // Phase 2: Cloze (skipped for well-known words — fast-path logic in drill screen)
        if (!wellKnown) {
            const cloze = buildCloze(word, wordPool);
            if (cloze) steps.push(cloze);
        }

        // Phase 3: Assembly (always)
        const asm = buildAssembly(word, timerMode);
        if (asm) steps.push(asm);
    }

    const unitName = sessionId === 'hard' ? 'Hard Words Review' : 'SRS Review';

    return {
        lesson: {
            id: `review-${sessionId}-${Date.now()}`,
            unitName,
            themeId: `review-${sessionId}`,
            targetWords: words.map(w => w.id),
            steps,
            estimatedMinutes: Math.ceil(steps.length * 0.3),
            createdAt: Date.now(),
        },
        fastPathWordIds,
    };
}
