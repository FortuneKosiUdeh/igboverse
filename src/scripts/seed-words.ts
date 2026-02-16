import fs from 'fs';
import path from 'path';
import { fetchWords } from '../lib/igbo-api';

async function main() {
  const apiKey = process.env.IGBO_API_KEY;
  if (!apiKey) {
    console.error('Set IGBO_API_KEY in your environment before running this script.');
    process.exit(1);
  }

  const keyword = process.argv[2] || 'a';
  const maxPages = Number(process.env.SEED_MAX_PAGES || '5');
  const range = Math.min(Number(process.env.SEED_RANGE || '25'), 25);
  const outPath = path.resolve(process.cwd(), 'data', 'words-seed.json');

  const all: any[] = [];

  for (let page = 1; page <= maxPages; page++) {
    console.log(`Fetching page ${page} (keyword=${keyword})...`);
    const resp = await fetchWords({ keyword, page, range, examples: true });

    // Normalize response: API may return an array or object with `data`/`words`
    const items = Array.isArray(resp)
      ? resp
      : Array.isArray(resp?.data)
      ? resp.data
      : Array.isArray(resp?.words)
      ? resp.words
      : [];

    if (!items.length) {
      console.log('No more items returned; stopping.');
      break;
    }

    all.push(...items);

    // If fewer than requested, we've reached the end
    if (items.length < range) break;

    // small pause to be polite
    await new Promise((r) => setTimeout(r, 400));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), 'utf8');
  console.log(`Wrote ${all.length} words to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
