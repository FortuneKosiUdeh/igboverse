
export type StructureDrillType = 'sentence-builder' | 'translation' | 'pronoun-match';

export interface StructureQuestion {
    id: string;
    type: StructureDrillType;
    prompt: string; // The question or English text
    context?: string; // Extra hints

    // For Sentence Builder
    segments?: string[]; // ["Anyị", "na-eje", "ahịa"]
    correctOrder?: string[];

    // For Translation / Matching
    options?: string[];
    correctAnswer?: string;

    // Audio? Keep simple for now
}

export interface StructureState {
    currentQuestion: StructureQuestion | null;
    feedback: { correct: boolean; message: string } | null;
    score: number;
    totalQuestions: number;
    isComplete: boolean;
}

export class StructureDrillEngine {
    private questions: StructureQuestion[];
    private state: StructureState;

    constructor(initialQuestions: StructureQuestion[] = []) {
        this.questions = [...initialQuestions];
        this.state = {
            currentQuestion: null,
            feedback: null,
            score: 0,
            totalQuestions: 0,
            isComplete: false
        };
    }

    public clone(): StructureDrillEngine {
        // Helper if needed for immutable state update patterns, though we use refs
        const engine = new StructureDrillEngine(this.questions);
        engine.state = { ...this.state };
        return engine;
    }

    public updateQuestions(questions: StructureQuestion[]) {
        this.questions = [...questions];
        this.state.isComplete = false;
        if (!this.state.currentQuestion && this.questions.length > 0) {
            this.nextQuestion();
        }
    }

    public init() {
        this.nextQuestion();
    }

    public nextQuestion() {
        if (this.questions.length === 0) {
            this.state.isComplete = true;
            this.state.currentQuestion = null;
            return;
        }

        // Simple exhaustive pop for now, or random?
        // "Shuffle words" implies random order of segments is handled by UI? 
        // Or we provide shuffled segments?
        // We'll just take the next one.
        const q = this.questions.shift()!;
        this.state.currentQuestion = q;
        this.state.feedback = null;
        this.state.totalQuestions++;
    }

    public submitAnswer(answer: string | string[]): boolean {
        if (!this.state.currentQuestion) return false;

        const q = this.state.currentQuestion;
        let isCorrect = false;

        if (q.type === 'sentence-builder') {
            // Answer is array of strings (segments)
            if (Array.isArray(answer)) {
                isCorrect = JSON.stringify(answer) === JSON.stringify(q.correctOrder);
            }
        } else {
            // String match
            if (typeof answer === 'string') {
                isCorrect = answer.trim() === q.correctAnswer;
            }
        }

        this.state.feedback = {
            correct: isCorrect,
            message: isCorrect ? 'Correct!' : `Incorrect. Answer: ${Array.isArray(q.correctOrder) ? q.correctOrder.join(' ') : q.correctAnswer}`
        };

        if (isCorrect) this.state.score++;

        return isCorrect;
    }

    public getState(): StructureState {
        return { ...this.state };
    }
}
