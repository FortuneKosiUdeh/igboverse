/**
 * @fileoverview Verb drill engine for the Igboverse app.
 * This module provides a reusable, UI-agnostic class to generate and manage
 * multiple-choice verb drills.
 */

import { type WordEntry, getVerbs } from "./lexicon";

/**
 * Represents a single multiple-choice question in a drill.
 */
export interface DrillQuestion {
  /** The prompt to display to the user (either an Igbo verb or an English definition). */
  prompt: string;
  /** An array of 4 possible answers. */
  options: string[];
  /** The index of the correct answer in the `options` array. */
  correctAnswerIndex: number;
  /** The full WordEntry for the correct answer, useful for showing details after the answer. */
  correctWord: WordEntry;
}

/**
 * A summary of the user's performance in a drill session.
 */
export interface DrillSummary {
  correctCount: number;
  incorrectCount: number;
  totalQuestions: number;
  score: number; // A percentage score
}

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param array The array to shuffle.
 */
function shuffle(array: any[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Safely gets the primary English definition from a word entry.
 * @param word The word entry.
 * @returns The definition string or null if not found.
 */
function getPrimaryDefinition(word: WordEntry): string | null {
  return word.definitions?.[0]?.items?.[0]?.english ?? null;
}

/**
 * Manages the logic of a verb drill session.
 */
export class VerbDrillEngine {
  private questions: DrillQuestion[] = [];
  private verbPool: WordEntry[];

  public currentQuestionIndex = 0;
  public correctCount = 0;
  public incorrectCount = 0;
  public drillSize: number;

  /**
   * @param drillSize The number of questions in the drill.
   */
  constructor(drillSize: number) {
    this.drillSize = Math.max(1, drillSize);
    // Filter verbs to ensure they have a usable definition for generating questions.
    this.verbPool = getVerbs().filter((verb) => getPrimaryDefinition(verb));
  }

  /**
   * Generates the set of questions for the drill.
   */
  public start(): void {
    this.questions = [];
    this.currentQuestionIndex = 0;
    this.correctCount = 0;
    this.incorrectCount = 0;

    shuffle(this.verbPool);

    for (let i = 0; i < Math.min(this.drillSize, this.verbPool.length); i++) {
      const correctVerb = this.verbPool[i];
      const question = this.generateQuestion(correctVerb);
      if (question) {
        this.questions.push(question);
      }
    }
    // Adjust drill size if not enough valid verbs were found
    this.drillSize = this.questions.length;
  }

  private generateQuestion(correctVerb: WordEntry): DrillQuestion | null {
    const distractors: WordEntry[] = this.verbPool
      .filter((v) => v.id !== correctVerb.id)
      .slice(0, 3);

    if (distractors.length < 3) {
      return null; // Not enough distractors to form a valid question
    }

    const useDefinitionAsPrompt = Math.random() < 0.5;
    const correctDefinition = getPrimaryDefinition(correctVerb)!;

    let prompt: string;
    let correctAnswer: string;
    let options: string[];

    if (useDefinitionAsPrompt) {
      // Prompt with the English definition, guess the Igbo verb
      prompt = correctDefinition;
      correctAnswer = correctVerb.word;
      options = [
        correctAnswer,
        ...distractors.map((d) => d.word),
      ];
    } else {
      // Prompt with the Igbo verb, guess the English definition
      prompt = correctVerb.word;
      correctAnswer = correctDefinition;
      options = [
        correctAnswer,
        ...distractors.map((d) => getPrimaryDefinition(d)!),
      ];
    }

    shuffle(options);
    const correctAnswerIndex = options.indexOf(correctAnswer);

    return {
      prompt,
      options,
      correctAnswerIndex,
      correctWord: correctVerb,
    };
  }

  /**
   * Gets the current question for the UI to display.
   * @returns The current question or null if the drill is over.
   */
  public getCurrentQuestion(): DrillQuestion | null {
    return this.questions[this.currentQuestionIndex] ?? null;
  }

  /**
   * Processes the user's answer for the current question.
   * @param selectedIndex The index of the answer chosen by the user.
   * @returns True if the answer was correct, false otherwise.
   */
  public answer(selectedIndex: number): boolean {
    const currentQuestion = this.getCurrentQuestion();
    if (!currentQuestion) {
      return false; // Drill is already over
    }

    const isCorrect = selectedIndex === currentQuestion.correctAnswerIndex;
    if (isCorrect) {
      this.correctCount++;
    } else {
      this.incorrectCount++;
    }

    this.currentQuestionIndex++;
    return isCorrect;
  }

  /**
   * Checks if the drill session is finished.
   * @returns True if all questions have been answered.
   */
  public isFinished(): boolean {
    return this.currentQuestionIndex >= this.drillSize;
  }

  /**
   * Gets the summary of the completed drill.
   * @returns A summary object with performance stats.
   */
  public getSummary(): DrillSummary {
    const total = this.correctCount + this.incorrectCount;
    const score = total > 0 ? (this.correctCount / total) * 100 : 0;
    return {
      correctCount: this.correctCount,
      incorrectCount: this.incorrectCount,
      totalQuestions: this.drillSize,
      score: Math.round(score),
    };
  }
}

/*
====================
EXAMPLE USAGE
====================

// This logic would live inside a UI component (e.g., a React component).

// 1. Create a new verb drill for 5 questions.
const drill = new VerbDrillEngine(5);
drill.start();

console.log(`--- Starting Verb Drill with ${drill.drillSize} questions ---");

// 2. The main loop continues as long as the drill is not finished.
while (!drill.isFinished()) {
  const question = drill.getCurrentQuestion();
  if (!question) break;

  // --- UI would render the question and options here ---
  console.log(`\nQ: ${question.prompt}`);
  question.options.forEach((opt, i) => console.log(`${i}: ${opt}`));

  // Simulate user answering (e.g., picking a random option)
  const userAnswerIndex = Math.floor(Math.random() * 4);
  const isCorrect = drill.answer(userAnswerIndex);

  console.log(` -> You chose: ${question.options[userAnswerIndex]}`);
  console.log(isCorrect ? "Correct!" : `Wrong! The answer was: ${question.options[question.correctAnswerIndex]}`);
}

// 3. Once the drill is over, get the summary.
const summary = drill.getSummary();
console.log("\n--- Drill Complete ---");
console.log(`Score: ${summary.score}%`);
console.log(`Correct: ${summary.correctCount}/${summary.totalQuestions}`);
*/
