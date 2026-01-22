// Public doctor-share flow uses an HttpOnly cookie (doctor_session).
// In some preview environments third-party cookies can be blocked.
// We therefore support a preview fallback where the session id is also
// stored client-side and sent via `x-doctor-session` header.

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

export function buildDoctorFetchInit(init: RequestInit = {}): RequestInit {
  const sessionId = doctorSessionFallback.get();
  const headers = new Headers(init.headers);
  if (sessionId) headers.set("x-doctor-session", sessionId);

  return {
    ...init,
    headers,
    credentials: "include",
  };
}
