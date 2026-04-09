/**
 * Curriculum clusters — thematic word groups ordered for progressive learning.
 *
 * Each theme defines API search keywords and filters. The LessonGenerator
 * uses these to fetch real words from IgboAPI and build micro-lessons.
 *
 * Order follows the "Lego Block" principle:
 *  1. Concrete nouns (easy mental imagery)
 *  2. High-frequency verbs (action mapping)
 *  3. Daily life phrases (pattern absorption)
 *  4. Abstract/compound (after foundation)
 */

import { CurriculumTheme } from './types';

export const CURRICULUM: CurriculumTheme[] = [
    // ─── Tier 1: Anchors (first week) ────────────────────────
    {
        id: 'greetings',
        name: 'Greetings',
        description: 'Hello, thank you, and essential social words',
        icon: '👋',
        searchKeywords: ['good morning', 'hello', 'thank', 'please', 'welcome', 'good night', 'sorry'],
        wordClasses: ['INTJ', 'NNC', 'AV'],
        order: 1,
        color: '#10b981',
    },
    {
        id: 'food-drink',
        name: 'Food & Drink',
        description: 'What you eat and drink every day',
        icon: '🍲',
        searchKeywords: ['food', 'eat', 'water', 'drink', 'cook', 'yam', 'rice', 'pepper', 'meat', 'fish', 'oil', 'salt'],
        wordClasses: ['NNC', 'AV'],
        order: 2,
        color: '#f59e0b',
    },
    {
        id: 'family',
        name: 'Family & People',
        description: 'Mother, father, child, and your people',
        icon: '👨‍👩‍👧',
        searchKeywords: ['mother', 'father', 'child', 'brother', 'sister', 'friend', 'person', 'woman', 'man', 'wife', 'husband'],
        wordClasses: ['NNC', 'NM'],
        order: 3,
        color: '#8b5cf6',
    },

    // ─── Tier 2: Actions (week 2-3) ─────────────────────────
    {
        id: 'core-verbs',
        name: 'Core Actions',
        description: 'Go, come, see, buy — the verbs you use every hour',
        icon: '🏃',
        searchKeywords: ['go', 'come', 'eat', 'see', 'buy', 'give', 'run', 'say', 'want', 'do', 'know', 'hear', 'take', 'bring', 'open', 'close'],
        wordClasses: ['AV'],
        order: 4,
        color: '#ef4444',
    },
    {
        id: 'body',
        name: 'Body & Health',
        description: 'Head, hand, eye — know your body',
        icon: '🫀',
        searchKeywords: ['head', 'hand', 'eye', 'mouth', 'body', 'leg', 'ear', 'nose', 'stomach', 'back', 'tooth'],
        wordClasses: ['NNC'],
        order: 5,
        color: '#ec4899',
    },

    // ─── Tier 3: Environment (week 3-4) ─────────────────────
    {
        id: 'home-places',
        name: 'Home & Places',
        description: 'House, market, school, road — where life happens',
        icon: '🏠',
        searchKeywords: ['house', 'door', 'market', 'school', 'church', 'road', 'village', 'town', 'bed', 'room', 'land'],
        wordClasses: ['NNC'],
        order: 6,
        color: '#0ea5e9',
    },
    {
        id: 'nature',
        name: 'Nature & Animals',
        description: 'Dog, bird, tree, rain — the world around you',
        icon: '🌿',
        searchKeywords: ['dog', 'cat', 'bird', 'tree', 'fire', 'rain', 'sun', 'moon', 'goat', 'chicken', 'river'],
        wordClasses: ['NNC', 'AV'],
        order: 7,
        color: '#22c55e',
    },
    {
        id: 'time-numbers',
        name: 'Time & Numbers',
        description: 'Today, tomorrow, one, two, three — counting and days',
        icon: '🕐',
        searchKeywords: ['one', 'two', 'three', 'four', 'five', 'day', 'night', 'morning', 'year', 'today', 'tomorrow', 'week'],
        wordClasses: ['NNC', 'CD', 'ADV'],
        order: 8,
        color: '#6366f1',
    },

    // ─── Tier 4: Expansion (month 2+) ───────────────────────
    {
        id: 'emotions',
        name: 'Feelings',
        description: 'Happy, sad, angry, afraid — express your inner world',
        icon: '💭',
        searchKeywords: ['happy', 'sad', 'angry', 'fear', 'love', 'hate', 'laugh', 'cry', 'worry', 'tired'],
        wordClasses: ['AV', 'ADJ', 'NNC'],
        order: 9,
        color: '#f97316',
    },
    {
        id: 'clothing',
        name: 'Clothing & Appearance',
        description: 'Cloth, shoe, hat — dress and look',
        icon: '👔',
        searchKeywords: ['cloth', 'shoe', 'hat', 'dress', 'wear', 'red', 'white', 'black', 'beautiful', 'big', 'small'],
        wordClasses: ['NNC', 'AV', 'ADJ'],
        order: 10,
        color: '#a855f7',
    },
];

/**
 * Returns themes unlocked at a given level.
 * Level 1 → first 3 themes. Each subsequent level adds 1.
 */
export function getUnlockedThemes(level: number): CurriculumTheme[] {
    const unlockCount = Math.min(2 + level, CURRICULUM.length);
    return CURRICULUM.slice(0, unlockCount);
}

/**
 * Returns the next theme to unlock, or null if all unlocked.
 */
export function getNextLockedTheme(level: number): CurriculumTheme | null {
    const unlocked = getUnlockedThemes(level);
    if (unlocked.length >= CURRICULUM.length) return null;
    return CURRICULUM[unlocked.length];
}
