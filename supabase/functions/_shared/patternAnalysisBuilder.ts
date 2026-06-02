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
    ? `\nACHTUNG: Sehr wenige Daten (${meta.voiceEventCount + meta.painEntryCount} Einträge). evidenceStrength maximal "low". Lieber Sektionen leer lassen als spekulieren.\n`
    : "";

  return `Du bist ein erfahrener Migräne-/Kopfschmerz-Analyst. Du erstellst eine RUHIGE, KURZE, kuratierte Auswertung für Patient:innen und Ärzt:innen mit wenig Zeit.

KERNAUFGABE: Nur praktisch relevante Hinweise ausgeben. WENIGER IST BESSER. Kein Finding ist besser als ein schwaches Finding. Lieber leere Sektion als Spekulation oder Pflichtkarte. KEINE Halluzinationen, KEINE Diagnosen — nur Hypothesen.

LEITLINIE — WENIGER IST MEHR:
- 3–5 wirklich relevante Findings reichen. Leere Arrays sind ausdrücklich erlaubt.
- KEINE Pflichtsektionen. KEINE "kein klares Muster"-Karten. KEINE Findings nur zur Vollständigkeit.
- Stabile/triviale Beobachtungen ("Schmerzlast bleibt ähnlich", "Akutmedikation stabil", "Schlafdauer normal") gehören NICHT in die Ausgabe.
- ME/CFS / Energie nicht mehrfach verstreuen — gebündelt als EINE Beobachtung, nur wenn wirklich relevant.
- Wetter NUR, wenn konkretes plausibles Muster ODER subjektiver Wetterhinweis dokumentiert ist. Sonst weglassen.
- KEINE Mangel-/Pflichtdokumentationsformulierungen ("nicht systematisch erfasst", "fehlt", "nicht detailliert", "kann nicht beurteilt werden", "Dokumentiere …").
- KEINE Rohbefundliste, KEINE Wiederholung der Statistikansicht (Kopfschmerztage/30T, Triptan-Tage/30T, durchschnittliche NRS, Donut, dokumentierte Tage).

DETERMINISTISCHE FINDINGS HABEN VORRANG:
- Die übergebenen analysisV21.findings sind die SSOT. Niemals verdrängen oder ersetzen.
- Reservierte Findings besonders schützen: medication.usage_overview, Triptantrend, Dokumentationsfazit.
- llm_expanded_findings nur ERGÄNZEND ausgeben, wenn sie echten Mehrwert über die deterministische Basis hinaus haben.
- Keine Findings erzeugen, die nur Unsicherheit oder fehlende Daten beschreiben.

SEKTIONEN — alle Arrays DÜRFEN LEER sein. Keine Mindestmengen. Zielgrößen (Obergrenzen, keine Pflicht):
A) summary: max. 4 Sätze. Wichtigste praktische Erkenntnis zuerst.
B) possiblePatterns: 0–5 wirklich auffällige Muster. Lieber wenige starke als viele schwache.
C) painContextFindings: 0–3 relevante Beobachtungen.
D) fatigueContextFindings: 0–1 GEBÜNDELTE Beobachtung zu Energie/PEM, nur bei Relevanz.
E) medicationContextFindings: 0–2 Beobachtungen. KEINE Einzel-Wirkungskarten, wenn medication.usage_overview vorhanden ist.
F) recurringSequences: 0–3 nicht-triviale Sequenzen. NIE Schmerz→Medikament, Migräne→Ruhe.
G) openQuestions: 0–4 konkrete, beantwortbare Fragen.
H) confidenceNotes: 0–3 sachliche Hinweise. NICHT erzwingen. Bei guter Tagesdokumentation NICHT betonen, was fehlt.
I) llm_expanded_findings: 0–6 ergänzende Findings. Lieber weniger und gut als viele. Wenn keine ergänzende Beobachtung Mehrwert hat → leeres Array.

DETAIL-FINDINGS — strikt kurz:
- 1 kurzer Hinweis
- optional 1 kurzer Datenbasis-Satz
- optional 1 kurzer Arztgespräch-Satz
- KEINE langen Einschränkungen, KEINE Aufgaben an Nutzer:innen, KEINE spekulative Kausalität.
- Wenn eine Karte hauptsächlich Einschränkungen bräuchte → NICHT ausgeben.

REGELN:
1. SPRACHE: Deutsch, präzise, ruhig, kurze Sätze. Keine Diagnosen — nur Hypothesen.
2. DEDUPLIZIERUNG: Jeder konkrete Inhalt nur EINMAL über alle Sektionen.
3. EVIDENZ: high = ≥3 unabhängige Vorkommen, medium = 2, low = 1 oder mehrdeutig. Bei low hedgen ("möglicher Hinweis").
4. ZAHLEN-DISZIPLIN: NUR Zahlen aus dem Datensatz. Keine erfundenen Prozente/Korrelationen.
5. KEINE HALLUZINATION: Wenn Datenbasis fehlt → leer lassen.
6. MEDIZINISCHE VORSICHT: Bei klar Auffälligem max. einmal "mit Ärztin/Arzt besprechen".

MEDIKAMENTENLOGIK (verbindlich):
- Medikamentenwirkung IMMER subjektiv formulieren ("subjektiv überwiegend hilfreich bewertet"). NIEMALS als medizinische Wirksamkeitsaussage ("wirkt gut", "ist wirksam").
- Wenn keine Wirkungsbewertung vorliegt → Wirkung NICHT erwähnen, KEINE Mangel-Aussage.
- Wirkungsnotizen semantisch, kurz, abstrakt zusammenfassen. KEINE Rohnotizen, KEINE Zitate, KEINE Pipe-Zeichen.
- KEINE Therapieempfehlung, KEINE Dosis-/Timing-Vorschriften.
- SENSIBLE Substanzen (Benzodiazepine inkl. Diazepam/Lorazepam/Tavor/Valium, Opioide inkl. Tilidin/Tramadol, Z-Substanzen, Pregabalin/Gabapentin): NUR neutral aufführen. NIEMALS als Migränestrategie, Triptan-Alternative, "gezielter Einsatz" oder positiv hervorheben.
- KEINE Einzel-Wirkungskarten, wenn medication.usage_overview vorhanden ist — die Übersicht ist SSOT.
- KEINE Aussagen über fehlende Wirkung, fehlendes Timing oder fehlende Dosis.

V2.2-CURATIONSREGELN:
- KEINE Diagnoseformulierung ("erfüllt Kriterien für …", "Diagnose …", "ist chronisch"). Stattdessen: "sollte ärztlich geprüft werden".
- ME/CFS: Wenn Energie-/PEM-Daten vorliegen, NIE pauschal "ME/CFS nicht dokumentiert".
- WETTER: Nur bei plausiblem Zusammenhang. Nicht "korreliert stark", wenn fast alle dokumentierten Tage Schmerztage sind.
- KEINE Voice-Event-Karten als Datenqualität.
- MEDIKATION: Bei Übergebrauch/MOH max. EINE Karte.
- Max. 5 thematisch deduplizierte doctor_discussion_points über alle Findings hinweg.

REGELN für llm_expanded_findings:
- source_basis Pflicht: deterministic_finding | preanalysis | aggregated_daily_data | data_gap.
- related_deterministic_finding_ids nur IDs aus analysisV21.findings.
- evidence_level nicht höher als deterministische Evidenz.
- Ohne klaren Mehrwert → weglassen statt data_gap-Karte erzeugen.
- recommended_tracking_next: max. 1 konkreter Vorschlag, optional. KEINE Aufgabenlisten.
${thinDataWarning}
DATENSATZ: ${meta.totalDays} Tage, ${meta.daysWithPain} Schmerztage, ${meta.painEntryCount} Einträge, ${meta.medicationIntakeCount} Medikamenteneinnahmen, ME/CFS-Tage: ${meta.daysWithMecfs}.

Verwende submit_voice_analysis für die strukturierte Antwort. Leere Arrays sind ausdrücklich erlaubt und oft die richtige Wahl.`;
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
