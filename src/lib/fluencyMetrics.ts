/**
 * Fluency Metrics — local aggregation layer (no Supabase, no network).
 *
 * Tracks the three cognitive metrics that actually signal fluency progress:
 *   1. Assembly speed  — chunk retrieval automaticity
 *   2. Suffix accuracy — morphological depth (Cloze steps)
 *   3. Tonal accuracy  — tonal discrimination (Pattern steps)
 *
 * Data is appended to `igboverse_fluency_log` in localStorage as a flat
 * array of FluencyEvent objects. Older entries (> 30 days) are pruned on
 * write to keep storage lean.
 */

const STORAGE_KEY = 'igboverse_fluency_log';
const SEVEN_DAYS = 7 * 86_400_000;
const THIRTY_DAYS = 30 * 86_400_000;

// ─── Types ────────────────────────────────────────────────────

export type StepType = 'assembly' | 'cloze' | 'pattern';

export interface FluencyEvent {
    ts: number;          // timestamp ms
    type: StepType;
    correct: boolean;
    timeMs: number;
    /** True when the Cloze step specifically tested a verb suffix */
    isSuffix?: boolean;
    /** True when the Pattern step was a tonal minimal pair */
    isTonal?: boolean;
    /** True when the Assembly step was the pinned-sentence (Exposure→Assembly) loop */
    isPinned?: boolean;
    /** Source example sentence used in Assembly (for chunks-practiced tracking) */
    sourceIgbo?: string;
    /** Word ID (for chunks-practiced tracking) */
    wordId?: string;
}

export interface FluencyWindow {
    /** Average assembly time across all assembly events in window (ms), or null if < 5 */
    assemblyAvgMs: number | null;
    /** Previous week's assembly avg (for trend arrow), or null */
    prevAssemblyAvgMs: number | null;
    /** Suffix correct / total in window, or null if < 5 */
    suffixAccuracy: { correct: number; total: number } | null;
    /** Tonal correct / total in window, or null if < 5 */
    tonalAccuracy: { correct: number; total: number } | null;
    /** Word IDs that have been practiced in Assembly (chunks practiced) */
    chunkWordIds: Set<string>;
}

export interface WeeklyDashboard {
    /** This week's assembly avg ms, or null */
    assemblyAvgMs: number | null;
    /** Last week's assembly avg ms, or null */
    prevAssemblyAvgMs: number | null;
    /** Suffix accuracy 0-1, or null */
    suffixRate: number | null;
    /** Tonal accuracy 0-1, or null */
    tonalRate: number | null;
    /** # of unique words practiced in Assembly */
    chunksPracticed: number;
    /** True when not enough data for any metric */
    isBaseline: boolean;
}

// ─── Persistence ─────────────────────────────────────────────

function loadLog(): FluencyEvent[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as FluencyEvent[]) : [];
    } catch {
        return [];
    }
}

function saveLog(events: FluencyEvent[]): void {
    if (typeof window === 'undefined') return;
    // Prune entries older than 30 days
    const cutoff = Date.now() - THIRTY_DAYS;
    const pruned = events.filter(e => e.ts >= cutoff);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch {
        // Quota exceeded — silently skip
    }
}

// ─── Write ────────────────────────────────────────────────────

/**
 * Append a batch of fluency events from a completed lesson.
 * Call once at lesson end; deduplicated by lesson session via `ts`.
 */
export function appendFluencyEvents(events: FluencyEvent[]): void {
    if (events.length === 0) return;
    const log = loadLog();
    saveLog([...log, ...events]);
}

// ─── Read / Aggregate ─────────────────────────────────────────

/**
 * Compute the 7-day and 14-day fluency windows for dashboard display.
 * Requires minimum 5 data points per metric to surface a number.
 */
export function getWeeklyDashboard(): WeeklyDashboard {
    const log = loadLog();
    const now = Date.now();
    const weekStart = now - SEVEN_DAYS;
    const prevWeekStart = weekStart - SEVEN_DAYS;

    // This week
    const thisWeek = log.filter(e => e.ts >= weekStart);
    // Previous week
    const prevWeek = log.filter(e => e.ts >= prevWeekStart && e.ts < weekStart);

    // Assembly speed — this week
    const assemblyThisWeek = thisWeek.filter(e => e.type === 'assembly' && e.correct);
    const assemblyAvgMs = assemblyThisWeek.length >= 5
        ? Math.round(assemblyThisWeek.reduce((s, e) => s + e.timeMs, 0) / assemblyThisWeek.length)
        : null;

    // Assembly speed — prev week
    const assemblyPrevWeek = prevWeek.filter(e => e.type === 'assembly' && e.correct);
    const prevAssemblyAvgMs = assemblyPrevWeek.length >= 5
        ? Math.round(assemblyPrevWeek.reduce((s, e) => s + e.timeMs, 0) / assemblyPrevWeek.length)
        : null;

    // Suffix accuracy — 7 days
    const suffixEvents = thisWeek.filter(e => e.type === 'cloze' && e.isSuffix);
    const suffixRate = suffixEvents.length >= 5
        ? suffixEvents.filter(e => e.correct).length / suffixEvents.length
        : null;

    // Tonal accuracy — 7 days
    const tonalEvents = thisWeek.filter(e => e.type === 'pattern' && e.isTonal);
    const tonalRate = tonalEvents.length >= 5
        ? tonalEvents.filter(e => e.correct).length / tonalEvents.length
        : null;

    // Chunks practiced (lifetime — words used in Assembly)
    const chunkWordIds = new Set(
        log.filter(e => e.type === 'assembly' && e.wordId).map(e => e.wordId as string)
    );

    const isBaseline = assemblyAvgMs === null && suffixRate === null && tonalRate === null;

    return {
        assemblyAvgMs,
        prevAssemblyAvgMs,
        suffixRate,
        tonalRate,
        chunksPracticed: chunkWordIds.size,
        isBaseline,
    };
}

// ─── Session → Events converter ───────────────────────────────

export interface StepResult {
    stepIndex: number;
    correct: boolean;
    timeMs: number;
    skipped: boolean;
}

export interface LessonStepMeta {
    type: string;
    wordId: string;
    sourceExampleIgbo?: string;
    // Pattern-specific
    minimalPairType?: string;
    // Cloze-specific: we detect suffix words from word ID or correctAnswer patterns
    correctAnswer?: string;
}

/**
 * Build a list of FluencyEvent objects from a completed lesson session.
 * Call once at lesson end, then pass to appendFluencyEvents().
 */
export function buildFluencyEvents(
    stepResults: StepResult[],
    steps: LessonStepMeta[]
): FluencyEvent[] {
    const now = Date.now();
    const events: FluencyEvent[] = [];

    for (const result of stepResults) {
        const step = steps[result.stepIndex];
        if (!step) continue;

        if (step.type === 'assembly') {
            events.push({
                ts: now,
                type: 'assembly',
                correct: result.correct,
                timeMs: result.timeMs,
                isPinned: !!step.sourceExampleIgbo,
                wordId: step.wordId,
                sourceIgbo: step.sourceExampleIgbo,
            });
        } else if (step.type === 'cloze') {
            // Heuristic: if the correct answer ends in a classic Igbo verb suffix,
            // mark it as a suffix step
            const ans = (step.correctAnswer ?? '').trim();
            const isSuffix = /([rls][aeiouịọụ]|pụ|la|le|chaa)$/i.test(ans);
            events.push({
                ts: now,
                type: 'cloze',
                correct: result.correct,
                timeMs: result.timeMs,
                isSuffix,
                wordId: step.wordId,
            });
        } else if (step.type === 'pattern') {
            const isTonal = step.minimalPairType === 'tonal';
            events.push({
                ts: now,
                type: 'pattern',
                correct: result.correct,
                timeMs: result.timeMs,
                isTonal,
                wordId: step.wordId,
            });
        }
    }

    return events;
}
