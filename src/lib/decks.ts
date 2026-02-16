/**
 * @fileoverview Deck system for Igboverse.
 * This module provides utilities for loading named decks, resolving word IDs
 * into full WordEntry objects, and managing deck contents.
 */

import fs from "fs/promises";
import path from "path";
import { type WordEntry, getAllWords } from "./lexicon";

/**
 * Defines the raw structure of a deck definition file (e.g., core-verbs.json).
 */
export interface DeckDefinition {
  name: string;
  description: string;
  wordIds: string[];
}

/**
 * Represents a fully loaded and resolved deck, ready for use in drills or flashcards.
 */
export interface Deck {
  name: string;
  description: string;
  words: WordEntry[];
}

// Cache to store the word map for efficient lookups.
let wordMap: Map<string, WordEntry> | null = null;

/**
 * Creates and caches a Map of word IDs to WordEntry objects for fast resolution.
 * @returns {Map<string, WordEntry>} The word map.
 */
function getWordMap(): Map<string, WordEntry> {
  if (wordMap) {
    return wordMap;
  }
  const allWords = getAllWords();
  wordMap = new Map(allWords.map((word) => [word.id, word]));
  return wordMap;
}

/**
 * Resolves an array of word IDs into full WordEntry objects.
 * @param wordIds - An array of word ID strings.
 * @returns {WordEntry[]} An array of the corresponding WordEntry objects.
 */
export function resolveWordIds(wordIds: string[]): WordEntry[] {
  const map = getWordMap();
  // Filter out potential undefined values if an ID is not found
  return wordIds.map((id) => map.get(id)).filter(Boolean) as WordEntry[];
}

/**
 * Loads a deck definition from the filesystem and resolves its word IDs.
 * @param deckName - The name of the deck to load (e.g., "core-verbs").
 * @returns {Promise<Deck>} A promise that resolves to the fully loaded deck.
 * @throws {Error} If the deck file is not found or is invalid.
 */
export async function getDeck(deckName: string): Promise<Deck> {
  try {
    const filePath = path.join(process.cwd(), "decks", `${deckName}.json`);
    const fileContent = await fs.readFile(filePath, "utf-8");
    const deckDefinition: DeckDefinition = JSON.parse(fileContent);

    const resolvedWords = resolveWordIds(deckDefinition.wordIds);

    return {
      name: deckDefinition.name,
      description: deckDefinition.description,
      words: resolvedWords,
    };
  } catch (error) {
    console.error(`Failed to load deck "${deckName}":`, error);
    // Re-throw the error to be handled by the caller
    throw new Error(`Could not load or parse deck: ${deckName}`);
  }
}

/**
 * Shuffles the words within a deck using the Fisher-Yates algorithm.
 * This function modifies the deck object in place.
 * @param deck - The deck to shuffle.
 */
export function shuffleDeck(deck: Deck): void {
  const words = deck.words;
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
}

/*
====================
EXAMPLE USAGE
====================

// This logic would live inside a server-side component or API route.

async function main() {
  try {
    // 1. Load the "core-verbs" deck.
    const verbDeck = await getDeck("core-verbs");
    console.log(`Loaded deck: "${verbDeck.name}"`);
    console.log(`Description: ${verbDeck.description}`);
    console.log(`Contains ${verbDeck.words.length} words.`);
    console.log("First word:", verbDeck.words[0]?.word);

    // 2. Shuffle the deck for a random learning session.
    shuffleDeck(verbDeck);
    console.log("\nShuffled deck!");
    console.log("First word after shuffle:", verbDeck.words[0]?.word);

    // You can now pass verbDeck.words to the FlashcardEngine or VerbDrillEngine.
    // For example:
    // const flashcardSession = new FlashcardEngine(verbDeck.words.length);
    // flashcardSession.deck = verbDeck.words; // Manually assign the deck
    // ...

  } catch (error) {
    console.error("An error occurred:", error);
  }
}

// To run the example:
// main();

*/
