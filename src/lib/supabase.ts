'use client';
/**
 * Supabase REST client — zero external dependencies.
 *
 * Calls the Supabase PostgREST and Auth REST APIs directly using
 * the browser's native fetch(). This eliminates @supabase/supabase-js
 * (and the @supabase/realtime-js WebSocket hang) from the module graph
 * entirely, while preserving identical functionality for this app.
 *
 * Supported operations:
 *  - select / upsert rows (PostgREST)
 *  - signInAnonymously / getSession / updateUser (Auth v1 REST)
 */

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SESSION_KEY   = 'igboverse_sb_session';

// ─── Types ───────────────────────────────────────────────────────

interface SbSession {
    access_token:  string;
    refresh_token: string;
    expires_at:    number;   // unix seconds
    user: { id: string; is_anonymous: boolean };
}

// Module-level session cache
let _session: SbSession | null = null;

// ─── Auth helpers ────────────────────────────────────────────────

function loadSession(): SbSession | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function persistSession(s: SbSession) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

async function refreshSession(refreshToken: string): Promise<SbSession | null> {
    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method:  'POST',
            headers: authHeaders(''),
            body:    JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

function authHeaders(token: string): Record<string, string> {
    return {
        'apikey':       SUPABASE_ANON,
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
}

// ─── Public: Auth ────────────────────────────────────────────────

export async function getSession(): Promise<SbSession | null> {
    if (_session) {
        // Refresh if expiring within 60s
        if (_session.expires_at - 60 < Date.now() / 1000) {
            const fresh = await refreshSession(_session.refresh_token);
            if (fresh) { _session = fresh; persistSession(fresh); }
        }
        return _session;
    }

    const stored = loadSession();
    if (stored) {
        if (stored.expires_at - 60 < Date.now() / 1000) {
            const fresh = await refreshSession(stored.refresh_token);
            if (fresh) { _session = fresh; persistSession(fresh); return _session; }
        }
        _session = stored;
        return _session;
    }

    return null;
}

export async function signInAnonymously(): Promise<SbSession | null> {
    try {
        // Supabase anonymous auth: POST /auth/v1/signup with empty credentials
        // Requires "Allow anonymous sign-ins" to be ON in the Supabase dashboard:
        // Authentication → Configuration → User Signups → toggle on
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method:  'POST',
            headers: authHeaders(''),
            body:    JSON.stringify({ data: {} }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn('[supabase] signInAnonymously failed:', res.status, err);
            return null;
        }
        const data: SbSession = await res.json();
        _session = data;
        persistSession(data);
        return data;
    } catch (err) {
        console.warn('[supabase] signInAnonymously network error:', err);
        return null;
    }
}

export async function updateUserEmail(email: string): Promise<string | null> {
    const session = await getSession();
    if (!session) return 'Not authenticated';
    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method:  'PUT',
            headers: authHeaders(session.access_token),
            body:    JSON.stringify({ email }),
        });
        if (res.ok) return null;
        const err = await res.json();
        return err.msg || err.message || 'Unknown error';
    } catch (e) {
        return (e as Error).message;
    }
}

// ─── Public: PostgREST DB ─────────────────────────────────────────

interface QueryResult<T> { data: T[] | null; error: { message: string } | null }

/** GET /rest/v1/{table}?{params} */
export async function dbSelect<T = Record<string, unknown>>(
    table: string,
    params: Record<string, string>,
): Promise<QueryResult<T>> {
    const session = await getSession();
    const token   = session?.access_token || SUPABASE_ANON;
    const qs      = new URLSearchParams(params).toString();
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
            headers: {
                'apikey':        SUPABASE_ANON,
                'Authorization': `Bearer ${token}`,
                'Accept':        'application/json',
            },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { data: null, error: { message: err.message || `HTTP ${res.status}` } };
        }
        const raw = await res.json();
        const data = Array.isArray(raw) ? raw : [raw];
        return { data: data as T[], error: null };
    } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
    }
}

/** POST /rest/v1/{table} with Prefer: resolution=merge-duplicates (upsert) */
export async function dbUpsert(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
    onConflict?: string,
): Promise<{ error: { message: string } | null }> {
    const session = await getSession();
    const token   = session?.access_token || SUPABASE_ANON;
    const prefer  = onConflict
        ? `resolution=merge-duplicates,return=minimal`
        : `return=minimal`;
    const url = `${SUPABASE_URL}/rest/v1/${table}`
        + (onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '');

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey':        SUPABASE_ANON,
                'Authorization': `Bearer ${token}`,
                'Content-Type':  'application/json',
                'Prefer':        prefer,
            },
            body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { error: { message: err.message || `HTTP ${res.status}` } };
        }
        return { error: null };
    } catch (e) {
        return { error: { message: (e as Error).message } };
    }
}
