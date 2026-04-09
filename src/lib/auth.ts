'use client';
/**
 * Anonymous Auth — wraps supabase.ts REST client.
 */

import { getSession, signInAnonymously, updateUserEmail } from './supabase';

const USER_ID_KEY = 'igboverse_user_id';

export async function initializeUser(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    try {
        // 1. Existing session?
        const session = await getSession();
        if (session?.user) {
            localStorage.setItem(USER_ID_KEY, session.user.id);
            return session.user.id;
        }

        // 2. Sign in anonymously
        const newSession = await signInAnonymously();
        if (!newSession?.user) {
            console.warn('[auth] signInAnonymously returned no user');
            return null;
        }

        localStorage.setItem(USER_ID_KEY, newSession.user.id);
        return newSession.user.id;
    } catch (err) {
        console.warn('[auth] initializeUser error:', err);
        return null;
    }
}

export function getCachedUserId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(USER_ID_KEY);
}

export async function claimAccountWithEmail(email: string): Promise<string | null> {
    return updateUserEmail(email);
}
