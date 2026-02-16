const fs = require('fs');
const path = require('path');

const API_KEY = process.env.IGBO_API_KEY || 'b130b269-717b-438e-b98e-998dfed09da7';
const BASE = 'https://igboapi.com/api/v2';

async function fetchPage(keyword, page = 1, range = 25) {
  const params = new URLSearchParams({
    keyword,
    page: String(page),
    range: String(range),
    examples: 'true',
  });
  const url = `${BASE}/words?${params.toString()}`;
  const res = await fetch(url, { headers: { 'X-API-Key': API_KEY } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.json();
}

(async () => {
  try {
    const keyword = process.argv[2] || 'a';
    const maxPages = Number(process.env.SEED_MAX_PAGES || '3');
    const range = Math.min(Number(process.env.SEED_RANGE || '25'), 25);
    const outPath = path.resolve(process.cwd(), 'data', 'words-seed.json');

    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      console.log(`Fetching page ${page} (keyword=${keyword})...`);
      const resp = await fetchPage(keyword, page, range);

      const items = Array.isArray(resp)
        ? resp
        : Array.isArray(resp?.data)
        ? resp.data
        : Array.isArray(resp?.words)
        ? resp.words
        : [];

      if (!items.length) {
        console.log('No items returned; stopping.');
        break;
      }

      all.push(...items);

      if (items.length < range) break;

      await new Promise((r) => setTimeout(r, 400));
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(all, null, 2), 'utf8');
    console.log(`Wrote ${all.length} words to ${outPath}`);
  } catch (err) {
    console.error('Seeder error:', err);
    process.exit(1);
  }
})();
