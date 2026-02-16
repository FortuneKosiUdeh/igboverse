import { findWordByWord, upsertWord } from './words-db';
import { fetchWords } from './igbo-api';

/**
 * Get a word from local DB first, otherwise fetch from IgboAPI and persist.
 * Returns null if no result was found.
 */
export async function getWordWithFallback(keyword: string) {
  if (!keyword) return null;

  const local = await findWordByWord(keyword);
  if (local) return local;

  // Fetch from IgboAPI
  const resp = await fetchWords({ keyword, range: 25, examples: true });
  const items = Array.isArray(resp)
    ? resp
    : Array.isArray((resp as any)?.data)
    ? (resp as any).data
    : Array.isArray((resp as any)?.words)
    ? (resp as any).words
    : [];

  const first = items[0];
  if (!first) return null;

  const doc = { ...first, lastFetched: new Date().toISOString(), source: 'igboapi' };
  await upsertWord(doc);
  return doc;
}
