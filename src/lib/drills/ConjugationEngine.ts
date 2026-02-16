import { Verb } from './VerbDrillEngine'; // We might want to redefine Verb here to be self-contained or import

export type TenseKey = 'present' | 'past' | 'future';
export type PronounKey = 'm' | 'f' | 'we' | 'they';

export interface ConjugationPrompt {
    verb: Verb;
    tense: TenseKey;
    pronoun: PronounKey;
    promptText: string; // "to eat"
    contextText: string; // "I (m) - Present"
}

export interface ConjugationState {
    currentPrompt: ConjugationPrompt | null;
    feedback: { correct: boolean; correctAnswer: string } | null;
    score: number;
    questionsAnswered: number;
    streak: number;
}

export const PRONOUNS = [
    { key: 'm' as PronounKey, label: 'I (m)', igbo: 'M/Mụ' },
    { key: 'f' as PronounKey, label: 'I (f)', igbo: 'M/Mụ' },
    { key: 'we' as PronounKey, label: 'We', igbo: 'Anyị' },
    { key: 'they' as PronounKey, label: 'They', igbo: 'Ha' }
];

export const TENSES = [
    { key: 'present' as TenseKey, label: 'Present' },
    { key: 'past' as TenseKey, label: 'Past' },
    { key: 'future' as TenseKey, label: 'Future' }
];

export class ConjugationEngine {
    private verbs: Verb[];
    private state: ConjugationState;

    constructor(verbs: Verb[]) {
        this.verbs = verbs;
        this.state = {
            currentPrompt: null,
            feedback: null,
            score: 0,
            questionsAnswered: 0,
            streak: 0
        };
    }

    public updateVerbs(verbs: Verb[]) {
        this.verbs = verbs;
        if (!this.state.currentPrompt && verbs.length > 0) {
            this.nextPrompt();
        }
    }

    public nextPrompt() {
        if (this.verbs.length === 0) return;

        const randomVerb = this.verbs[Math.floor(Math.random() * this.verbs.length)];
        const randomTense = TENSES[Math.floor(Math.random() * TENSES.length)];
        const randomPronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)];

        this.state.currentPrompt = {
            verb: randomVerb,
            tense: randomTense.key,
            pronoun: randomPronoun.key,
            promptText: randomVerb.english,
            contextText: `${randomPronoun.label} • ${randomTense.label}`
        };
        this.state.feedback = null;
    }

    public submitAnswer(userAnswer: string): { correct: boolean; correctAnswer: string } | null {
        if (!this.state.currentPrompt || !userAnswer.trim()) return null;

        const { verb, tense, pronoun } = this.state.currentPrompt;
        const correctAnswer = verb.conjugations[tense][pronoun];

        // Normalization: trim, lowercase, strip diacritics/accents
        // This allows "biara" to match "bịara" or "bịara"
        const normalize = (text: string) => {
            return text.toLowerCase().trim()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritics (accents, dots)
                .replace(/\s+/g, ' '); // Collapse multiple spaces
        };

        const normalizedUser = normalize(userAnswer);
        const normalizedCorrect = normalize(correctAnswer);

        // Simple check
        const isCorrect = normalizedUser === normalizedCorrect;

        this.state.feedback = {
            correct: isCorrect,
            correctAnswer: correctAnswer
        };

        if (isCorrect) {
            this.state.score += 1;
            this.state.streak += 1;
        } else {
            this.state.streak = 0;
        }
        this.state.questionsAnswered += 1;

        return this.state.feedback;
    }

    public getState(): ConjugationState {
        return { ...this.state };
    }
}
