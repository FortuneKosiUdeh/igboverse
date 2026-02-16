import { ProgressStore, UserProgress, CardProgress } from "./types";
import { calculateNextState, DEFAULT_CARD_PROGRESS } from "../srs/srsEngine";

const STORAGE_KEY = "igboverse_persistence_v1";
// Legacy keys for migration
const LEGACY_PROGRESS_KEY = "igboverse_user_progress";
const LEGACY_STREAK_KEY = "igboverse_streak";

export class LocalProgressStore implements ProgressStore {
    private getToday(): string {
        return new Date().toISOString().split("T")[0];
    }

    private isConsecutiveDay(lastDate: string, today: string): boolean {
        const d1 = new Date(lastDate);
        const d2 = new Date(today);
        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays === 1;
    }

    private getDefaultProgress(): UserProgress {
        return {
            xp: 0,
            streak: 0,
            lastActivityDate: null,
            totalSessions: 0,
            cards: {},
        };
    }

    private migrateLegacyData(): UserProgress | null {
        if (typeof window === "undefined") return null;

        try {
            // Try to recover XP and Streak from legacy keys
            const legacyProgressRaw = localStorage.getItem(LEGACY_PROGRESS_KEY);
            const legacyStreakRaw = localStorage.getItem(LEGACY_STREAK_KEY);

            let xp = 0;
            let streak = 0;
            let lastActivityDate = null;
            let sessions = 0;

            if (legacyProgressRaw) {
                const parsed = JSON.parse(legacyProgressRaw);
                xp = parsed.xp || 0;
                sessions = parsed.sessionsCompleted || 0;
                // UserProgress in progressTracker has dailyStreak and lastActivityDate
                if (parsed.dailyStreak) streak = parsed.dailyStreak;
                if (parsed.lastActivityDate) lastActivityDate = parsed.lastActivityDate;
            }

            // If rewards.ts streak was more authoritative or newer, maybe check it? 
            // But progressTracker seemed to be the main one. 
            // We'll stick to progressTracker for now.

            if (xp === 0 && streak === 0 && sessions === 0) return null;

            return {
                xp,
                streak,
                lastActivityDate,
                totalSessions: sessions,
                cards: {}, // Cards were not persisted individually before
            };
        } catch (e) {
            console.warn("Failed to migrate legacy data", e);
            return null;
        }
    }

    public getProgress(): UserProgress {
        if (typeof window === "undefined") {
            return this.getDefaultProgress();
        }

        let progress: UserProgress;

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                progress = JSON.parse(stored);
            } else {
                // Try migration or default
                progress = this.migrateLegacyData() || this.getDefaultProgress();
                // If we migrated, save it immediately to the new key
                if (progress !== this.getDefaultProgress()) {
                    this.saveProgress(progress);
                }
            }
        } catch (error) {
            console.error("Failed to load progress:", error);
            progress = this.getDefaultProgress();
        }

        // Check streak validity (read-only check)
        if (progress.lastActivityDate) {
            const today = this.getToday();
            if (progress.lastActivityDate !== today && !this.isConsecutiveDay(progress.lastActivityDate, today)) {
                // Streak is broken
                // We handle this logically here, but we might not want to PERSIST the break 
                // until the user actually does something. 
                // However, to the UI, the streak is 0.
                // We'll return a modified object without saving, so UI shows 0.
                // If we saved it, we might lose the "lastActivityDate" history if we null it out, 
                // but keeping the date and zeroing the streak is fine.
                return {
                    ...progress,
                    streak: 0
                };
            }
        }

        return progress;
    }

    public saveProgress(progress: UserProgress): void {
        if (typeof window === "undefined") return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        } catch (error) {
            console.error("Failed to save progress:", error);
        }
    }

    public updateCardState(cardId: string, result: "correct" | "incorrect"): void {
        const progress = this.getProgress();
        const card = progress.cards[cardId] || { ...DEFAULT_CARD_PROGRESS }; // Clone default

        const nextState = calculateNextState(card, result === "correct");

        progress.cards[cardId] = nextState;
        this.saveProgress(progress);
    }

    public reset(): void {
        if (typeof window === "undefined") return;
        try {
            localStorage.removeItem(STORAGE_KEY);
            // cleaning up legacy keys too if we want a hard reset
            localStorage.removeItem(LEGACY_PROGRESS_KEY);
            localStorage.removeItem(LEGACY_STREAK_KEY);
        } catch (error) {
            console.error("error fetching local storage", error);
        }

    }
}
