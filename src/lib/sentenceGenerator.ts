/**
 * @fileoverview Sentence template system for Igboverse.
 * This module provides utilities for loading sentence templates, generating
 * fill-in-the-blank questions, and validating user answers.
 */

import fs from "fs/promises";
import path from "path";
import { type WordEntry, getAllWords } from "./lexicon";
import { normalizeIgboString } from "./utils";

/**
 * Defines the criteria for filling a blank in a sentence template.
 */
export interface BlankDefinition {
  name: string;
  wordClass?: string; // e.g., "verb", "noun"
  tags?: string[]; // e.g., "food", "animal"
  exampleWords?: string[]; // Specific word IDs to use
}

/**
 * Defines the structure of a sentence template.
 */
export interface SentenceTemplate {
  id: string;
  text: string; // e.g., "M {verb} nri."
  blanks: BlankDefinition[];
}

/**
 * Represents a generated fill-in-the-blank question.
 */
export interface FillInTheBlankQuestion {
  templateId: string;
  questionText: string; // e.g., "M ___ nri."
  correctAnswerWord: WordEntry;
  blankName: string; // The name of the blank that was filled
}

// Cache for all words, mapped by wordClass for efficient filtering.
let wordsByClass: Map<string, WordEntry[]> | null = null;
let wordMap: Map<string, WordEntry> | null = null;

/**
 * Initializes and caches words by their wordClass for quick lookup.
 */
function getWordsByClass(): Map<string, WordEntry[]> {
  if (wordsByClass) {
    return wordsByClass;
  }
  const allWords = getAllWords();
  wordsByClass = new Map<string, WordEntry[]>();
  wordMap = new Map(allWords.map((word) => [word.id, word]));

  for (const word of allWords) {
    if (word.wordClass) {
      if (!wordsByClass.has(word.wordClass)) {
        wordsByClass.set(word.wordClass, []);
      }
      wordsByClass.get(word.wordClass)?.push(word);
    }
  }
  return wordsByClass;
}

/**
 * Retrieves a list of valid WordEntry objects for a given blank definition.
 * @param blank The definition of the blank.
 * @returns An array of suitable WordEntry objects.
 */
function getWordsForBlank(blank: BlankDefinition): WordEntry[] {
  const words = getWordsByClass();
  const allWords = getAllWords(); // Fallback or for exampleWords

  if (blank.exampleWords && blank.exampleWords.length > 0) {
    if (!wordMap) getWordsByClass(); // Ensure wordMap is initialized
    return blank.exampleWords
      .map((id) => wordMap?.get(id))
      .filter(Boolean) as WordEntry[];
  }

  let filteredWords: WordEntry[] = [];
  if (blank.wordClass) {
    filteredWords = words.get(blank.wordClass) || [];
  } else {
    filteredWords = allWords; // If no wordClass, consider all words
  }

  if (blank.tags && blank.tags.length > 0) {
    // Further filter by tags if specified (assuming tags exist on WordEntry, not currently in interface)
    // For now, this part is a placeholder as WordEntry doesn't explicitly have a 'tags' field in the provided interface.
    // If tags were needed, WordEntry interface would need to be updated.
  }

  return filteredWords;
}

/**
 * Loads sentence templates from specified JSON files.
 * @param templateFileNames An array of template file names (e.g., ["basic-sentences.json"])
 * @returns A promise that resolves to an array of SentenceTemplate objects.
 */
export async function loadTemplates(
  templateFileNames: string[]
): Promise<SentenceTemplate[]> {
  const loadedTemplates: SentenceTemplate[] = [];
  for (const fileName of templateFileNames) {
    try {
      const filePath = path.join(process.cwd(), "templates", fileName);
      const fileContent = await fs.readFile(filePath, "utf-8");
      const templates: SentenceTemplate[] = JSON.parse(fileContent);
      loadedTemplates.push(...templates);
    } catch (error) {
      console.error(`Failed to load template file "${fileName}":`, error);
    }
  }
  return loadedTemplates;
}

/**
 * Generates a fill-in-the-blank question from a given template.
 * @param template The sentence template to use.
 * @returns A FillInTheBlankQuestion object, or null if no suitable word can be found.
 */
export function generateQuestion(
  template: SentenceTemplate
): FillInTheBlankQuestion | null {
  if (template.blanks.length === 0) {
    return null; // Template has no blanks
  }

  // For simplicity, pick the first blank. Could be extended to pick randomly or handle multiple blanks.
  const blank = template.blanks[0];
  const validWords = getWordsForBlank(blank);

  if (validWords.length === 0) {
    return null; // No suitable words found for this blank
  }

  // Randomly select a correct answer word
  const correctAnswerWord =
    validWords[Math.floor(Math.random() * validWords.length)];

  // Create the question text with "___" placeholder
  const questionText = template.text.replace(
    `{${blank.name}}`,
    "___"
  );

  return {
    templateId: template.id,
    questionText,
    correctAnswerWord,
    blankName: blank.name,
  };
}

/**
 * Validates a user's answer against a generated question.
 * @param question The generated question.
 * @param userAnswer The user's input.
 * @returns True if the answer is correct, false otherwise.
 */
export function validateAnswer(
  question: FillInTheBlankQuestion,
  userAnswer: string
): boolean {
  const normalizedUserAnswer = normalizeIgboString(userAnswer);
  const normalizedCorrectAnswer = normalizeIgboString(
    question.correctAnswerWord.word
  );
  return normalizedUserAnswer === normalizedCorrectAnswer;
}

/*
====================
EXAMPLE USAGE
====================

// This logic would typically be used in a server-side component or API route
// to prepare questions for a learning session.

async function main() {
  // 1. Load templates from a file.
  const templates = await loadTemplates(["basic-sentences.json"]);
  console.log(`Loaded ${templates.length} templates.`);

  if (templates.length === 0) {
    console.log("No templates loaded. Exiting example.");
    return;
  }

  // 2. Generate a question from a random template.
  const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
  const question = generateQuestion(randomTemplate);

  if (question) {
    console.log("\n--- Generated Question ---");
    console.log("Question Text:", question.questionText);
    console.log("Correct Answer:", question.correctAnswerWord.word);

    // 3. Simulate answer validation.
    const correctAttempt = question.correctAnswerWord.word;
    const incorrectAttempt = "incorrect_word"; // Assuming this is not the correct answer

    console.log(`\nValidating "${correctAttempt}":`, validateAnswer(question, correctAttempt));
    console.log(`Validating "${incorrectAttempt}":`, validateAnswer(question, incorrectAttempt));
  } else {
    console.log("Could not generate a question from the selected template.");
  }
}

// To run the example:
// main();

*/
