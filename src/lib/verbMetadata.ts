/**
 * @fileoverview Defines the metadata structure for verbs in the Igboverse app.
 * This interface extends the base WordEntry with verb-specific properties.
 */

/**
 * Represents additional metadata for a verb.
 */
export interface VerbMetadata {
  /** Indicates if the verb is typically transitive (takes a direct object). */
  isTransitive?: boolean;
  /** Indicates if the verb is typically intransitive (does not take a direct object). */
  isIntransitive?: boolean;
  /** A list of common nouns or phrases that typically serve as objects for this verb. */
  commonObjects?: string[];
  /** Example sentences demonstrating the verb's usage, with Igbo and English translations. */
  exampleSentences?: { igbo: string; english: string }[];
}
