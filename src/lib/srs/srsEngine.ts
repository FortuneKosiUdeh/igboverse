import { CardProgress, UserProgress } from "../persistence/types";
import { WordEntry } from "../lexicon";

/**
 * Simplified SM-2 algorithm implementation for local SRS.
 */

// Default values for a new card
export const DEFAULT_CARD_PROGRESS: CardProgress = {
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextReviewDate: new Date().toISOString().split("T")[0], // Review immediately
};

/**
 * Calculates the next state of a card based on the answer quality (simplified to correct/incorrect).
 * @param current - The current progress state of the card.
 * @param isCorrect - Whether the user answered correctly.
 * @returns The updated progress state.
 */
export function calculateNextState(current: CardProgress, isCorrect: boolean): CardProgress {
    let { interval, repetitions, easeFactor } = current;

    if (isCorrect) {
        if (repetitions === 0) {
            interval = 1;
        } else if (repetitions === 1) {
            interval = 6;
        } else {
            interval = Math.round(interval * easeFactor);
        }
        repetitions += 1;
    } else {
        repetitions = 0;
        interval = 1;
        easeFactor = Math.max(1.3, easeFactor - 0.2); // Decrease EF on failure, floor at 1.3
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);
    const nextReviewDate = nextDate.toISOString().split("T")[0];

    return {
        interval,
        repetitions,
        easeFactor,
        nextReviewDate,
    };
}

/**
 * Checks if a card is due for review.
 * @param card - The card progress.
 * @returns True if the card is due or new (no progress).
 */
export function isDue(card: CardProgress | undefined): boolean {
    if (!card) return true; // New cards are due immediately
    const today = new Date().toISOString().split("T")[0];
    return card.nextReviewDate <= today;
}

/**
 * Filters a list of words to return only those due for review.
 * @param words - The full list of available words.
 * @param progress - The user's progress data containing card states.
 * @returns Array of words that are due.
 */
export function filterDueCards(words: WordEntry[], progress: UserProgress): WordEntry[] {
    return words.filter((word) => {
        const cardId = word.word || (word as any).igbo; // Robust ID access
        const cardProgress = progress.cards[cardId];
        return isDue(cardProgress);
    });
}
