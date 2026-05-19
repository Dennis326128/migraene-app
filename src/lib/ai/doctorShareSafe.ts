/**
 * doctorShareSafe
 *
 * Strips an `ai_reports.response_json` payload to the fields safe to
 * surface in the public Doctor-Share website:
 *
 *  - keeps `analysisV21` (data_basis, clinical_caution, section_map,
 *    findings, llm_expanded_findings filtered by `should_show_in_doctor_share`)
 *  - drops `_legacy`, `_preAnalysis`, debug fields, private notes,
 *    transcripts, audio URLs.
 *
 * Pure function — no I/O. Use server-side before persisting the share
 * snapshot, or client-side when rendering the share view.
 */

import { normalizeAnalysisFindings } from "./normalizeAnalysisFindings";

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
  analysisV21: Record<string, unknown> | null;
  data_basis: unknown;
  clinical_caution: unknown;
  section_map: unknown;
  findings_normalized: ReturnType<typeof normalizeAnalysisFindings>;
}

export function getDoctorShareSafeAnalysis(
  responseJson: unknown,
): DoctorShareSafeAnalysis | null {
  if (!responseJson || typeof responseJson !== "object") return null;
  const rj = responseJson as Record<string, unknown>;

  const v21Raw = rj.analysisV21 as Record<string, unknown> | undefined;
  if (!v21Raw || typeof v21Raw !== "object") {
    // No V2.1 → nothing safe to share.
    return null;
  }

  // Deep-clean: drop private keys at top level, then filter findings.
  const v21: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(v21Raw)) {
    if (PRIVATE_KEYS.has(k)) continue;
    v21[k] = v;
  }

  // Filter llm_expanded_findings and deterministic findings by doctor-share flag
  const llmExp = Array.isArray(v21Raw.llm_expanded_findings)
    ? (v21Raw.llm_expanded_findings as Array<Record<string, unknown>>).filter(
        (f) => (f as any).category !== "red_flag",
      )
    : [];
  const det = Array.isArray(v21Raw.findings)
    ? (v21Raw.findings as Array<Record<string, unknown>>).filter(
        (f) => (f as any).should_show_in_doctor_share !== false,
      )
    : [];
  v21.llm_expanded_findings = llmExp;
  v21.findings = det;

  return {
    analysisV21: v21,
    data_basis: v21.data_basis ?? null,
    clinical_caution: v21.clinical_caution ?? null,
    section_map: v21.section_map ?? null,
    findings_normalized: normalizeAnalysisFindings({ analysisV21: v21 }, { doctorShare: true }),
  };
}
