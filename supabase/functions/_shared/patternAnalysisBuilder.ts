/**
 * patternAnalysisBuilder.ts — Shared Pattern Analysis V2.2 Engine
 *
 * Phase 1 of the App/Shared engine unification: this module owns the
 * deterministic, non-IO parts that previously lived inline in
 * `analyze-voice-patterns/index.ts`:
 *
 *   • V2.2 system prompt
 *   • LLM tool schema (`submit_voice_analysis`)
 *   • Structured-output extraction + validation
 *   • Postprocess of `llm_expanded_findings`
 *   • Final `scope` / `meta` / `schema_version` envelope
 *
 * Both endpoints MUST go through `runPatternAnalysisV22` so:
 *   - App `analyze-voice-patterns`
 *   - Doctor-Share `analyze-voice-patterns-shared`
 *
 * produce a byte-compatible `analysisV21` payload with the SAME
 * `schema_version: "2.1"` and `analysis_version: "2.2.0"` that the
 * website + App UI already consume.
 *
 * INTENTIONAL NON-GOALS (Phase 1):
 *   - Building the deterministic pre-analysis / V2.1 findings
 *     server-side (still passed in by the App client; Shared will
 *     port this in Phase 2 — see TODO in shared endpoint).
 *   - Weather V2.3 backfill / cron / migrations.
 *   - Persisting to `ai_reports` (caller decides).
 *
 * SECURITY:
 *   - Never logs PHI / transcripts / notes.
 *   - Caller controls private-notes / red-flag exclusion BEFORE
 *     passing `serializedContext`. The builder itself is pure
 *     prompt + LLM + postprocess.
 */

import {
  postprocessExpandedFindings,
  V21_CATEGORIES,
  V21_EVIDENCE,
  V21_SOURCE_BASIS,
  V21_RELEVANCE,
} from "./patternAnalysisPostprocess.ts";

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export interface PatternAnalysisMeta {
  totalDays: number;
  voiceEventCount: number;
  painEntryCount: number;
  medicationIntakeCount: number;
  daysWithPain: number;
  daysWithMecfs: number;
}

export interface RunPatternAnalysisInput {
  serializedContext: string;
  meta: PatternAnalysisMeta;
  fromDate: string;
  toDate: string;
  preAnalysis?: unknown;
  deterministicFindings?: unknown[];
  apiKey: string;
  /** "app" → triggered from patient app, "doctor_share" → triggered via doctor link. */
  source: "app" | "doctor_share";
  /**
   * If false (default for Doctor-Share), the caller MUST already have
   * stripped private free-text notes from `serializedContext`.
   */
  includePrivateNotes: boolean;
  /** Test-only: inject a fetch implementation to avoid hitting the real LLM. */
  llmFetch?: typeof fetch;
  /** Override LLM timeout (ms). Default 90s. */
  timeoutMs?: number;
}

export type RunPatternAnalysisResult =
  | { ok: true; status: 200; body: Record<string, unknown>; tokenEstimate: number }
  | { ok: false; status: number; body: Record<string, unknown> };

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

export const MAX_CONTEXT_CHARS = 120_000;
export const WARN_CONTEXT_CHARS = 80_000;
export const MIN_VOICE_EVENTS_OR_ENTRIES = 1;
const DEFAULT_LLM_TIMEOUT_MS = 90_000;
const MODEL = "google/gemini-2.5-flash";

export const SCHEMA_VERSION = "2.1";
export const ANALYSIS_VERSION = "2.2.0";

// ─────────────────────────────────────────────────────────────────────────
// Tool schema
// ─────────────────────────────────────────────────────────────────────────

const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_voice_analysis",
    description:
      "Submit the structured analysis of the patient's voice diary data. All findings are hypotheses, not diagnoses.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        possiblePatterns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              patternType: {
                type: "string",
                enum: [
                  "trigger_candidate", "temporal_sequence", "recurring_context",
                  "pem_pattern", "medication_context", "sleep_impact",
                  "environment_sensitivity", "food_drink_association", "stress_load", "other",
                ],
              },
              title: { type: "string" },
              description: { type: "string" },
              evidenceStrength: { type: "string", enum: ["low", "medium", "high"] },
              occurrences: { type: "number" },
              examples: { type: "array", items: { type: "string" } },
              uncertaintyNotes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    reason: { type: "string" },
                    code: {
                      type: "string",
                      enum: [
                        "few_data_points", "ambiguous_timing", "no_confirmation",
                        "single_occurrence", "unclear_causation", "incomplete_data",
                      ],
                    },
                  },
                  required: ["reason", "code"],
                },
              },
            },
            required: [
              "patternType", "title", "description", "evidenceStrength",
              "occurrences", "examples", "uncertaintyNotes",
            ],
          },
        },
        painContextFindings: { type: "array", items: { type: "object" } },
        fatigueContextFindings: { type: "array", items: { type: "object" } },
        medicationContextFindings: { type: "array", items: { type: "object" } },
        recurringSequences: { type: "array", items: { type: "object" } },
        openQuestions: { type: "array", items: { type: "string" } },
        confidenceNotes: { type: "array", items: { type: "string" } },
        llm_expanded_findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              category: { type: "string", enum: [...V21_CATEGORIES] },
              title: { type: "string" },
              evidence_level: { type: "string", enum: [...V21_EVIDENCE] },
              source_basis: { type: "string", enum: [...V21_SOURCE_BASIS] },
              related_deterministic_finding_ids: { type: "array", items: { type: "string" } },
              summary: { type: "string" },
              reasoning: { type: "string" },
              limitations: { type: "array", items: { type: "string" } },
              patient_relevance: { type: "string", enum: [...V21_RELEVANCE] },
              doctor_relevance: { type: "string", enum: [...V21_RELEVANCE] },
              recommended_tracking_next: { type: "array", items: { type: "string" } },
              doctor_discussion_points: { type: "array", items: { type: "string" } },
            },
            required: [
              "id", "category", "title", "evidence_level", "source_basis",
              "related_deterministic_finding_ids", "summary", "reasoning",
              "limitations", "patient_relevance", "doctor_relevance",
              "recommended_tracking_next", "doctor_discussion_points",
            ],
          },
        },
      },
      required: [
        "summary", "possiblePatterns", "painContextFindings",
        "fatigueContextFindings", "medicationContextFindings",
        "recurringSequences", "openQuestions", "confidenceNotes",
        "llm_expanded_findings",
      ],
      additionalProperties: false,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// System prompt (V2.2 — same as App index.ts)
// ─────────────────────────────────────────────────────────────────────────

export function buildSystemPrompt(meta: PatternAnalysisMeta): string {
  const thinData = meta.voiceEventCount + meta.painEntryCount < 10;
  const thinDataWarning = thinData
    ? `\nACHTUNG: Sehr wenige Daten (${meta.voiceEventCount + meta.painEntryCount} Einträge). evidenceStrength maximal "low". Betone Datenlücken in confidenceNotes.\n`
    : "";

  return `Du bist ein erfahrener Migräne-Analyst. Du fasst mögliche Zusammenhänge ruhig, breit und fachlich zusammen – wie eine sorgfältige medizinische Auswertung, die nichts ohne Hinweis auslässt.

KERNAUFGABE: Migräne-/kopfschmerzrelevante Zusammenhänge identifizieren. Mehrere Perspektiven (Auslöser, Wetter, Zeitmuster, Medikamente, Energie/PEM, Datenqualität) IMMER bearbeiten – auch wenn das Ergebnis pro Sektion „kein klares Muster" lautet.

REGELN:

1. SPRACHE: Deutsch. Ruhig, präzise, hilfreich. Kurze Sätze. Nicht belehrend.
2. KEINE DIAGNOSEN – nur vorsichtige Hypothesen.
3. PFLICHTSEKTIONEN — JEDE Kategorie MUSS bearbeitet werden. Wenn keine Daten vorliegen, schreibe einen kurzen, klaren Hinweis – NICHT die Sektion stillschweigend leer lassen.
4. AUSGABE-MINDESTMENGEN:
   * possiblePatterns: 2–4 Hauptmuster (medium/high) + 4–8 schwächere Hinweise (low). Insgesamt 6–12.
   * painContextFindings: 1–4 Beobachtungen.
   * fatigueContextFindings: 1–4 Beobachtungen.
   * medicationContextFindings: 1–4 Beobachtungen.
   * recurringSequences: 0–4 nicht-triviale Abfolgen.
   * openQuestions: 1–3 konkrete Fragen.
   * confidenceNotes: 2–4 Datenqualitätsnotizen.
5. RELEVANZ-REIHENFOLGE: Medikamentenverhalten > Schlaf > Stress > Wetter > Zeit > Reize > Belastung→PEM→Kopfschmerz.
6. SUMMARY (2–3 Sätze): wichtigste Erkenntnis zuerst.
7. WETTER: Konkrete Zahlen aus dem Datensatz oder explizit „Wetterabdeckung X Tage; keine klare Häufung".
8. ZEITMUSTER: Top-Tag ≥30 % oder Top-Phase ≥40 % → Pattern; sonst confidenceNote mit n.
9. MEDIKAMENTEN-VERMEIDUNG: Spätes/fehlendes Einsetzen trotz starker Beschwerden → starkes Pattern.
10. VERBOTENE TRIVIALE MUSTER: Schmerz→Triptan, Kopfschmerz→Ruhe, Müdigkeit→Ruhe, Schmerz→Übelkeit, Medikament→Wirkung ohne Kontext.
11. EVIDENZ: high ≥3 unabhängige Vorkommen, medium 2, low 1/lückenhaft/mehrdeutig.
12. NUR Zahlen aus dem Datensatz. Keine erfundenen Prozente.
13. DEDUPLIZIERUNG: Jeder Inhalt nur einmal.
14. KEIN TAGESBERICHT.
15. MEDIZINISCHE VORSICHT.
16. NUTZE „=== Deterministische Vorab-Auswertung ===".
${thinDataWarning}
DATENSATZ: ${meta.totalDays} Tage, ${meta.daysWithPain} Schmerztage, ${meta.painEntryCount} Einträge, ${meta.medicationIntakeCount} Medikamenteneinnahmen, ME/CFS-Tage: ${meta.daysWithMecfs}.

=== V2.2 ZUSATZAUFGABE: llm_expanded_findings ===
Quellen: deterministische Voranalyse (_preAnalysis), strukturierte V2.1-Findings, aggregierte Verlaufsdaten.

V2.2-REGELN (Curation):
- KEINE Diagnose-Formulierungen ("erfüllt Kriterien", "Diagnose chronische Migräne"). Stattdessen "ärztlich zu prüfender Bereich".
- KEINE Voice-Event-Anzahl als Datenqualitäts-Finding.
- ME/CFS DARF NICHT pauschal als "nicht ausreichend dokumentiert" gelten, sobald me_cfs_severity_score/_level an mehreren Tagen vorhanden sind. Nutze ALLE ME/CFS-Quellen (Score, Level, Energie/Fatigue/Brain-Fog/Crash/PEM, Tagesfaktoren, Impact). Wenn ME/CFS-Signale häufig sind, aber Belastungs-/Erholungsangaben fehlen: "PEM-Detaildaten fehlen" mit evidence_level="low" — NICHT generelle ME/CFS-Lücke.
- Wetter: NICHT "korreliert stark mit Schmerz", wenn fast alle dokumentierten Tage Schmerztage sind. Limitation klar nennen.
- Chronifizierung: nur "ärztlich zu prüfender Bereich".
- Triptan: keine interaction-Doppelung wenn medication_use bereits Triptan-Zurückhaltung trägt.
- Maximal 5 thematisch deduplizierte doctor_discussion_points über alle Findings hinweg.

REGELN für llm_expanded_findings:
- 10–24 Findings.
- source_basis Pflicht: deterministic_finding | preanalysis | aggregated_daily_data | data_gap.
- related_deterministic_finding_ids nur IDs aus analysisV21.findings.
- evidence_level nicht höher als deterministische Evidenz.
- Ohne Datenbasis → data_gap + insufficient.
- recommended_tracking_next ≥1 konkreter Vorschlag.

PFLICHTBEREICHE (jeweils mind. 1 Finding ODER data_gap):
burden/chronification, medication_use, medication_effect, weather, mecfs_energy_pem, sleep, stress_mood, symptoms_aura, time_pattern, lifestyle_triggers, interaction, data_quality, red_flag.

Verwende submit_voice_analysis. Halte ALLE Mindestmengen und Pflichtfelder ein.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers (exported for testing)
// ─────────────────────────────────────────────────────────────────────────

export function extractAnalysisFromLLMResponse(
  llmData: Record<string, unknown>,
): Record<string, unknown> | null {
  const toolCall = (llmData as any)?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      if (parsed && typeof parsed === "object" && typeof parsed.summary === "string") {
        return parsed;
      }
    } catch {
      // fall through
    }
  }
  const content = (llmData as any)?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && typeof parsed.summary === "string") {
        return parsed;
      }
    } catch { /* ignore */ }
  }
  return null;
}

export function validateExtractedResult(result: Record<string, unknown>): boolean {
  if (typeof result.summary !== "string" || result.summary.length < 5) return false;
  const required = [
    "possiblePatterns", "painContextFindings", "fatigueContextFindings",
    "medicationContextFindings", "openQuestions", "confidenceNotes",
  ];
  return required.every((k) => Array.isArray(result[k]));
}

function errBody(error: string, code: string): Record<string, unknown> {
  return { error, code, errorCode: code };
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────────────────────────────────

export async function runPatternAnalysisV22(
  input: RunPatternAnalysisInput,
): Promise<RunPatternAnalysisResult> {
  const {
    serializedContext, meta, fromDate, toDate,
    preAnalysis, deterministicFindings, apiKey,
    llmFetch, timeoutMs,
  } = input;

  // Data sufficiency
  if (meta.voiceEventCount + meta.painEntryCount < MIN_VOICE_EVENTS_OR_ENTRIES) {
    return {
      ok: false, status: 422,
      body: errBody(
        "Zu wenig Daten für eine sinnvolle Analyse. Bitte mindestens einige Tage dokumentieren.",
        "INSUFFICIENT_DATA",
      ),
    };
  }

  // Context size
  const contextChars = serializedContext.length;
  const tokenEstimate = Math.ceil(contextChars / 4);
  if (contextChars > MAX_CONTEXT_CHARS) {
    return {
      ok: false, status: 413,
      body: {
        ...errBody("Analysezeitraum zu groß. Bitte einen kürzeren Zeitraum wählen.", "CONTEXT_TOO_LARGE"),
        contextChars, tokenEstimate, maxChars: MAX_CONTEXT_CHARS,
      },
    };
  }

  const detFindings = Array.isArray(deterministicFindings) ? deterministicFindings : [];
  const detFindingIds = new Set<string>(
    detFindings
      .map((f: any) => (typeof f?.id === "string" ? f.id : ""))
      .filter((s: string) => !!s),
  );

  // LLM call
  const systemPrompt = buildSystemPrompt(meta);
  const controller = new AbortController();
  const tId = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS);

  let llmResponse: Response;
  try {
    const fetcher = llmFetch ?? fetch;
    llmResponse = await fetcher("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analysiere die folgenden Verlaufsdaten aus dem Migräne-Tagebuch (${meta.totalDays} Tage, ${fromDate.slice(0, 10)} bis ${toDate.slice(0, 10)}).

VERLAUFSDATEN:

${serializedContext}

=== Deterministische Voranalyse (_preAnalysis) ===
${preAnalysis ? JSON.stringify(preAnalysis, null, 2).slice(0, 8000) : "(keine bereitgestellt)"}

=== Deterministische V2.1-Findings (analysisV21.findings) ===
${detFindings.length > 0 ? JSON.stringify(detFindings, null, 2).slice(0, 12000) : "(keine bereitgestellt)"}`,
          },
        ],
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "function", function: { name: "submit_voice_analysis" } },
      }),
      signal: controller.signal,
    });
  } catch (fetchError) {
    clearTimeout(tId);
    const isTimeout = fetchError instanceof DOMException && fetchError.name === "AbortError";
    if (isTimeout) {
      return {
        ok: false, status: 504,
        body: errBody(
          "Die Analyse hat zu lange gedauert. Bitte einen kürzeren Zeitraum wählen oder es später erneut versuchen.",
          "TIMEOUT",
        ),
      };
    }
    return {
      ok: false, status: 502,
      body: errBody("Der KI-Dienst ist vorübergehend nicht erreichbar. Bitte später erneut versuchen.", "LLM_UNAVAILABLE"),
    };
  }
  clearTimeout(tId);

  if (!llmResponse.ok) {
    const status = llmResponse.status;
    try { await llmResponse.text(); } catch { /* drain */ }
    if (status === 429) {
      return { ok: false, status: 429, body: errBody("Rate Limit erreicht. Bitte später erneut versuchen.", "LLM_UNAVAILABLE") };
    }
    if (status === 402) {
      return { ok: false, status: 402, body: errBody("Guthaben aufgebraucht.", "LLM_UNAVAILABLE") };
    }
    return { ok: false, status: 502, body: errBody(`LLM request failed (${status})`, "LLM_UNAVAILABLE") };
  }

  let llmData: Record<string, unknown>;
  try {
    llmData = await llmResponse.json();
  } catch {
    return { ok: false, status: 502, body: errBody("Die KI-Antwort konnte nicht verarbeitet werden.", "LLM_UNAVAILABLE") };
  }

  const analysisResult = extractAnalysisFromLLMResponse(llmData);
  if (!analysisResult || !validateExtractedResult(analysisResult)) {
    return {
      ok: false, status: 502,
      body: errBody("Die KI-Analyse war unvollständig. Bitte erneut versuchen.", "LLM_UNAVAILABLE"),
    };
  }

  // Postprocess expanded findings
  const expandedFindings = postprocessExpandedFindings(
    (analysisResult as any).llm_expanded_findings,
    detFindingIds,
  );
  (analysisResult as any).llm_expanded_findings = expandedFindings;

  const body = {
    ...analysisResult,
    scope: {
      fromDate, toDate,
      totalDays: meta.totalDays,
      daysAnalyzed: meta.totalDays,
      voiceEventCount: meta.voiceEventCount,
      painEntryCount: meta.painEntryCount,
      medicationIntakeCount: meta.medicationIntakeCount,
    },
    meta: {
      model: MODEL,
      analyzedAt: new Date().toISOString(),
      promptTokenEstimate: tokenEstimate,
      analysisVersion: ANALYSIS_VERSION,
    },
    schema_version: SCHEMA_VERSION,
    analysis_version: ANALYSIS_VERSION,
    llm_expanded_findings: expandedFindings,
  };

  return { ok: true, status: 200, body, tokenEstimate };
}
