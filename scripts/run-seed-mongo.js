const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Try dotenv first (if installed), otherwise fall back to parsing .env.local
try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
} catch (e) {}

// manual parse as fallback
if (!process.env.MONGODB_URI) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
        if (m) {
          const key = m[1];
          let val = m[2] || '';
          if (val.startsWith("\"") && val.endsWith("\"")) val = val.slice(1, -1);
          if (!(key in process.env)) process.env[key] = val;
        }
      });
    }
  } catch (e) {}
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'igboverse';
const IGBO_API_KEY = process.env.IGBO_API_KEY;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found. Add it to .env.local or export it in your shell.');
  process.exit(1);
}

if (!IGBO_API_KEY) {
  console.error('IGBO_API_KEY not found. Add it to .env.local or export it in your shell.');
  process.exit(1);
}

const BASE = 'https://igboapi.com/api/v2';

async function fetchPage(keyword, page = 1, range = 25) {
  const params = new URLSearchParams({
    keyword,
    page: String(page),
    range: String(range),
    examples: 'true',
  });
  const url = `${BASE}/words?${params.toString()}`;
  const res = await fetch(url, { headers: { 'X-API-Key': IGBO_API_KEY } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.json();
}

function normalizeItem(item) {
  // Keep original fields; ensure stable _id for upsert
  const id = item.id || (item.word ? `${item.word}::${item.wordClass || ''}` : undefined);
  const doc = Object.assign({}, item);
  if (id) doc._id = id;
  return doc;
}

(async () => {
  const keyword = process.argv[2] || 'a';
  const maxPages = Number(process.env.SEED_MAX_PAGES || '3');
  const range = Math.min(Number(process.env.SEED_RANGE || '25'), 25);

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    const col = db.collection('words');

    // ensure simple index on word for faster lookups
    await col.createIndex({ word: 1 });

    let total = 0;
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

      const ops = items.map((it) => {
        const doc = normalizeItem(it);
        const filter = doc._id ? { _id: doc._id } : { word: doc.word };
        return {
          replaceOne: {
            filter,
            replacement: doc,
            upsert: true,
          },
        };
      });

      if (ops.length) {
        const res = await col.bulkWrite(ops, { ordered: false });
        total += ops.length;
        console.log(`Upserted/batched ${ops.length} items (page ${page}).`);
      }

      if (items.length < range) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log(`Seeding complete. Inserted/updated approx ${total} documents into ${MONGODB_DB}.words`);
  } catch (err) {
    console.error('Seeder error:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
