/**
 * Shared guard: Verify doctor access token AND check DB for live share status.
 * Used by get-shared-report-data and get-shared-report-pdf.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  verifyDoctorAccessToken,
  getDoctorAccessSecret,
  getAccessTokenFromHeader,
  type DoctorAccessPayload,
} from "./doctorAccess.ts";

export interface DoctorAccessResult {
  valid: boolean;
  payload?: DoctorAccessPayload;
  reason?: string;
}

/**
 * Full access check:
 * 1. Read token from x-doctor-access header
 * 2. Verify HMAC signature + expiration
 * 3. Check DB: share still active, not revoked, not expired
 */
export async function verifyDoctorAccess(
  req: Request,
  supabase: SupabaseClient,
): Promise<DoctorAccessResult> {
  const token = getAccessTokenFromHeader(req);
  if (!token) {
    return { valid: false, reason: "no_token" };
  }

  const secret = getDoctorAccessSecret();
  const payload = await verifyDoctorAccessToken(token, secret);
  if (!payload) {
    return { valid: false, reason: "invalid_token" };
  }

  // DB check: ensure patient hasn't revoked/deactivated since token was issued
  const { data: share, error } = await supabase
    .from("doctor_shares")
    .select("id, user_id, is_active, expires_at, revoked_at")
    .eq("id", payload.share_id)
    .maybeSingle();

  if (error || !share) {
    return { valid: false, reason: "share_not_found" };
  }

  if (share.user_id !== payload.user_id) {
    return { valid: false, reason: "user_mismatch" };
  }

  if (share.revoked_at) {
    return { valid: false, reason: "share_revoked" };
  }

  const now = new Date();
  const isActive = share.is_active && (!share.expires_at || now < new Date(share.expires_at));
  if (!isActive) {
    return { valid: false, reason: "share_inactive" };
  }

  return { valid: true, payload };
}
