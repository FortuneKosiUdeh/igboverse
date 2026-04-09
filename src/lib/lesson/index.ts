export * from './types';
export * from './curriculum';
export * from './lessonGenerator';
export * from './srs';
// wordFetcher is NOT re-exported here because it imports @supabase/supabase-js
// (browser-only). Import it directly: import { fetchThemeWords } from '@/lib/lesson/wordFetcher'
