/**
 * shareAnalysisGate.ts (Deno)
 *
 * Server-side gate that decides whether a Doctor-Share session is
 * allowed to trigger a NEW pattern analysis via share code.
 *
 * Pure function — no DB I/O. Callers (e.g. a future
 * `analyze-voice-patterns-shared` endpoint) gather the inputs from:
 *   - `doctor_shares` row (active, expires_at)
 *   - `doctor_share_settings` row (include_ai_analysis, allow_ai_generate)
 *   - latest `ai_reports` row of type `pattern_analysis`
 *
 * Default-safe: missing/unknown flags resolve to "not allowed".
 *
 * Cooldown rule: 15 minutes since last stored pattern analysis. The
 * cooldown is HARD — data changes or analysis-version drift do NOT
 * bypass it. After cooldown elapses, generation is allowed.
 *
 * TODO: wire into `supabase/functions/analyze-voice-patterns-shared`
 * (or equivalent shared-analyze endpoint) before invoking the LLM.
 */

export const SHARE_ANALYSIS_COOLDOWN_MINUTES = 15;

export type ShareAnalysisGateReason =
  | "share_inactive"
  | "share_expired"
  | "ai_analysis_not_included"
  | "ai_generation_not_allowed"
  | "cooldown_active"
  | "allowed";

export interface ShareAnalysisGenerationGate {
  allowed: boolean;
  reason: ShareAnalysisGateReason;
  /** Minutes the caller must wait before retrying (cooldown_active only). */
  waitMinutes?: number;
}

export interface ShareAnalysisGateInput {
  share: {
    active?: boolean | null;
    expiresAtISO?: string | null;
  } | null | undefined;
  settings: {
    include_ai_analysis?: boolean | null;
    allow_ai_generate?: boolean | null;
  } | null | undefined;
  lastAnalysisAtISO?: string | null;
  cooldownMinutes?: number;
  nowMs?: number;
}

export function evaluateShareAnalysisGate(
  input: ShareAnalysisGateInput,
): ShareAnalysisGenerationGate {
  const now = input.nowMs ?? Date.now();
  const cooldown = input.cooldownMinutes ?? SHARE_ANALYSIS_COOLDOWN_MINUTES;

  // 1. Share must exist + be active
  if (!input.share || input.share.active === false) {
    return { allowed: false, reason: "share_inactive" };
  }

  // 2. Share must not be expired
  if (input.share.expiresAtISO) {
    const exp = Date.parse(input.share.expiresAtISO);
    if (!Number.isNaN(exp) && exp <= now) {
      return { allowed: false, reason: "share_expired" };
    }
  }

  // 3. AI analysis must be included in the share
  if (!input.settings || input.settings.include_ai_analysis !== true) {
    return { allowed: false, reason: "ai_analysis_not_included" };
  }

  // 4. Doctor must be permitted to GENERATE (default-safe: false)
  if (input.settings.allow_ai_generate !== true) {
    return { allowed: false, reason: "ai_generation_not_allowed" };
  }

  // 5. Cooldown — hard, not bypassable by data changes
  if (input.lastAnalysisAtISO) {
    const last = Date.parse(input.lastAnalysisAtISO);
    if (!Number.isNaN(last)) {
      const elapsedMin = (now - last) / 60_000;
      if (elapsedMin < cooldown) {
        return {
          allowed: false,
          reason: "cooldown_active",
          waitMinutes: Math.max(1, Math.ceil(cooldown - elapsedMin)),
        };
      }
    }
  }

  return { allowed: true, reason: "allowed" };
}
