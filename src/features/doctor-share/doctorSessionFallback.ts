/**
 * Doctor session management for public doctor-share flow.
 * Session ID is stored client-side and sent via `x-doctor-session` header.
 * No cookies are used.
 */

export const SUPABASE_FUNCTIONS_BASE_URL =
  "https://lzcbjciqrhsezxkjeyhb.supabase.co/functions/v1";

const STORAGE_KEY = "doctor_session_fallback_v1";

export const doctorSessionFallback = {
  get(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(sessionId: string) {
    try {
      localStorage.setItem(STORAGE_KEY, sessionId);
    } catch {
      // ignore
    }
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};

/**
 * Build fetch init for doctor endpoints.
 * Sends session via x-doctor-session header. No cookies/credentials.
 */
export function buildDoctorFetchInit(init: RequestInit = {}): RequestInit {
  const sessionId = doctorSessionFallback.get();
  const headers = new Headers(init.headers);
  if (sessionId) headers.set("x-doctor-session", sessionId);

  return {
    ...init,
    headers,
  };
}
