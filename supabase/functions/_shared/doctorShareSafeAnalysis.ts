/**
 * doctorShareSafeAnalysis.ts (Deno)
 *
 * Server-side mirror of `src/lib/ai/doctorShareSafe.ts`. Used by
 * Doctor-Share endpoints to strip an `ai_reports.response_json` payload
 * down to V2.1 fields safe for public/shared rendering.
 *
 * Drops: _legacy, _preAnalysis, _debug, transcripts, audio URLs,
 * private notes. Filters findings flagged should_show_in_doctor_share=false
 * and any LLM finding in category "red_flag".
 *
 * Returns null when the report has no analysisV21 payload (nothing safe
 * to share yet).
 */

const PRIVATE_KEYS = new Set([
  "_legacy",
  "_preAnalysis",
  "_debug",
  "transcripts",
  "transcript",
  "audio_url",
  "audioUrl",
  "private_notes",
  "raw_voice_segments",
]);

export interface DoctorShareSafeAnalysis {
  analysisV21: Record<string, unknown>;
  data_basis: unknown;
  clinical_caution: unknown;
  section_map: unknown;
}

export function getDoctorShareSafeAnalysis(
  responseJson: unknown,
): DoctorShareSafeAnalysis | null {
  if (!responseJson || typeof responseJson !== "object") return null;
  const rj = responseJson as Record<string, unknown>;
  const v21Raw = rj.analysisV21 as Record<string, unknown> | undefined;
  if (!v21Raw || typeof v21Raw !== "object") return null;

  const v21: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(v21Raw)) {
    if (PRIVATE_KEYS.has(k)) continue;
    v21[k] = v;
  }

  const llmExp = Array.isArray(v21Raw.llm_expanded_findings)
    ? (v21Raw.llm_expanded_findings as Array<Record<string, unknown>>).filter(
        (f) => (f as { category?: string }).category !== "red_flag",
      )
    : [];
  const det = Array.isArray(v21Raw.findings)
    ? (v21Raw.findings as Array<Record<string, unknown>>).filter(
        (f) => (f as { should_show_in_doctor_share?: boolean })
          .should_show_in_doctor_share !== false,
      )
    : [];
  v21.llm_expanded_findings = llmExp;
  v21.findings = det;

  return {
    analysisV21: v21,
    data_basis: v21.data_basis ?? null,
    clinical_caution: v21.clinical_caution ?? null,
    section_map: v21.section_map ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Re-analyze rate gate (server-side mirror).
// Used by future Doctor-Share endpoint that lets a doctor trigger a
// new analysis via share code — must respect the 15-min cooldown so
// the share cannot spam analyses.
// ─────────────────────────────────────────────────────────────────────

export const SHARE_REANALYZE_COOLDOWN_MINUTES = 15;

export interface ShareReAnalyzeGateInput {
  lastCreatedAtISO?: string | null;
  cooldownMinutes?: number;
  nowMs?: number;
}

export interface ShareReAnalyzeGateResult {
  allowed: boolean;
  reason: "no_existing_report" | "cooldown_passed" | "cooldown_active";
  waitMinutes?: number;
}

export function evaluateShareReAnalyzeGate(
  input: ShareReAnalyzeGateInput,
): ShareReAnalyzeGateResult {
  const cooldown = input.cooldownMinutes ?? SHARE_REANALYZE_COOLDOWN_MINUTES;
  const now = input.nowMs ?? Date.now();
  if (!input.lastCreatedAtISO) return { allowed: true, reason: "no_existing_report" };
  const last = Date.parse(input.lastCreatedAtISO);
  if (Number.isNaN(last)) return { allowed: true, reason: "no_existing_report" };
  const elapsedMin = (now - last) / 60_000;
  if (elapsedMin >= cooldown) return { allowed: true, reason: "cooldown_passed" };
  return {
    allowed: false,
    reason: "cooldown_active",
    waitMinutes: Math.max(1, Math.ceil(cooldown - elapsedMin)),
  };
}
