import { type WordEntry } from "./lexicon"; // Keep types, remove getVerbs/getAllWords imports if unused
import { progressStore } from "./persistence";
import { UserProgress } from "./persistence/types";

// The card presented in a session is a standard word entry.
export type Flashcard = WordEntry;

export interface FlashcardState {
  currentCard: Flashcard | null;
  correctCount: number;
  incorrectCount: number;
  sessionSize: number;
  isFinished: boolean;
  deckLength: number;
}

/**
 * Manages the logic of a flashcard learning session.
 */
export class FlashcardEngine {
  private deck: Flashcard[] = [];
  private sourceWords: Flashcard[] = [];

  public currentCard: Flashcard | null = null;
  public correctCount = 0;
  public incorrectCount = 0;
  public sessionSize: number;

  constructor(sessionSize: number, sourceWords: Flashcard[] = []) {
    this.sessionSize = Math.max(1, sessionSize);
    this.sourceWords = sourceWords;
  }

  public setWords(words: Flashcard[]) {
    this.sourceWords = words;
  }

  private shuffle(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  public start(): void {
    if (this.sourceWords.length === 0) return;

    const wordsCopy = [...this.sourceWords];
    this.shuffle(wordsCopy);

    this.deck = wordsCopy.slice(0, this.sessionSize);
    this.currentCard = this.deck[0] ?? null;
    this.correctCount = 0;
    this.incorrectCount = 0;
  }

  public next(): Flashcard | null {
    return this.currentCard;
  }

  private processAnswer(knewIt: boolean): void {
    if (!this.currentCard) return;

    // Use 'igbo' or 'word' as ID, preferring 'igbo' as used in API
    const cardId = (this.currentCard as any).igbo || (this.currentCard as any).word || "unknown";

    progressStore.updateCardState(cardId, knewIt ? "correct" : "incorrect");

    const card = this.deck.shift();
    if (!card) return;

    if (knewIt) {
      this.correctCount++;
    } else {
      this.incorrectCount++;
      const reinsertIndex = Math.min(
        this.deck.length,
        Math.floor(Math.random() * 3) + 1
      );
      this.deck.splice(reinsertIndex, 0, card);
    }

    this.currentCard = this.deck[0] ?? null;
  }

  public markCorrect(): void {
    this.processAnswer(true);
  }

  public markIncorrect(): void {
    this.processAnswer(false);
  }

  public isComplete(): boolean {
    return this.deck.length === 0 && !this.currentCard;
  }

  // Alias for backward compatibility if needed, or just cleaner name
  public isFinished(): boolean {
    return this.isComplete();
  }

  public getState(): FlashcardState {
    return {
      currentCard: this.currentCard,
      correctCount: this.correctCount,
      incorrectCount: this.incorrectCount,
      sessionSize: this.sessionSize,
      isFinished: this.isComplete(),
      deckLength: this.deck.length
    };
  }

  public getSessionStats() {
    return {
      correct: this.correctCount,
      incorrect: this.incorrectCount,
      total: this.correctCount + this.incorrectCount,
      sessionSize: this.sessionSize,
    };
  }

  public getSummary() {
    const sessionStats = this.getSessionStats();

    // Update global session count
    const progress = progressStore.getProgress();
    progress.totalSessions += 1;
    progressStore.saveProgress(progress);

    return {
      session: sessionStats,
      total: progress,
    };
  }
}


/*
====================
EXAMPLE USAGE
====================

// This logic would live inside a UI component (e.g., a React component).

// 1. Create a new flashcard session for 10 words.
const session = new FlashcardEngine(10);
session.start();

// 2. The main loop continues as long as the session is not finished.
while (!session.isFinished()) {
  const card = session.currentCard;
  if (!card) break;

  // --- UI would render the card here and wait for user input ---
  console.log(`Current card: ${card.word}`);

  // Simulate user answering (e.g., 70% chance of knowing the word)
  const userKnewIt = Math.random() < 0.7;
  console.log(userKnewIt ? "  -> Knew it!" : "  -> Missed it.");

  // Process the answer
  session.answer(userKnewIt);
}

// 3. Once the session is over, get the summary.
const summary = session.getSummary();
console.log("\n--- Session Complete ---");
console.log(`Session Correct: ${summary.session.correct}/${summary.session.sessionSize}`);
console.log(`Total Reviewed (all time): ${summary.total.totalReviewed}`);
console.log(`Total Correct (all time): ${summary.total.totalCorrect}`);

// 4. Check localStorage in your browser's developer tools to see the saved progress.
*/
