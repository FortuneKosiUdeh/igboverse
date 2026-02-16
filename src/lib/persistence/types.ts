export interface CardProgress {
  interval: number;
  repetitions: number;
  easeFactor: number;
  nextReviewDate: string;
}

export interface UserProgress {
  xp: number;
  streak: number;
  lastActivityDate: string | null;
  totalSessions: number;
  cards: Record<string, CardProgress>;
}

export interface ProgressStore {
  getProgress(): UserProgress;
  saveProgress(progress: UserProgress): void;
  updateCardState(cardId: string, result: "correct" | "incorrect"): void;
  reset(): void;
}
