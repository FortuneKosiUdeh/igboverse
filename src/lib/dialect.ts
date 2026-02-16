/**
 * Dialect System — Verified against live IgboAPI responses.
 *
 * Layer A: Community Dialects (API-level)
 *   Exact dialect names returned by IgboAPI (e.g., Ọnịcha, Owere, Ngwa).
 *
 * Layer B: Regional Groupings (App-level abstraction)
 *   Community dialects mapped to user-friendly regional groups.
 *
 * Data Integrity:
 *   - All community names come from verified IgboAPI responses.
 *   - Geographic mappings are established facts, not inventions.
 *   - No fabricated dialect differences.
 */

// --- Layer B: Regional Groups (user-facing selection) ---

export type DialectGroup = 'standard' | 'anambra' | 'imo' | 'abia' | 'enugu' | 'ebonyi';

export interface DialectGroupInfo {
    id: DialectGroup;
    label: string;
    description: string;
    communities: string[]; // Community names that belong to this group
}

export const DIALECT_GROUPS: DialectGroupInfo[] = [
    {
        id: 'standard',
        label: 'Standard Igbo',
        description: 'Igbo Izugbe — the standard literary form',
        communities: []
    },
    {
        id: 'anambra',
        label: 'Anambra-area',
        description: 'Ọnịcha, Achala, Obosi, Ogidi, Ọka, Anam, Ajalị dialects',
        communities: ['Ọnịcha', 'Achala', 'Obosi', 'Ogidi', 'Ọka', 'Anam', 'Ajalị']
    },
    {
        id: 'imo',
        label: 'Imo-area',
        description: 'Owere, Mbaise, Isuama, Ihuoma, Amaifeke dialects',
        communities: ['Owere', 'Mbaise', 'Isuama', 'Ihuoma', 'Amaifeke']
    },
    {
        id: 'abia',
        label: 'Abia-area',
        description: 'Ngwa, Abịrịba, Mkpọọ, Ọhụhụ, Ụmụahịa dialects',
        communities: ['Ngwa', 'Abịrịba', 'Mkpọọ', 'Ọhụhụ', 'Ụmụahịa']
    },
    {
        id: 'enugu',
        label: 'Enugu-area',
        description: 'Nsụka, Ezeagu, Nkanụ dialects',
        communities: ['Nsụka', 'Ezeagu', 'Nkanụ']
    },
    {
        id: 'ebonyi',
        label: 'Ebonyi-area',
        description: 'Afiikpo, Ezaa, Ikwo, Ezzamgbo, Izii dialects',
        communities: ['Afiikpo', 'Ezaa', 'Ikwo', 'Ezzamgbo', 'Izii']
    }
];

// --- Layer A: Community → Group Mapping (API-level → App-level) ---

/**
 * Maps community dialect names (as returned by IgboAPI) to regional groups.
 * Every key here is a verified dialect name from live API responses.
 */
export const COMMUNITY_TO_GROUP: Record<string, DialectGroup> = {
    // Anambra-area
    'Ọnịcha': 'anambra',
    'Achala': 'anambra',
    'Obosi': 'anambra',
    'Ogidi': 'anambra',
    'Ọka': 'anambra',
    'Anam': 'anambra',
    'Ajalị': 'anambra',
    // Imo-area
    'Owere': 'imo',
    'Mbaise': 'imo',
    'Isuama': 'imo',
    'Ihuoma': 'imo',
    'Amaifeke': 'imo',
    // Abia-area
    'Ngwa': 'abia',
    'Abịrịba': 'abia',
    'Mkpọọ': 'abia',
    'Ọhụhụ': 'abia',
    'Ụmụahịa': 'abia',
    // Enugu-area
    'Nsụka': 'enugu',
    'Ezeagu': 'enugu',
    'Nkanụ': 'enugu',
    // Ebonyi-area
    'Afiikpo': 'ebonyi',
    'Ezaa': 'ebonyi',
    'Ikwo': 'ebonyi',
    'Ezzamgbo': 'ebonyi',
    'Izii': 'ebonyi',
};

// --- Dialect Variant (per-word) ---

export interface DialectVariant {
    word: string;                   // The dialectal form of the word
    pronunciation: string | null;   // Dialect-specific audio URL
    communities: string[];          // Community names that use this form
    groups: DialectGroup[];         // Resolved regional groups
}

// --- Dialect Preference (user state) ---

const DIALECT_STORAGE_KEY = 'igboverse_selected_dialect';

export function getSelectedDialect(): DialectGroup {
    if (typeof window === 'undefined') return 'standard';
    const stored = localStorage.getItem(DIALECT_STORAGE_KEY);
    if (stored && isValidDialectGroup(stored)) return stored as DialectGroup;
    return 'standard';
}

export function setSelectedDialect(group: DialectGroup): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DIALECT_STORAGE_KEY, group);
}

function isValidDialectGroup(value: string): value is DialectGroup {
    return ['standard', 'anambra', 'imo', 'abia', 'enugu', 'ebonyi'].includes(value);
}

// --- Dialect Resolution Utility ---

/**
 * Given a list of dialect variants and a selected group,
 * returns the best matching variant or null (fallback to standard).
 */
export function resolveDialectVariant(
    variants: DialectVariant[],
    selectedGroup: DialectGroup
): DialectVariant | null {
    if (selectedGroup === 'standard') return null;
    if (!variants || variants.length === 0) return null;

    // Find first variant that belongs to the selected group
    for (const variant of variants) {
        if (variant.groups.includes(selectedGroup)) {
            return variant;
        }
    }

    // No match — fallback to standard (return null)
    return null;
}

/**
 * Resolves community names from the API to regional groups.
 */
export function resolveGroups(communities: string[]): DialectGroup[] {
    const groups = new Set<DialectGroup>();
    for (const community of communities) {
        const group = COMMUNITY_TO_GROUP[community];
        if (group) groups.add(group);
    }
    return Array.from(groups);
}

/**
 * Returns the label for a dialect group.
 */
export function getDialectGroupLabel(group: DialectGroup): string {
    const info = DIALECT_GROUPS.find(g => g.id === group);
    return info?.label ?? 'Standard Igbo';
}
