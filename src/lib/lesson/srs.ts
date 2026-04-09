/**
 * Spaced Repetition System — SM-2 algorithm adapted for Igbo vocabulary.
 *
 * Intervals: correct answers expand the interval (1d → 3d → 7d → 16d → ...).
 * Incorrect answers reset to shorter intervals.
 * Ease factor self-adjusts based on performance (1.3 → 2.5 range).
 */

import { SRSMetadata } from './types';

const STORAGE_KEY = 'igboverse_srs';
const DAY_MS = 86_400_000;

// ─── SM-2 Core ────────────────────────────────────────────────

export function createSRSEntry(wordId: string): SRSMetadata {
    return {
        wordId,
        lastSeen: Date.now(),
        nextReview: Date.now() + DAY_MS,  // Review tomorrow
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0,
        lapses: 0,
    };
}

/**
 * Update SRS metadata after a review.
 * @param quality 0-5 rating (0-2 = fail, 3 = hard, 4 = good, 5 = easy)
 */
export function reviewWord(entry: SRSMetadata, quality: number): SRSMetadata {
    const q = Math.max(0, Math.min(5, quality));
    const now = Date.now();

    if (q < 3) {
        // Failed — reset interval, count lapse
        return {
            ...entry,
            lastSeen: now,
            nextReview: now + DAY_MS,
            interval: 1,
            repetitions: 0,
            lapses: entry.lapses + 1,
            easeFactor: Math.max(1.3, entry.easeFactor - 0.2),
        };
    }

    // Passed — expand interval
    let newInterval: number;
    if (entry.repetitions === 0) {
        newInterval = 1;
    } else if (entry.repetitions === 1) {
        newInterval = 3;
    } else {
        newInterval = Math.round(entry.interval * entry.easeFactor);
    }

    // Ease factor adjustment (SM-2 formula)
    const newEase = Math.max(
        1.3,
        entry.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    );

    return {
        ...entry,
        lastSeen: now,
        nextReview: now + newInterval * DAY_MS,
        interval: newInterval,
        repetitions: entry.repetitions + 1,
        easeFactor: newEase,
        lapses: entry.lapses,
    };
}

/**
 * Convert a correct/incorrect boolean + response time into SM-2 quality (0-5).
 */
export function calculateQuality(correct: boolean, responseTimeMs: number): number {
    if (!correct) return 1;
    if (responseTimeMs < 2000) return 5;   // Fast & correct = easy
    if (responseTimeMs < 5000) return 4;   // Good
    return 3;                               // Slow but correct = hard
}

// ─── Queue Management ─────────────────────────────────────────

/** Get all words due for review right now */
export function getDueWords(queue: SRSMetadata[]): SRSMetadata[] {
    const now = Date.now();
    return queue
        .filter(entry => entry.nextReview <= now)
        .sort((a, b) => a.nextReview - b.nextReview);
}

/** Get words that are "almost due" (within 6 hours) — for lesson padding */
export function getUpcomingWords(queue: SRSMetadata[], withinHours = 6): SRSMetadata[] {
    const cutoff = Date.now() + withinHours * 3600_000;
    return queue
        .filter(entry => entry.nextReview > Date.now() && entry.nextReview <= cutoff)
        .sort((a, b) => a.nextReview - b.nextReview);
}

/** Get the hardest words (lowest ease factor, most lapses) */
export function getHardWords(queue: SRSMetadata[], count = 5): SRSMetadata[] {
    return [...queue]
        .sort((a, b) => a.easeFactor - b.easeFactor || b.lapses - a.lapses)
        .slice(0, count);
}

// ─── Persistence ──────────────────────────────────────────────

export function loadSRSQueue(): SRSMetadata[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveSRSQueue(queue: SRSMetadata[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
        console.warn('Failed to save SRS queue');
    }
}

/** Add a word to the queue (if not already there) */
export function addToQueue(queue: SRSMetadata[], wordId: string): SRSMetadata[] {
    if (queue.some(e => e.wordId === wordId)) return queue;
    return [...queue, createSRSEntry(wordId)];
}

/** Record a review result and update the queue */
export function recordReview(
    queue: SRSMetadata[],
    wordId: string,
    correct: boolean,
    responseTimeMs: number
): SRSMetadata[] {
    const quality = calculateQuality(correct, responseTimeMs);
    return queue.map(entry => {
        if (entry.wordId !== wordId) return entry;
        return reviewWord(entry, quality);
    });
}
