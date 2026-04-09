'use client';
/**
 * Dialect utilities for Igboverse.
 *
 * Maps onboarding diagnostic dialect answers → IgboAPI community identifiers,
 * and provides helpers for surfacing dialect variants in lesson steps.
 *
 * Bridge strategy: show Standard (Izugbe) as primary; dialect form secondary.
 * Never suppress the home dialect — build the bridge, don't demolish the house.
 */

import { WordEntry, DialectVariantEntry } from './lesson/types';
import { loadDiagnostic } from '@/components/ui/OnboardingDiagnostic';

// ─── IgboAPI community identifier map ────────────────────────────

/**
 * Maps the onboarding answer to the community string used in IgboAPI dialects[].
 * Returns null for "Standard only" cases (Another dialect / Not sure).
 */
const DIALECT_MAP: Record<string, string | null> = {
    'Onitsha / Onicha': 'Onicha',
    'Owerri / Owere':   'Owere',
    'Enugu / Waawa':    'Waawa',
    'Another dialect':  null,
    'Not sure':         null,
};

/** Human-readable short label for the dialect chip on the home screen */
const DIALECT_LABEL_MAP: Record<string, string> = {
    'Onitsha / Onicha': 'Onitsha',
    'Owerri / Owere':   'Owerri',
    'Enugu / Waawa':    'Enugu / Waawa',
    'Another dialect':  'Local dialect',
    'Not sure':         '',
};

// ─── Public helpers ───────────────────────────────────────────────

/**
 * Returns the IgboAPI community identifier for the user's dialect, or null
 * if the user selected "Standard only" options.
 */
export function getDialectId(): string | null {
    const d = loadDiagnostic();
    if (!d?.dialect) return null;
    return DIALECT_MAP[d.dialect] ?? null;
}

/**
 * Returns the short, human-readable dialect label for the home-screen chip.
 * Returns empty string when no dialect is set or it's "Not sure".
 */
export function getDialectLabel(): string {
    const d = loadDiagnostic();
    if (!d?.dialect) return '';
    return DIALECT_LABEL_MAP[d.dialect] ?? '';
}

/**
 * Looks up the dialect variant entry for a word matching the user's dialect.
 * Returns null if no matching dialect variant exists.
 */
export function getDialectVariant(word: WordEntry): DialectVariantEntry | null {
    const dialectId = getDialectId();
    if (!dialectId || !word.dialects?.length) return null;

    return (
        word.dialects.find(d =>
            d.communities.some(c =>
                c.toLowerCase().includes(dialectId.toLowerCase())
            )
        ) ?? null
    );
}

// ─── Onitsha -rV → -lV suffix bridging ───────────────────────────

/**
 * Onitsha Igbo systematically replaces the Standard -rV past suffix with -lV.
 * e.g. "sìrì" → "sìlì", "rụọ" → "lụọ"
 *
 * Given a Standard Igbo word, returns the Onitsha form if the user's dialect
 * is Onitsha. Returns null otherwise, or if the word doesn't match the pattern.
 */
export function toOnitshaPast(standardForm: string): string | null {
    const dialectId = getDialectId();
    if (dialectId !== 'Onicha') return null;

    // Match a consonant cluster followed by vowel + r + vowel (the -rV pattern)
    // Simple heuristic: replace 'r' followed by a vowel at end of a syllable
    const converted = standardForm
        .replace(/r([aeioụịọu])/gi, 'l$1')
        .replace(/ri\b/gi, 'li')
        .replace(/re\b/gi, 'le');

    return converted !== standardForm ? converted : null;
}

/**
 * Returns true if the user is an Onitsha dialect learner and the two forms
 * are related by the -rV → -lV shift (so both should be accepted as correct).
 */
export function isOnitshaPairOf(standard: string, attempt: string): boolean {
    const dialectId = getDialectId();
    if (dialectId !== 'Onicha') return false;
    const onitsha = toOnitshaPast(standard);
    return onitsha !== null && onitsha.toLowerCase() === attempt.toLowerCase();
}
