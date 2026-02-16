const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// load .env.local if present
try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') }); } catch(e) {}

// fallback manual parse of .env.local if variables still missing
if (!process.env.MONGODB_URI || !process.env.IGBO_API_KEY) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
        if (m) {
          const key = m[1];
          let val = m[2] || '';
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (!(key in process.env)) process.env[key] = val;
        }
      });
    }
  } catch (e) {}
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'igboverse';
const IGBO_API_KEY = process.env.IGBO_API_KEY;
const BASE = 'https://igboapi.com/api/v2';

if (!MONGODB_URI) { console.error('MONGODB_URI missing'); process.exit(1); }
if (!IGBO_API_KEY) { console.error('IGBO_API_KEY missing'); process.exit(1); }

async function fetchWord(keyword) {
  const params = new URLSearchParams({ keyword, page: '1', range: '25', examples: 'true' });
  const url = `${BASE}/words?${params.toString()}`;
  const res = await fetch(url, { headers: { 'X-API-Key': IGBO_API_KEY } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

(async () => {
  const keyword = process.argv[2] || 'akwa';
  console.log('Test: fallback for', keyword);

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    const col = db.collection('words');

    // remove any existing doc for clean test
    await col.deleteMany({ word: keyword });

    const resp = await fetchWord(keyword);
    const items = Array.isArray(resp) ? resp : (resp?.data || resp?.words || []);
    if (!items || !items.length) {
      console.error('No items returned from IgboAPI for keyword', keyword);
      process.exit(2);
    }

    const doc = items[0];
    doc._id = doc.id || `${doc.word}::${doc.wordClass || ''}`;
    doc.lastFetched = new Date().toISOString();
    await col.replaceOne({ _id: doc._id }, doc, { upsert: true });

    const found = await col.findOne({ _id: doc._id });
    if (!found) {
      console.error('Failed to upsert doc into MongoDB');
      process.exit(3);
    }

    console.log('Test passed — document upserted with _id=', found._id);
    console.log('Sample fields:', { word: found.word, wordClass: found.wordClass });
  } catch (err) {
    console.error('Test error:', err);
    process.exit(4);
  } finally {
    await client.close();
  }
})();
