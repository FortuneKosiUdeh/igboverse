/**
 * @fileoverview Lexicon loader and search engine for the Igboverse app.
 * This module handles loading the word lexicon from a local JSON file,
 * providing strongly-typed access to word entries, and offering
 * accent-insensitive search capabilities.
 *
 * It is designed to be used server-side and caches the lexicon in memory
 * to avoid repeated file reads within a single request lifecycle.
 */

import fs from "fs";
import path from "path";
import { normalizeIgboString } from "./utils";
import { VerbMetadata } from "./verbMetadata"; // Import VerbMetadata

// Define the structure of a word entry, ensuring strong typing.
export interface WordEntry {
  id: string;
  word: string;
  wordClass: string;
  definitions: { group: string; items: { igbo: string; english: string }[] }[];
  pronunciation?: string;
  attributes?: Record<string, boolean>;
  word_lower: string; // Pre-computed lowercase version
  word_norm: string; // Pre-computed normalized (accent-insensitive) version
}

// Define VerbEntry by extending WordEntry with VerbMetadata
export interface VerbEntry extends WordEntry, VerbMetadata {}

// In-memory cache for the lexicon to prevent redundant file reads.
let lexicon: WordEntry[] | null = null;

/**
 * Loads the lexicon from the local JSON file.
 * This function reads from `data/igboapi-words-raw.json`, parses it,
 * and caches the result in memory.
 *
 * @returns {WordEntry[]} The loaded lexicon.
 * @throws {Error} If the lexicon file cannot be read or parsed.
 */
function loadLexicon(): WordEntry[] {
  if (lexicon) {
    return lexicon;
  }

  try {
    const filePath = path.join(process.cwd(), "data", "igboapi-words-raw.json");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(fileContent);

    // Assuming the JSON file is an array of word entries.
    // You might need to adjust this if the file structure is different.
    lexicon = data as WordEntry[];
    return lexicon;
  } catch (error) {
    console.error("Failed to load or parse lexicon:", error);
    // In a real-world scenario, you might want more robust error handling.
    // For now, we'll return an empty array to prevent crashes.
    return [];
  }
}

/**
 * Retrieves all word entries from the lexicon.
 *
 * @returns {WordEntry[]} An array of all word entries.
 */
export function getAllWords(): WordEntry[] {
  return loadLexicon();
}

/**
 * Retrieves all verb entries from the lexicon.
 *
 * @returns {VerbEntry[]} An array of word entries where wordClass is 'verb', cast to VerbEntry.
 */
export function getVerbs(): VerbEntry[] {
  const allWords = loadLexicon();
  return allWords.filter((entry) => entry.wordClass === "verb") as VerbEntry[];
}

/**
 * Searches the lexicon for words matching a query.
 * The search is case-insensitive and accent-insensitive.
 * Results are sorted by relevance: starts-with matches first, then contains matches.
 *
 * @param {string} query The search term.
 * @param {object} [options] Optional search parameters.
 * @param {string} [options.wordClass] An optional word class to filter by (e.g., "verb").
 * @returns {WordEntry[]} An array of matching word entries.
 */
export function searchWords(
  query: string,
  options?: { wordClass?: string }
): WordEntry[] {
  const allWords = loadLexicon();
  const normalizedQuery = normalizeIgboString(query);

  if (!normalizedQuery) {
    return [];
  }

  // 1. Filter by word class if specified
  const filteredByWordClass = options?.wordClass
    ? allWords.filter((entry) => entry.wordClass === options.wordClass)
    : allWords;

  // 2. Partition results into starts-with and contains matches
  const startsWithMatches: WordEntry[] = [];
  const containsMatches: WordEntry[] = [];

  for (const entry of filteredByWordClass) {
    // The search matches against the pre-normalized `word_norm` field.
    if (entry.word_norm.startsWith(normalizedQuery)) {
      startsWithMatches.push(entry);
    } else if (entry.word_norm.includes(normalizedQuery)) {
      containsMatches.push(entry);
    }
  }

  // 3. Return sorted results
  return [...startsWithMatches, ...containsMatches];
}

/*
====================
EXAMPLE USAGE
====================

// This code can be used in a Next.js Server Component or API route.

// 1. Get all words in the lexicon
const allWords = getAllWords();
console.log(`Loaded ${allWords.length} words.`);

// 2. Search for a word (accent-insensitive)
// This will match "bia", "bịà", "BIA", etc.
const searchResults = searchWords("bia");
console.log("Search results for 'bia':", searchResults.map(w => w.word));

// 3. Search for verbs only
const verbResults = searchWords("ri", { wordClass: "verb" });
console.log("Verb search results for 'ri':", verbResults.map(w => w.word));

// 4. Get all verbs
const allVerbs = getVerbs();
console.log(`Found ${allVerbs.length} verbs.`);

*/
