/**
 * Doctor access token management for public doctor-share flow.
 * Access token is stored client-side and sent via `x-doctor-access` header.
 * No cookies, no sessions.
 */

export const SUPABASE_FUNCTIONS_BASE_URL =
  "https://lzcbjciqrhsezxkjeyhb.supabase.co/functions/v1";

const STORAGE_KEY = "doctor_access_token_v2";

export const doctorAccessStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      sessionStorage.setItem(STORAGE_KEY, token);
    } catch {
      // ignore
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      // Also clean up old key
      localStorage.removeItem("doctor_session_fallback_v1");
    } catch {
      // ignore
    }
  },
};

/**
 * Build fetch init for doctor endpoints.
 * Sends access token via x-doctor-access header. No cookies/credentials.
 */
export function buildDoctorFetchInit(init: RequestInit = {}): RequestInit {
  const token = doctorAccessStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set("x-doctor-access", token);

  return {
    ...init,
    headers,
  };
}
