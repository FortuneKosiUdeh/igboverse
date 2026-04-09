/**
 * Core types for the "Lexical Chunking" lesson system.
 *
 * Flow: Exposure → Pattern → Assembly → (late) Grammar Inference
 * Each lesson is a ~3-minute micro-session of 8-12 steps.
 */

// ─── SRS (Spaced Repetition) ─────────────────────────────────

export interface SRSMetadata {
    wordId: string;
    lastSeen: number;        // Unix timestamp
    nextReview: number;       // Unix timestamp
    easeFactor: number;       // 1.3–2.5 (SM-2 algorithm)
    interval: number;         // days until next review
    repetitions: number;      // total times reviewed
    lapses: number;           // times user got it wrong after learning
}

// ─── Word Entry (from IgboAPI) ───────────────────────────────

export interface WordEntry {
    id: string;
    word: string;
    wordClass: string;        // NNC, AV, ADJ, etc.
    definitions: string[];
    pronunciation: string | null;  // audio URL
    examples: ExampleSentence[];
    dialects?: DialectVariantEntry[];
}

export interface ExampleSentence {
    igbo: string;
    english: string;
    pronunciation?: string;   // audio URL for the sentence
}

export interface DialectVariantEntry {
    word: string;
    pronunciation: string | null;
    communities: string[];
}

// ─── Lesson Step Types ───────────────────────────────────────

/**
 * EXPOSURE: Pure recognition. See/hear the word.
 * "This is 'nri' — it means 'food'"
 */
export interface ExposureStep {
    type: 'exposure';
    wordId: string;
    igbo: string;
    english: string;
    audioUrl: string | null;
    hint?: string;             // e.g. "noun" or context clue
    /** Dialect bridge: home dialect form of this word (if the user's dialect differs) */
    dialectForm?: string;
    /** Label for the dialect form, e.g. "In Onitsha Igbo" */
    dialectLabel?: string;
    /** Audio URL for the dialect pronunciation (if available separately) */
    dialectAudioUrl?: string | null;
    // ── Chunk-first fields (Mission 7) ──────────────────────
    /** Full example sentence containing the target word */
    exampleSentence?: string;
    /** English translation of the example sentence */
    exampleTranslation?: string;
    /** Audio URL for the example sentence (separate from word audio) */
    exampleAudioUrl?: string | null;
    /** The specific word to bold/highlight within the sentence */
    highlightWord?: string;
    /** Auto-advance delay in ms. Default 3000; chunk-first uses 5000. */
    autoAdvanceMs?: number;
}

/**
 * RECOGNITION: Multiple choice. User identifies the word.
 * "Which one means 'food'?" → [nri, mmiri, ụlọ, nwa]
 */
export interface RecognitionStep {
    type: 'recognition';
    wordId: string;
    prompt: string;            // "Which tone pattern means 'egg'?" / "Which one means X?"
    correctAnswer: string;
    options: string[];         // 4 choices (shuffled)
    audioUrl: string | null;
    direction: 'igbo-to-english' | 'english-to-igbo' | 'audio-to-igbo';
    /** How distractors were sourced — drives question framing and option rendering */
    distractorType: 'tonal' | 'dialectal' | 'theme';
    /** For dialectal distractors: labels per option (same order as options[]) */
    dialectLabels?: Record<string, string>;  // e.g. { "isi": "Owerri", "ishi": "Onitsha" }
}

/**
 * CLOZE: Fill-in-the-blank using a real API sentence.
 * "Anyị na-eri ___" → "nri"
 */
export interface ClozeStep {
    type: 'cloze';
    wordId: string;
    sentenceWithBlank: string;   // "Anyị na-eri ___."
    fullSentence: string;        // "Anyị na-eri nri."
    translation: string;         // "We are eating food."
    correctAnswer: string;       // "nri"
    options: string[];           // 4 choices
    audioUrl: string | null;     // sentence audio
    /** Dialect bridge: extra answers accepted as correct (with soft note shown) */
    alternateAnswers?: string[];
    /** Message shown on alternate-answer selection, e.g. "✓ In Standard Igbo this is written as -rV" */
    softCorrectNote?: string;
}

/**
 * ASSEMBLY: Sentence scramble. Drag-to-order.
 * [eri] [na-] [Anyị] [nri] → "Anyị na-eri nri."
 */
export interface AssemblyStep {
    type: 'assembly';
    wordId: string;
    chunks: string[];            // shuffled blocks
    correctOrder: string[];      // correct sequence
    translation: string;
    audioUrl: string | null;
    timerSeconds?: number;
    timerAutoSubmit?: boolean;
    /** The full Igbo sentence this scramble came from (for display context) */
    sourceExampleIgbo?: string;
}

/**
 * PATTERN: "Spot the difference" grammar inference.
 * Show two sentences with different tenses, ask which means what.
 */
export interface PatternStep {
    type: 'pattern';
    wordId: string;
    sentenceA: { igbo: string; english: string };
    sentenceB: { igbo: string; english: string };
    question: string;           // "What's different between these two?"
    correctAnswer: 'A' | 'B';  // kept for backward-compat with handleAnswer
    grammarNote?: string;       // Shown AFTER answering (one sentence, no lecture)
    /** The specific word that changed between the two sentences */
    changedWord?: string;
    /** What kind of minimal pair this is */
    minimalPairType?: 'tonal' | 'suffix' | 'aspect';
}

export type LessonStep =
    | ExposureStep
    | RecognitionStep
    | ClozeStep
    | AssemblyStep
    | PatternStep;

// ─── Lesson Unit ─────────────────────────────────────────────

export interface LessonUnit {
    id: string;
    unitName: string;           // e.g. "Food & Drink 1"
    themeId: string;            // curriculum cluster ID
    targetWords: string[];      // word IDs being taught
    steps: LessonStep[];
    estimatedMinutes: number;   // ~2-3 min
    createdAt: number;
}

// ─── Session State ───────────────────────────────────────────

export interface SessionState {
    lessonId: string;
    currentStepIndex: number;
    totalSteps: number;
    correctCount: number;
    incorrectCount: number;
    streak: number;             // current consecutive correct
    maxStreak: number;
    startedAt: number;
    completedAt: number | null;
    stepResults: StepResult[];
}

export interface StepResult {
    stepIndex: number;
    correct: boolean;
    timeMs: number;             // response time
    skipped: boolean;
}

// ─── Curriculum ──────────────────────────────────────────────

export interface CurriculumTheme {
    id: string;
    name: string;
    description: string;
    icon: string;               // emoji
    searchKeywords: string[];   // IgboAPI search terms
    wordClasses: string[];      // filter for word class
    order: number;              // display order
    color: string;              // theme color hex
}

// ─── User Progress ───────────────────────────────────────────

export interface LearnerProfile {
    totalWordsLearned: number;
    totalLessonsCompleted: number;
    currentStreak: number;
    longestStreak: number;
    totalXP: number;
    level: number;
    srsQueue: SRSMetadata[];
    unlockedThemes: string[];
    lastSessionDate: string;     // ISO date
}
