import { DialectVariant } from '@/lib/dialect';

export type Verb = {
    id: number;
    infinitive: string;
    english: string;
    audioUrl: string | null;
    examples?: { igbo: string; english: string; pronunciation?: string }[];
    dialectVariants: DialectVariant[];
    conjugations: {
        present: { m: string; f: string; we: string; they: string };
        past: { m: string; f: string; we: string; they: string };
        future: { m: string; f: string; we: string; they: string };
    };
};

export type TenseKey = 'present' | 'past' | 'future';
export type PronounKey = 'm' | 'f' | 'we' | 'they';

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

export interface DrillState {
    currentVerb: Verb | null;
    selectedTense: TenseKey;
    selectedPronoun: PronounKey;
    feedback: { correct: boolean; correctAnswer: string } | null;
    score: number;
    questionsAnswered: number;
    isComplete: boolean;
}

export class VerbDrillEngine {
    private verbs: Verb[];
    private state: DrillState;

    constructor(verbs: Verb[]) {
        this.verbs = verbs;
        this.state = {
            currentVerb: null,
            selectedTense: 'present',
            selectedPronoun: 'm',
            feedback: null,
            score: 0,
            questionsAnswered: 0,
            isComplete: false
        };
    }

    public updateVerbs(verbs: Verb[]) {
        this.verbs = verbs;
        // If we have no current question and we have verbs now, start.
        if (!this.state.currentVerb && verbs.length > 0) {
            this.nextQuestion();
        }
    }

    public init() {
        this.nextQuestion();
    }

    public nextQuestion() {
        if (this.verbs.length === 0) return;

        // Random selection logic
        const randomVerb = this.verbs[Math.floor(Math.random() * this.verbs.length)];
        const randomTense = TENSES[Math.floor(Math.random() * TENSES.length)].key;
        const randomPronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)].key;

        this.state.currentVerb = randomVerb;
        this.state.selectedTense = randomTense;
        this.state.selectedPronoun = randomPronoun;
        this.state.feedback = null;
    }

    public submitAnswer(userAnswer: string): { correct: boolean; correctAnswer: string } | null {
        if (!this.state.currentVerb || !userAnswer.trim()) return null;

        const correctAnswer = this.state.currentVerb.conjugations[this.state.selectedTense][this.state.selectedPronoun];
        const isCorrect = userAnswer.trim().toLowerCase() === correctAnswer.toLowerCase();

        this.state.feedback = {
            correct: isCorrect,
            correctAnswer: correctAnswer
        };

        if (isCorrect) {
            this.state.score += 1;
        }
        this.state.questionsAnswered += 1;

        return this.state.feedback;
    }

    public getState(): DrillState {
        // Return a copy to prevent direct mutation but lightweight enough
        return { ...this.state };
    }
}
