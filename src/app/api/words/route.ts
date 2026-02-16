import { NextResponse } from 'next/server';
import { getWordWithFallback } from '@/src/lib/word-service';
import { fetchWords } from '@/src/lib/igbo-api';
import { upsertWord } from '@/src/lib/words-db';

// very small in-memory rate limiter (per IP) for dev/demo
const RATE_WINDOW_MS = 1000; // 1 request
const RATE_LIMIT = 5; // max 5 requests per window
const ipCounts: Record<string, { ts: number; count: number }> = {};

function rateLimit(ip: string) {
  const now = Date.now();
  const entry = ipCounts[ip] || { ts: now, count: 0 };
  if (now - entry.ts > RATE_WINDOW_MS) {
    entry.ts = now;
    entry.count = 1;
  } else {
    entry.count += 1;
  }
  ipCounts[ip] = entry;
  return entry.count <= RATE_LIMIT;
}

export async function GET(request: Request) {
  try {
    const ip = (request.headers.get('x-forwarded-for') || request.headers.get('host') || 'local') as string;
    if (!rateLimit(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const url = new URL(request.url);
    const q = url.searchParams.get('q') || url.searchParams.get('keyword');
    if (!q) return NextResponse.json({ error: 'missing_query' }, { status: 400 });

    const doc = await getWordWithFallback(q);
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ data: doc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ip = (request.headers.get('x-forwarded-for') || request.headers.get('host') || 'local') as string;
    if (!rateLimit(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const body = await request.json();
    const keyword: string = body?.keyword || body?.q;
    const force: boolean = Boolean(body?.force);
    if (!keyword) return NextResponse.json({ error: 'missing_keyword' }, { status: 400 });

    // If force is true, fetch directly from IgboAPI and upsert
    if (force) {
      const resp = await fetchWords({ keyword, range: 25, examples: true });
      const items = Array.isArray(resp)
        ? resp
        : Array.isArray((resp as any)?.data)
        ? (resp as any).data
        : Array.isArray((resp as any)?.words)
        ? (resp as any).words
        : [];
      const first = items[0];
      if (!first) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      const doc = { ...first, lastFetched: new Date().toISOString(), source: 'igboapi' };
      await upsertWord(doc);
      return NextResponse.json({ data: doc });
    }

    // Otherwise behave like GET (fallback)
    const doc = await getWordWithFallback(keyword);
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ data: doc });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

export const runtime = 'edge';
