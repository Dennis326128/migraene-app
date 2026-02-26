/**
 * Shared Module: Doctor Access Token (HMAC-SHA256 signed)
 * 
 * Replaces session-based auth. Token is signed with DOCTOR_ACCESS_SECRET.
 * Token format: base64url(payload).base64url(signature)
 * 
 * Token is valid until min(share.expires_at, now+24h).
 * Every data request ALSO checks DB to allow instant patient revocation.
 */

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export interface DoctorAccessPayload {
  share_id: string;
  user_id: string;
  exp: number; // Unix timestamp (seconds)
  v: 1;
}

// ════════════════════════════════════════════════════════════════════════════
// BASE64URL HELPERS
// ════════════════════════════════════════════════════════════════════════════

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ════════════════════════════════════════════════════════════════════════════
// SIGNING & VERIFICATION
// ════════════════════════════════════════════════════════════════════════════

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signDoctorAccessToken(
  payload: DoctorAccessPayload,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const payloadJson = JSON.stringify(payload);
  const payloadBytes = encoder.encode(payloadJson);
  const payloadB64 = base64UrlEncode(payloadBytes);

  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${payloadB64}.${signatureB64}`;
}

export async function verifyDoctorAccessToken(
  token: string,
  secret: string,
): Promise<DoctorAccessPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadB64, signatureB64] = parts;

    const key = await getHmacKey(secret);
    const encoder = new TextEncoder();
    const signatureBytes = base64UrlDecode(signatureB64);

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(payloadB64),
    );
    if (!valid) return null;

    const payloadBytes = base64UrlDecode(payloadB64);
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const payload: DoctorAccessPayload = JSON.parse(payloadJson);

    // Check expiration
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) return null;

    // Version check
    if (payload.v !== 1) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Get the DOCTOR_ACCESS_SECRET from env. Throws if missing.
 */
export function getDoctorAccessSecret(): string {
  const secret = Deno.env.get("DOCTOR_ACCESS_SECRET");
  if (!secret) {
    throw new Error("DOCTOR_ACCESS_SECRET is not configured");
  }
  return secret;
}

/**
 * Read access token from x-doctor-access header.
 */
export function getAccessTokenFromHeader(req: Request): string | null {
  return req.headers.get("x-doctor-access") || null;
}
