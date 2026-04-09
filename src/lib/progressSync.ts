'use client';
/**
 * Progress Sync — reads and writes user profile + SRS queue to Supabase
 * using the zero-dependency REST client.
 */

import { dbSelect, dbUpsert } from './supabase';
import { SRSMetadata } from './lesson/types';

// ─── Types ────────────────────────────────────────────────────────

export interface UserProfile {
    totalXP: number;
    level: number;
    wordsLearned: number;
    lessonsCompleted: number;
    reviewsCompleted: number;   // SRS review sessions (distinct from new-word lessons)
    currentStreak: number;
    longestStreak: number;
    lastSessionDate: string;
    seenWordIds: string[];
}

// ─── User Progress ────────────────────────────────────────────────

export async function loadProgressFromDB(userId: string): Promise<UserProfile | null> {
    if (typeof window === 'undefined') return null;
    try {
        const { data, error } = await dbSelect('user_progress', {
            select:  '*',
            user_id: `eq.${userId}`,
            limit:   '1',
        });
        if (error || !data || data.length === 0) return null;
        const d = data[0] as Record<string, unknown>;
        return {
            totalXP:          (d.total_xp          as number)  ?? 0,
            level:            (d.level             as number)  ?? 1,
            wordsLearned:     (d.words_learned      as number)  ?? 0,
            lessonsCompleted: (d.lessons_completed  as number)  ?? 0,
            reviewsCompleted: (d.reviews_completed  as number)  ?? 0,
            currentStreak:    (d.current_streak     as number)  ?? 0,
            longestStreak:    (d.longest_streak     as number)  ?? 0,
            lastSessionDate:  (d.last_session_date  as string)  ?? '',
            seenWordIds:      (d.seen_word_ids      as string[]) ?? [],
        };
    } catch (err) {
        console.warn('[progressSync] loadProgressFromDB error:', err);
        return null;
    }
}

export async function saveProgressToDB(userId: string, profile: UserProfile): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const { error } = await dbUpsert('user_progress', {
            user_id:            userId,
            total_xp:           profile.totalXP,
            level:              profile.level,
            words_learned:      profile.wordsLearned,
            lessons_completed:  profile.lessonsCompleted,
            reviews_completed:  profile.reviewsCompleted,
            current_streak:     profile.currentStreak,
            longest_streak:     profile.longestStreak,
            last_session_date:  profile.lastSessionDate || null,
            seen_word_ids:      profile.seenWordIds,
        }, 'user_id');
        if (error) console.warn('[progressSync] saveProgressToDB error:', error.message);
    } catch (err) {
        console.warn('[progressSync] saveProgressToDB exception:', err);
    }
}

export function mergeProfiles(local: UserProfile, remote: UserProfile): UserProfile {
    const seenWordIds = Array.from(new Set([...local.seenWordIds, ...remote.seenWordIds]));
    return {
        totalXP:          Math.max(local.totalXP, remote.totalXP),
        level:            Math.max(local.level, remote.level),
        wordsLearned:     Math.max(local.wordsLearned, remote.wordsLearned),
        lessonsCompleted: Math.max(local.lessonsCompleted, remote.lessonsCompleted),
        reviewsCompleted: Math.max(local.reviewsCompleted ?? 0, remote.reviewsCompleted ?? 0),
        currentStreak:    local.lastSessionDate >= (remote.lastSessionDate || '')
            ? local.currentStreak : remote.currentStreak,
        longestStreak:    Math.max(local.longestStreak, remote.longestStreak),
        lastSessionDate:  local.lastSessionDate >= (remote.lastSessionDate || '')
            ? local.lastSessionDate : remote.lastSessionDate,
        seenWordIds,
    };
}

// ─── SRS Queue ────────────────────────────────────────────────────

export async function loadSrsFromDB(userId: string): Promise<SRSMetadata[]> {
    if (typeof window === 'undefined') return [];
    try {
        const { data, error } = await dbSelect('srs_queue', {
            select:  '*',
            user_id: `eq.${userId}`,
        });
        if (error || !data) return [];
        return data.map((row: Record<string, unknown>) => ({
            wordId:         row.word_id        as string,
            lastSeen:       row.last_seen      as number,
            nextReview:     row.next_review    as number,
            easeFactor:     row.ease_factor    as number,
            interval:       row.interval_days  as number,
            repetitions:    row.repetitions    as number,
            lapses:         row.lapses         as number,
            spokenAttempts: (row.spoken_attempts as number) ?? 0,
            spokenCorrect:  (row.spoken_correct  as number) ?? 0,
        }));
    } catch (err) {
        console.warn('[progressSync] loadSrsFromDB error:', err);
        return [];
    }
}

export async function saveSrsToDB(userId: string, queue: SRSMetadata[]): Promise<void> {
    if (typeof window === 'undefined' || queue.length === 0) return;
    try {
        const rows = queue.map(e => ({
            user_id:          userId,
            word_id:          e.wordId,
            last_seen:        e.lastSeen,
            next_review:      e.nextReview,
            ease_factor:      e.easeFactor,
            interval_days:    e.interval,
            repetitions:      e.repetitions,
            lapses:           e.lapses,
            spoken_attempts:  e.spokenAttempts ?? 0,
            spoken_correct:   e.spokenCorrect  ?? 0,
        }));

        // Upsert in chunks of 100 to stay within payload limits
        for (let i = 0; i < rows.length; i += 100) {
            const { error } = await dbUpsert('srs_queue', rows.slice(i, i + 100), 'user_id,word_id');
            if (error) { console.warn('[progressSync] saveSrsToDB error:', error.message); break; }
        }
    } catch (err) {
        console.warn('[progressSync] saveSrsToDB exception:', err);
    }
}

export function mergeSrsQueues(local: SRSMetadata[], remote: SRSMetadata[]): SRSMetadata[] {
    const map = new Map<string, SRSMetadata>();
    for (const entry of remote) map.set(entry.wordId, entry);
    for (const entry of local) {
        const prev = map.get(entry.wordId);
        if (!prev || entry.lastSeen > prev.lastSeen) map.set(entry.wordId, entry);
    }
    return Array.from(map.values());
}

// ─── Assembly Metrics ─────────────────────────────────────────────

/**
 * Upserts the current session's average assembly response time (ms)
 * into user_progress.avg_assembly_ms. Fire-and-forget.
 */
export async function saveAssemblyMetricsToDB(
    userId: string,
    avgAssemblyMs: number,
): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const { error } = await dbUpsert('user_progress', {
            user_id:          userId,
            avg_assembly_ms:  Math.round(avgAssemblyMs),
        }, 'user_id');
        if (error) console.warn('[progressSync] saveAssemblyMetricsToDB error:', error.message);
    } catch (err) {
        console.warn('[progressSync] saveAssemblyMetricsToDB exception:', err);
    }
}
