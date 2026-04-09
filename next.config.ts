import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,

  // All Supabase packages are browser-only in this app.
  // Marking them as server-external prevents Next.js from importing them
  // during server-side module analysis — which causes @supabase/realtime-js
  // to hang indefinitely (it tries to open a WebSocket at import time in Node).
  serverExternalPackages: [
    '@supabase/supabase-js',
    '@supabase/realtime-js',
    '@supabase/auth-js',
    '@supabase/postgrest-js',
    '@supabase/storage-js',
    '@supabase/functions-js',
  ],
};

export default nextConfig;
