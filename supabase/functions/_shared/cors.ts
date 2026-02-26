/**
 * Shared CORS helper for doctor-facing edge functions.
 * No credentials (no cookies) — session via x-doctor-session header.
 */

const STATIC_ORIGINS = [
  "https://migraina.lovable.app",
  "https://migraene-app.lovable.app",
  "https://miary.de",
  "https://www.miary.de",
  "http://localhost:5173",
  "http://localhost:3000",
];

const DYNAMIC_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
];

function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  if (STATIC_ORIGINS.includes(origin)) return true;
  return DYNAMIC_PATTERNS.some((p) => p.test(origin));
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = isOriginAllowed(origin);

  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://migraina.lovable.app",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, x-doctor-session, x-report-legacy, authorization, x-client-info, apikey",
    Vary: "Origin",
  };
}

/** Standard preflight response */
export function handlePreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) });
}

/** Read session id exclusively from x-doctor-session header */
export function getSessionIdFromHeader(req: Request): string | null {
  return req.headers.get("x-doctor-session") || null;
}
