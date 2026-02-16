import { progressStore } from "./persistence";

// XP-SYSTEM & STREAK-SYSTEM

// --- XP System ---
export const XP_PER_CORRECT_ANSWER = 10;
export const LEVELS = [
  { level: 1, xp: 0 },
  { level: 2, xp: 100 },
  { level: 3, xp: 250 },
  { level: 4, xp: 500 },
  { level: 5, xp: 1000 },
];

/**
 * // XP-SYSTEM
 * Calculates user level based on total XP.
 * @param xp - The user's total experience points.
 * @returns The user's current level.
 */
export const getUserLevel = (xp: number) => {
  const currentLevel = LEVELS.slice().reverse().find(l => xp >= l.xp);
  return currentLevel || LEVELS[0];
};

// --- Streak System ---
type StreakData = {
  currentStreak: number;
  lastPracticeDate: string | null;
};

/**
 * // STREAK-SYSTEM
 * Updates the user's streak based on the last practice date.
 * @returns The updated streak data.
 */
export const updateStreak = (): StreakData => {
  const progress = progressStore.getProgress();
  const today = new Date().toISOString().split("T")[0];

  // Logic is now mostly handled in localProgressStore during getProgress() / saveProgress() 
  // checking, but we can explicitly update it here if this is called on an action.

  // Actually, localProgressStore handles "streak broken" on read, 
  // but doesn't auto-increment on read. It just checks validity.
  // We need to increment if it's a new day and consecutive.

  const lastDate = progress.lastActivityDate;

  // Helper to check same day / consecutive
  const isSameDay = (d1: string, d2: string) => d1 === d2;
  const isConsecutive = (last: string, now: string) => {
    const d1 = new Date(last);
    const d2 = new Date(now);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 1;
  };

  if (lastDate) {
    if (isSameDay(lastDate, today)) {
      // do nothing
    } else if (isConsecutive(lastDate, today)) {
      progress.streak += 1;
      progress.lastActivityDate = today;
      progressStore.saveProgress(progress);
    } else {
      // broken streak
      progress.streak = 1; // reset to 1 as we are active today
      progress.lastActivityDate = today;
      progressStore.saveProgress(progress);
    }
  } else {
    progress.streak = 1;
    progress.lastActivityDate = today;
    progressStore.saveProgress(progress);
  }

  return {
    currentStreak: progress.streak,
    lastPracticeDate: progress.lastActivityDate,
  };
};

/**
 * // STREAK-SYSTEM
 * Retrieves the current streak from storage without updating it.
 * @returns The current streak data.
 */
export const getStreak = (): StreakData => {
  const progress = progressStore.getProgress();
  return {
    currentStreak: progress.streak,
    lastPracticeDate: progress.lastActivityDate,
  };
};
