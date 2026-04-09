/**
 * LessonGenerator — turns IgboAPI words into coherent ~3-minute micro-lessons.
 *
 * Flow per lesson (8-12 steps):
 *   1. Exposure (2-3 words): see + hear each target word
 *   2. Recognition (2-3 rounds): multiple-choice identification
 *   3. Cloze (2-3 rounds): fill-in-the-blank from real API sentences
 *   4. Assembly (1-2 rounds): sentence scramble
 *   5. Pattern (0-1 round): tense "spot the difference" (unlocks later)
 */

import {
    WordEntry,
    LessonUnit,
    LessonStep,
    ExposureStep,
    RecognitionStep,
    ClozeStep,
    AssemblyStep,
    PatternStep,
} from './types';
import { loadDiagnostic } from '@/components/ui/OnboardingDiagnostic';
import { getDialectId, getDialectLabel, getDialectVariant, toOnitshaPast, isOnitshaPairOf } from '@/lib/dialect';


// ─── Utilities ────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pick<T>(arr: T[], n: number): T[] {
    return shuffle(arr).slice(0, n);
}

/** Split a sentence into 3-5 chunks for assembly drills */
function chunkSentence(sentence: string): string[] {
    // Remove trailing period/punctuation for cleaner chunks
    const clean = sentence.replace(/[.!?]+$/, '').trim();
    const words = clean.split(/\s+/);

    if (words.length <= 3) return words;

    // Group into 3-5 semantic chunks (2-3 words each)
    const chunks: string[] = [];
    let i = 0;
    const chunkSize = words.length <= 5 ? 1 : 2;

    while (i < words.length) {
        const end = Math.min(i + chunkSize, words.length);
        chunks.push(words.slice(i, end).join(' '));
        i = end;
    }

    // If we ended up with too many chunks, merge the last two
    if (chunks.length > 5) {
        const last = chunks.pop()!;
        chunks[chunks.length - 1] += ' ' + last;
    }

    return chunks;
}

// ─── Tonal variant detection ──────────────────────────────────

/**
 * Strips all Unicode combining diacritics (tone marks) from an Igbo string.
 * Used to check if two words are tonal minimal pairs.
 */
function stripTones(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** True if two words differ only in tone marks, not in consonants/vowels. */
function areTonalVariants(a: string, b: string): boolean {
    return a !== b && stripTones(a) === stripTones(b);
}

/**
 * Build distractors for a Recognition step using a 3-priority strategy:
 *  1. Tonal variants of the target word (e.g. ákwá vs àkwá)
 *  2. Dialectal variants from word.dialects[]
 *  3. Same-theme pool words (existing behaviour, fallback)
 *
 * Returns the options array, distractor type, and optional dialect labels.
 */
interface DistractorResult {
    distractors: string[];
    distractorType: 'tonal' | 'dialectal' | 'theme';
    dialectLabels?: Record<string, string>;
}

function buildDistractors(
    word: WordEntry,
    allWords: WordEntry[],
    count: number = 3
): DistractorResult {
    // ── Priority 1: tonal variants from the pool ──────────────────
    const tonalVariants = allWords
        .filter(w => w.id !== word.id && areTonalVariants(w.word, word.word))
        .map(w => w.word);

    if (tonalVariants.length >= 2) {
        return {
            distractors: pick(tonalVariants, count),
            distractorType: 'tonal',
        };
    }

    // ── Priority 1b: Onitsha -lV form as a tonal/dialectal distractor ─
    // When the user's dialect is Onitsha and the word has a -rV past pattern,
    // inject the -lV Onitsha form as a plausible distractor.
    const dialectId = getDialectId();
    if (dialectId === 'Onicha' && tonalVariants.length < 2) {
        const onitsha = toOnitshaPast(word.word);
        if (onitsha && onitsha !== word.word) {
            // Build tonal-style distractor list: Onitsha form + pool padding
            const poolPad = allWords
                .filter(w => w.id !== word.id && w.word !== onitsha)
                .map(w => w.word);
            const distractors = [onitsha, ...pick(poolPad, count - 1)].slice(0, count);
            return {
                distractors,
                distractorType: 'tonal',
                dialectLabels: {
                    [word.word]: 'Standard',
                    [onitsha]: 'Onitsha form',
                },
            };
        }
    }

    // ── Priority 2: dialectal variants from word.dialects[] ───────
    const dialects = word.dialects ?? [];
    if (dialects.length >= 1) {
        const dialectDistractors = dialects
            .filter(d => d.word && d.word !== word.word)
            .slice(0, count);

        if (dialectDistractors.length >= 1) {
            // Build label map: { word → community name }
            const dialectLabels: Record<string, string> = {
                [word.word]: 'Standard',
            };
            for (const d of dialectDistractors) {
                const community = d.communities?.[0] ?? 'Dialect';
                dialectLabels[d.word] = community;
            }

            // Pad with theme-pool words if we don't have 3 distractors
            const dialectWords = dialectDistractors.map(d => d.word);
            const themePool = allWords
                .filter(w => w.id !== word.id && !dialectWords.includes(w.word))
                .map(w => w.word);
            const padded = [...dialectWords, ...pick(themePool, count - dialectWords.length)].slice(0, count);

            return {
                distractors: padded,
                distractorType: 'dialectal',
                dialectLabels,
            };
        }
    }

    // ── Priority 3: same-theme pool (fallback) ────────────────────
    const themeDistractors = allWords
        .filter(w => w.id !== word.id)
        .map(w => w.word);

    return {
        distractors: pick(themeDistractors, count),
        distractorType: 'theme',
    };
}

// ─── Step Generators ──────────────────────────────────────────

function generateExposure(word: WordEntry): ExposureStep {
    const dialectVariant = getDialectVariant(word);
    const dialectId = getDialectId();

    // ── Dialect bridge ─────────────────────────────────────────
    let dialectForm: string | undefined;
    let dialectLabel: string | undefined;
    let dialectAudioUrl: string | null | undefined;

    if (dialectVariant && dialectId) {
        const dialectName = getDialectLabel();
        dialectForm = dialectVariant.word;
        dialectLabel = dialectName ? `In ${dialectName} Igbo` : 'In your dialect';
        dialectAudioUrl = dialectVariant.pronunciation ?? null;
    }

    // ── Chunk-first: pick best example sentence ───────────────────
    // Prefer sentences that (a) contain the exact word, (b) are 3–10 words long.
    const containsWord = word.examples.filter(ex => {
        const wc = ex.igbo.trim().split(/\s+/).length;
        return (
            wc >= 3 && wc <= 10 &&
            ex.igbo.toLowerCase().includes(word.word.toLowerCase())
        );
    });

    // Broader fallback: any sentence of reasonable length
    const anyUsable = word.examples.filter(ex => {
        const wc = ex.igbo.trim().split(/\s+/).length;
        return wc >= 3 && wc <= 10;
    });

    const exPool = containsWord.length > 0 ? containsWord : anyUsable;
    const chosenEx = exPool.length > 0
        ? exPool[Math.floor(Math.random() * exPool.length)]
        : null;

    const chunkFirst = chosenEx !== null;

    return {
        type: 'exposure',
        wordId: word.id,
        igbo: word.word,
        english: word.definitions[0] || '???',
        audioUrl: word.pronunciation,
        hint: formatWordClass(word.wordClass),
        dialectForm,
        dialectLabel,
        dialectAudioUrl,
        // Chunk-first fields
        exampleSentence:     chunkFirst ? chosenEx!.igbo         : undefined,
        exampleTranslation:  chunkFirst ? chosenEx!.english      : undefined,
        exampleAudioUrl:     chunkFirst ? (chosenEx!.pronunciation ?? null) : undefined,
        highlightWord:       chunkFirst ? word.word              : undefined,
        autoAdvanceMs:       chunkFirst ? 5000                   : 3000,
    };
}

function generateRecognition(
    word: WordEntry,
    allWords: WordEntry[],
    direction: 'igbo-to-english' | 'english-to-igbo' | 'audio-to-igbo'
): RecognitionStep | null {
    const def = word.definitions[0];
    if (!def) return null;

    const { distractors, distractorType, dialectLabels } = buildDistractors(word, allWords);

    let prompt: string;
    let correctAnswer: string;
    let options: string[];
    let audioUrl: string | null = null;

    if (direction === 'english-to-igbo') {
        // Prompt framing depends on distractor type
        if (distractorType === 'tonal') {
            prompt = `Which tone pattern means "${def}"?`;
        } else if (distractorType === 'dialectal') {
            prompt = `Which form do you recognize for "${def}"?`;
        } else {
            prompt = `Which Igbo word means "${def}"?`;
        }
        correctAnswer = word.word;
        options = shuffle([correctAnswer, ...distractors]);
    } else if (direction === 'igbo-to-english') {
        prompt = `What does "${word.word}" mean?`;
        correctAnswer = def;
        // For igbo-to-english, distractors are always definitions (theme fallback)
        const defDistractors = allWords
            .filter(w => w.id !== word.id && w.definitions[0])
            .map(w => w.definitions[0]);
        options = shuffle([correctAnswer, ...pick(defDistractors, 3)]);
    } else {
        // audio-to-igbo — tonal distractors are especially valuable here
        prompt = distractorType === 'tonal'
            ? 'Listen — which tone pattern did you hear?'
            : 'Listen and choose the correct word';
        correctAnswer = word.word;
        options = shuffle([correctAnswer, ...distractors]);
        audioUrl = word.pronunciation ?? null;
    }

    return {
        type: 'recognition',
        wordId: word.id,
        prompt,
        correctAnswer,
        options,
        audioUrl: audioUrl ?? (direction === 'audio-to-igbo' ? word.pronunciation : null),
        direction,
        distractorType,
        dialectLabels,
    };
}


function generateCloze(
    word: WordEntry,
    allWords: WordEntry[]
): ClozeStep | null {
    // Find an example sentence that contains the target word
    const usable = word.examples.filter(ex => {
        const words = ex.igbo.toLowerCase().split(/\s+/);
        return words.some(w => w.replace(/[.,!?]/g, '') === word.word.toLowerCase())
            && ex.igbo.split(/\s+/).length >= 3
            && ex.igbo.split(/\s+/).length <= 10;
    });

    if (usable.length === 0) {
        // Fallback: check if the word appears as a substring
        const fallback = word.examples.filter(ex =>
            ex.igbo.toLowerCase().includes(word.word.toLowerCase())
            && ex.igbo.split(/\s+/).length >= 3
            && ex.igbo.split(/\s+/).length <= 10
        );
        if (fallback.length === 0) return null;
        const ex = fallback[Math.floor(Math.random() * fallback.length)];
        return buildClozeFromExample(word, ex, allWords);
    }

    const ex = usable[Math.floor(Math.random() * usable.length)];
    return buildClozeFromExample(word, ex, allWords);
}

function buildClozeFromExample(
    word: WordEntry,
    ex: { igbo: string; english: string; pronunciation?: string },
    allWords: WordEntry[]
): ClozeStep {
    // Replace the target word with ___
    const regex = new RegExp(`\\b${escapeRegex(word.word)}\\b`, 'i');
    const sentenceWithBlank = ex.igbo.replace(regex, '___');

    // Cloze always uses same-theme distractors (only English-to-Igbo matters here)
    const distractors = pick(
        allWords.filter(w => w.id !== word.id).map(w => w.word),
        3
    );
    const options = shuffle([word.word, ...distractors]);

    // ── Onitsha dialect bridging — accept -lV alongside -rV ──────────
    let alternateAnswers: string[] | undefined;
    let softCorrectNote: string | undefined;
    const onitsha = toOnitshaPast(word.word);
    if (onitsha && onitsha !== word.word) {
        alternateAnswers = [onitsha];
        softCorrectNote = `✓ Correct — in Standard Igbo this is written as "${word.word}" (your Onitsha form "${onitsha}" is valid too)`;
        // Also surface the Onitsha form as a visible option if not already there
        if (!options.includes(onitsha)) {
            options.splice(Math.floor(Math.random() * options.length), 1, onitsha);
        }
    }

    return {
        type: 'cloze',
        wordId: word.id,
        sentenceWithBlank,
        fullSentence: ex.igbo,
        translation: ex.english,
        correctAnswer: word.word,
        options,
        audioUrl: ex.pronunciation || null,
        alternateAnswers,
        softCorrectNote,
    };
}

/**
 * Build an Assembly scramble step.
 *
 * @param word        Target word.
 * @param timerMode   'auto' | 'show-only' | undefined.
 * @param pinnedEx    If provided, use this exact sentence instead of picking randomly.
 *                    Pass the exampleSentence from the paired Exposure step to create
 *                    the Exposure → Assembly chunk-retrieval loop.
 */
function generateAssembly(
    word: WordEntry,
    timerMode?: 'auto' | 'show-only',
    pinnedEx?: { igbo: string; english: string; pronunciation?: string }
): AssemblyStep | null {
    // Resolve the sentence: prefer pinned, then pick randomly
    let ex: { igbo: string; english: string; pronunciation?: string } | null = null;

    if (pinnedEx) {
        // Only use the pinned sentence if it's within the word-count envelope
        const wc = pinnedEx.igbo.trim().split(/\s+/).length;
        if (wc >= 3 && wc <= 7) ex = pinnedEx;
    }

    if (!ex) {
        const usable = word.examples.filter(ex => {
            const wc = ex.igbo.split(/\s+/).length;
            return wc >= 3 && wc <= 7;
        });
        if (usable.length === 0) return null;
        ex = usable[Math.floor(Math.random() * usable.length)];
    }

    const correctOrder = chunkSentence(ex.igbo);

    // Timer: 8s for ≤3 chunks, 12s for 4, 16s for 5+
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
        audioUrl: ex.pronunciation || null,
        timerSeconds,
        timerAutoSubmit,
        sourceExampleIgbo: ex.igbo,
    };
}

function generatePattern(
    word: WordEntry,
    allExamples: { igbo: string; english: string; sourceWord: string }[],
    forceTonal: boolean = false
): PatternStep | null {
    const wordExamples = allExamples.filter(ex => ex.sourceWord === word.word);
    if (wordExamples.length < 2) return null;

    // ── Try tonal minimal pair first ─────────────────────────────
    // Look for two sentences where exactly one word differs only by tone mark
    for (let i = 0; i < wordExamples.length; i++) {
        for (let j = i + 1; j < wordExamples.length; j++) {
            const a = wordExamples[i];
            const b = wordExamples[j];
            const wordsA = a.igbo.split(/\s+/);
            const wordsB = b.igbo.split(/\s+/);
            if (wordsA.length !== wordsB.length) continue;

            // Find positions that differ
            const diffPositions = wordsA
                .map((w, k) => ({ k, wA: w, wB: wordsB[k] }))
                .filter(({ wA, wB }) => wA !== wB);

            if (diffPositions.length !== 1) continue; // not a minimal pair

            const { wA, wB } = diffPositions[0];

            // Tonal pair: strip-equal but surface-different
            if (areTonalVariants(wA, wB)) {
                const showBFirst = Math.random() > 0.5;
                return {
                    type: 'pattern',
                    wordId: word.id,
                    sentenceA: showBFirst ? { igbo: b.igbo, english: b.english } : { igbo: a.igbo, english: a.english },
                    sentenceB: showBFirst ? { igbo: a.igbo, english: a.english } : { igbo: b.igbo, english: b.english },
                    question: "What's different between these two?",
                    correctAnswer: 'A',  // both are valid answers — user taps the changed word
                    changedWord: wA,
                    minimalPairType: 'tonal',
                    grammarNote: `The tone mark changes the meaning — "${wA}" and "${wB}" sound similar but mean different things.`,
                };
            }

            // Suffix pair: same base, different suffix (verb morphology)
            const baseA = stripTones(wA).replace(/[aeiouịọụ]+$/i, '');
            const baseB = stripTones(wB).replace(/[aeiouịọụ]+$/i, '');
            if (baseA.length >= 2 && baseA === baseB) {
                const showBFirst = Math.random() > 0.5;
                return {
                    type: 'pattern',
                    wordId: word.id,
                    sentenceA: showBFirst ? { igbo: b.igbo, english: b.english } : { igbo: a.igbo, english: a.english },
                    sentenceB: showBFirst ? { igbo: a.igbo, english: a.english } : { igbo: b.igbo, english: b.english },
                    question: "What's different between these two?",
                    correctAnswer: 'A',
                    changedWord: wA,
                    minimalPairType: 'suffix',
                    grammarNote: `The verb ending changes the tense — "${wA}" vs "${wB}" marks a different time.`,
                };
            }
        }
    }

    // ── Fallback: present vs past aspect contrast ─────────────────
    if (forceTonal) {
        // Tonal forcing required but no tonal pair found — skip this step
        return null;
    }

    const present = wordExamples.find(ex => /\bna-/.test(ex.igbo));
    const past = wordExamples.find(ex =>
        !(/\bna-/.test(ex.igbo)) &&
        !(/\bga-/.test(ex.igbo)) &&
        ex.igbo !== present?.igbo
    );
    if (!present || !past) return null;

    const showPastFirst = Math.random() > 0.5;
    return {
        type: 'pattern',
        wordId: word.id,
        sentenceA: showPastFirst
            ? { igbo: past.igbo, english: past.english }
            : { igbo: present.igbo, english: present.english },
        sentenceB: showPastFirst
            ? { igbo: present.igbo, english: present.english }
            : { igbo: past.igbo, english: past.english },
        question: "What's different between these two?",
        correctAnswer: showPastFirst ? 'B' : 'A',  // present-tense sentence
        changedWord: 'na-',
        minimalPairType: 'aspect',
        grammarNote: 'The marker "na-" signals something happening right now (present continuous).',
    };
}

// ─── Main Generator ───────────────────────────────────────────

export interface GeneratorOptions {
    /** Include pattern/grammar-inference steps (unlock after ~50 word exposures) */
    includePatterns?: boolean;
    /** Max steps per lesson (overridden by diagnostic sessionStyle) */
    maxSteps?: number;
    /** All words in the word pool (for distractors) */
    wordPool: WordEntry[];
}

/**
 * Generate a complete lesson from 3-5 target words.
 * Returns a coherent micro-lesson with progressive difficulty.
 * Applies diagnostic routing rules when igboverse_diagnostic is present.
 */
export function generateLesson(
    targetWords: WordEntry[],
    themeId: string,
    themeName: string,
    options: GeneratorOptions
): LessonUnit {
    const diagnostic = loadDiagnostic();

    // ── Diagnostic routing: session length ────────────────────
    // sessionStyle overrides the caller-supplied maxSteps
    let effectiveMaxSteps = options.maxSteps ?? 12;
    if (diagnostic?.sessionStyle === 'Several short sessions during the day') {
        effectiveMaxSteps = Math.min(effectiveMaxSteps, 6);
    } else if (diagnostic?.sessionStyle === 'One focused session daily') {
        effectiveMaxSteps = Math.max(effectiveMaxSteps, 12);
    }

    const { includePatterns = false, wordPool } = options;
    const maxSteps = effectiveMaxSteps;
    const steps: LessonStep[] = [];

    // ── Diagnostic routing: Assembly timer mode ──────────────────
    // 'auto'      = "Yes, always" or "Sometimes" → auto-submit on 0
    // 'show-only' = "I try to think directly in Igbo" → display only
    // undefined   = no diagnostic → no timer
    const timerMode: 'auto' | 'show-only' | undefined =
        (diagnostic?.translationDependent === 'Yes, always' ||
         diagnostic?.translationDependent === 'Sometimes')
            ? 'auto'
            : diagnostic?.translationDependent === 'I try to think directly in Igbo'
            ? 'show-only'
            : undefined;

    // ── Diagnostic routing: Tonal minimal-pair forcing ────────
    // Low tonal awareness → Pattern steps must be tonal-contrast pairs
    const forceTonalPatterns = diagnostic?.tonalAwareness === 'Honestly no';

    // ── Diagnostic routing: Verb-suffix Cloze prioritisation ──
    // Stuck on conjugation → prefer Cloze steps that test verb suffixes
    const prioritiseSuffixCloze =
        diagnostic?.stuckPoint === 'Not sure how to conjugate verbs';

    // Phase 1: EXPOSURE — show each target word with its example chunk
    // Also record which example sentence was used per word, to pin Assembly
    const exposureExMap = new Map<string, { igbo: string; english: string; pronunciation?: string }>();
    for (const word of targetWords) {
        const step = generateExposure(word);
        steps.push(step);
        // If Exposure found an example sentence, pin it for Assembly
        if (step.exampleSentence && step.exampleTranslation) {
            exposureExMap.set(word.id, {
                igbo: step.exampleSentence,
                english: step.exampleTranslation,
                pronunciation: step.exampleAudioUrl ?? undefined,
            });
        }
    }

    // Phase 2: RECOGNITION — multiple choice (easiest test)
    for (const word of targetWords) {
        const step = generateRecognition(word, wordPool, 'english-to-igbo');
        if (step) steps.push(step);
    }

    // If any word has audio, add an audio recognition round
    const audioWord = targetWords.find(w => w.pronunciation);
    if (audioWord) {
        const audioStep = generateRecognition(audioWord, wordPool, 'audio-to-igbo');
        if (audioStep) steps.push(audioStep);
    }

    // Phase 3: CLOZE — fill-in-the-blank from real sentences
    const clozeWords = prioritiseSuffixCloze
        ? [
            ...targetWords.filter(w => ['AV', 'PV', 'MV'].includes(w.wordClass)),
            ...targetWords.filter(w => !['AV', 'PV', 'MV'].includes(w.wordClass)),
          ]
        : targetWords;

    for (const word of clozeWords) {
        if (steps.length >= maxSteps - 2) break;
        const step = generateCloze(word, wordPool);
        if (step) steps.push(step);
    }

    // Phase 4: ASSEMBLY — reassemble the exact chunk seen during Exposure
    for (const word of targetWords) {
        if (steps.length >= maxSteps - 1) break;
        const pinnedEx = exposureExMap.get(word.id);
        const step = generateAssembly(word, timerMode, pinnedEx);
        if (step) {
            steps.push(step);
            break; // 1 assembly per lesson
        }
    }

    // Phase 5: PATTERN — grammar inference (optional, late-stage)
    if (includePatterns) {
        const allExamples = wordPool.flatMap(w =>
            w.examples.map(ex => ({ ...ex, sourceWord: w.word }))
        );
        for (const word of targetWords) {
            if (steps.length >= maxSteps) break;
            const step = generatePattern(word, allExamples, forceTonalPatterns);
            if (step) {
                steps.push(step);
                break; // Max 1 pattern per lesson
            }
        }
    }

    return {
        id: `lesson-${themeId}-${Date.now()}`,
        unitName: themeName,
        themeId,
        targetWords: targetWords.map(w => w.id),
        steps: steps.slice(0, maxSteps),
        estimatedMinutes: Math.ceil(steps.length * 0.3),
        createdAt: Date.now(),
    };
}

// ─── Helpers ──────────────────────────────────────────────────

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatWordClass(wc: string): string {
    const MAP: Record<string, string> = {
        NNC: 'noun',
        AV: 'verb',
        ADJ: 'adjective',
        ADV: 'adverb',
        INTJ: 'interjection',
        CD: 'number',
        PREP: 'preposition',
        NM: 'proper noun',
        PV: 'verb',
        MV: 'verb',
    };
    return MAP[wc] || wc.toLowerCase();
}
