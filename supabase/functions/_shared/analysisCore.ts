/**
 * analysisCore.ts
 *
 * Shared LLM core for voice-pattern analysis.
 * Used by:
 *   - analyze-voice-patterns          (App, JWT auth)
 *   - analyze-voice-patterns-shared   (Doctor share, HMAC auth)
 *
 * NO data fetching, NO consent check — purely:
 *   1) Prompt + tool schema
 *   2) LLM call
 *   3) Extraction + validation
 *   4) Unavailable-result builder
 *
 * Keep this file deterministic and side-effect-free apart from the LLM fetch.
 */

export const MAX_CONTEXT_CHARS = 120_000;
export const WARN_CONTEXT_CHARS = 80_000;
export const MIN_VOICE_EVENTS_OR_ENTRIES = 1;
export const LLM_TIMEOUT_MS = 90_000;

export interface AnalysisMeta {
  totalDays: number;
  voiceEventCount: number;
  painEntryCount: number;
  medicationIntakeCount: number;
  daysWithPain: number;
  daysWithMecfs: number;
}

export const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_voice_analysis",
    description: "Submit the structured analysis of the patient's voice diary data. All findings are hypotheses, not diagnoses.",
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
                  "environment_sensitivity", "food_drink_association", "stress_load", "other"
                ]
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
                    code: { type: "string", enum: ["few_data_points", "ambiguous_timing", "no_confirmation", "single_occurrence", "unclear_causation", "incomplete_data"] }
                  },
                  required: ["reason", "code"]
                }
              }
            },
            required: ["patternType", "title", "description", "evidenceStrength", "occurrences", "examples", "uncertaintyNotes"]
          }
        },
        painContextFindings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              observation: { type: "string" },
              frequency: { type: "string" },
              examples: { type: "array", items: { type: "string" } },
              evidenceStrength: { type: "string", enum: ["low", "medium", "high"] }
            },
            required: ["observation", "frequency", "examples", "evidenceStrength"]
          }
        },
        fatigueContextFindings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              observation: { type: "string" },
              frequency: { type: "string" },
              examples: { type: "array", items: { type: "string" } },
              evidenceStrength: { type: "string", enum: ["low", "medium", "high"] }
            },
            required: ["observation", "frequency", "examples", "evidenceStrength"]
          }
        },
        medicationContextFindings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              observation: { type: "string" },
              frequency: { type: "string" },
              examples: { type: "array", items: { type: "string" } },
              evidenceStrength: { type: "string", enum: ["low", "medium", "high"] }
            },
            required: ["observation", "frequency", "examples", "evidenceStrength"]
          }
        },
        recurringSequences: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              count: { type: "number" },
              llmInterpretation: { type: "string" }
            },
            required: ["pattern", "count", "llmInterpretation"]
          }
        },
        openQuestions: { type: "array", items: { type: "string" } },
        confidenceNotes: { type: "array", items: { type: "string" } }
      },
      required: [
        "summary", "possiblePatterns", "painContextFindings",
        "fatigueContextFindings", "medicationContextFindings",
        "recurringSequences", "openQuestions", "confidenceNotes"
      ],
      additionalProperties: false
    }
  }
};

export interface BuildSystemPromptOptions {
  /** Whether the dataset may include private free-text notes (App=true, Doctor-Share=false). */
  includesPrivateNotes?: boolean;
}

export function buildSystemPrompt(meta: AnalysisMeta, opts: BuildSystemPromptOptions = {}): string {
  const includesPrivateNotes = opts.includesPrivateNotes ?? true;
  const thinData = (meta.voiceEventCount + meta.painEntryCount) < 10;
  const thinDataWarning = thinData
    ? `\nACHTUNG: Sehr wenige Daten (${meta.voiceEventCount + meta.painEntryCount} Einträge). evidenceStrength maximal "low". Betone Datenlücken in confidenceNotes.\n`
    : '';
  const privacyNote = includesPrivateNotes
    ? ''
    : '\nPRIVATSPHÄRE: Dieser Datensatz enthält KEINE privaten Freitext-Notizen (Doctor-Share). Nur strukturierte Felder (mood/stress/sleep/energy/triggers) auswerten.\n';

  return `Du bist ein erfahrener Migräne-/Kopfschmerz-Analyst. Du erstellst eine BREITE, ruhige, fachliche Auswertung — wie eine hochwertige medizinische Kurzanalyse, die sowohl dominante als auch schwächere, aber plausible Hinweise sichtbar macht.

KERNAUFGABE: Möglichst viele migräne-/kopfschmerzrelevante Zusammenhänge identifizieren — auch schwache Hinweise, sofern datengestützt. KEINE Halluzinationen.

PFLICHTSEKTIONEN — jede MUSS bearbeitet werden. Wenn keine Daten vorliegen, schreibe einen kurzen Hinweis in confidenceNotes (z. B. "Keine Wetterdaten im Zeitraum") statt die Sektion stillschweigend leer zu lassen.

A) HAUPTAUFFÄLLIGKEITEN (possiblePatterns, evidenceStrength medium/high): 2–4 stärkste Muster.
B) WEITERE MÖGLICHE ZUSAMMENHÄNGE (possiblePatterns, evidenceStrength low): 4–8 zusätzliche Hinweise mit niedriger Evidenz, klar als "möglicher Hinweis" / "schwacher Hinweis" markiert.
   Beispiele für plausible schwache Muster: bestimmte Uhrzeiten/Tagesphasen, Wochentage, Werktag vs. Wochenende, Luftdruckabfall, Temperaturwechsel, Schlafqualität am Vortag, Stress am Vortag, niedrige Energie / PEM-Kontext, späte oder ausbleibende Medikamenteneinnahme, Kombinationen Schlaf+Wetter+Stress.
C) SCHMERZ-KONTEXT (painContextFindings): bis zu 4 Beobachtungen zu Lokalisation, Aura, Intensität, Dauer.
D) FATIGUE / ME-CFS / PEM (fatigueContextFindings): bis zu 4 Beobachtungen zu Energie, PEM, Belastung am Vortag (T-1, T-2), Crash-Mustern. Bei fehlenden Daten: ein Eintrag "ME/CFS-/PEM-Daten nicht ausreichend dokumentiert" als observation, evidenceStrength=low.
E) MEDIKAMENTE (medicationContextFindings): bis zu 4 Beobachtungen zu Einnahmezeitpunkt relativ zum Schmerzbeginn, Triptan-Zurückhaltung, Wiederholungseinnahmen, möglichem Übergebrauch (MOH-Risiko nur bei klarer Datenbasis).
F) WIEDERKEHRENDE SEQUENZEN (recurringSequences): bis zu 4. Trivialsequenzen (Schmerz→Medikament, Migräne→Ruhe) NIE.
G) OFFENE FRAGEN (openQuestions): bis zu 3 konkrete, beantwortbare Fragen für die nächste Dokumentationsphase.
H) DATENQUALITÄT (confidenceNotes): 2–4 Hinweise zu Wetterabdeckung, ME/CFS-Abdeckung, Anzahl Tagesfaktoren, fehlenden Feldern.

ZWINGENDE PRÜFUNGEN — pro Lauf abarbeiten:
• WETTER: Falls Wetterblock im Datensatz vorhanden, prüfe Luftdruckniveau, Luftdruckänderung 24h, Temperatur, Temperaturwechsel, Luftfeuchtigkeit. Lege min. 1 Hinweis in possiblePatterns oder confidenceNotes ab. Wenn Wetterblock fehlt: ein confidenceNote "Wetterdaten im Zeitraum nicht ausreichend vorhanden".
• ZEITMUSTER: Falls Zeitaggregat-Block vorhanden, prüfe Tagesphasen (Morgen/Mittag/Abend/Nacht), Wochentage, Werktag vs. Wochenende. Mind. 1 Hinweis ODER expliziter Vermerk "Kein klares Zeitmuster erkennbar".
• ME/CFS / PEM: Falls Tagesfaktoren mit energy/fatigue_context_tags vorhanden, prüfe Belastung→Schmerz an T+1/T+2 und niedrige Energie als Vortagsfaktor.
• MEDIKAMENTEN-TIMING: Vergleiche Medikamenten-Zeitpunkt mit Schmerzbeginn (früh vs. spät vs. ausbleibend).

REGELN:
1. SPRACHE: Deutsch, präzise, ruhig, kurze Sätze. Keine Diagnosen.
2. SUMMARY: 2–3 Sätze. Wichtigste Erkenntnis zuerst, dann Hinweis auf Breite ("zusätzlich mehrere schwächere Hinweise zu …").
3. DEDUPLIZIERUNG: Jeder konkrete Inhalt nur EINMAL über alle Sektionen hinweg.
4. KEINE TRIVIALEN MUSTER: Schmerz→Medikament, Migräne→Ruhe etc.
5. KEIN TAGESBERICHT, keine Datumslisten — qualitative Verdichtung.
6. EVIDENZ: high = ≥3 unabhängige Vorkommen, medium = 2, low = 1 oder mehrdeutig. Bei low IMMER hedgen ("möglicher Hinweis", "schwacher Hinweis", "unsicher").
7. ZAHLEN-DISZIPLIN: NUR Zahlen aus dem Datensatz. Keine erfundenen Prozente/Korrelationen.
8. KEINE HALLUZINATION: Wenn Datenbasis fehlt → klar sagen, NICHT erfinden.
9. MEDIZINISCHE VORSICHT: Bei klar Auffälligem max. einmal "mit Ärztin/Arzt besprechen".

V2.2-KURATIONS-REGELN (verbindlich, auch im Shared-Pfad):
• KEINE DIAGNOSEFORMULIERUNG: Niemals Formulierungen wie "erfüllt Kriterien für …", "Diagnose …", "ist chronisch". Stattdessen: "sollte ärztlich geprüft werden".
• ME/CFS: Wenn fatigueContextFindings / Energie-/PEM-Daten vorliegen, NIE pauschal "ME/CFS nicht dokumentiert" schreiben. Stattdessen konkret benennen, was fehlt (z. B. 24–72 h Belastungsbezug).
• WETTER: Nur vorsichtig formulieren, wenn ausreichend schmerzfreie Vergleichstage vorhanden sind. Sonst klar als unsicher kennzeichnen.
• KEINE VOICE-EVENT-KARTEN als eigene Datenqualität-/Beobachtungs-Karte (Voice-Events sind Eingabesignal, kein Befund).
• MEDIKATION: Wenn Übergebrauch/MOH-Risiko ein Thema ist, nur EINE Karte dazu (Häufigkeit ODER Interaktion), nicht beides.
• ZEIT/WETTER: Pro Zeitmuster bzw. Wetterzusammenhang nur die stärkste Evidenz, keine Doppelkarten.
${thinDataWarning}${privacyNote}
DATENSATZ: ${meta.totalDays} Tage, ${meta.daysWithPain} Schmerztage, ${meta.painEntryCount} Einträge, ${meta.medicationIntakeCount} Medikamenteneinnahmen.

Verwende submit_voice_analysis für die strukturierte Antwort. Liefere insgesamt MINDESTENS 8 sinnvolle Einträge über possiblePatterns + Kontextfindings hinweg, sofern Daten dies hergeben.`;
}

export function buildUnavailableResult(
  reason: string,
  meta: AnalysisMeta,
  fromDate: string,
  toDate: string,
): Record<string, unknown> {
  return {
    summary: `Die Analyse konnte nicht durchgeführt werden: ${reason}`,
    possiblePatterns: [],
    painContextFindings: [],
    fatigueContextFindings: [],
    medicationContextFindings: [],
    recurringSequences: [],
    openQuestions: [],
    confidenceNotes: [reason],
    scope: {
      fromDate, toDate,
      totalDays: meta.totalDays,
      daysAnalyzed: 0,
      voiceEventCount: meta.voiceEventCount,
      painEntryCount: meta.painEntryCount,
      medicationIntakeCount: meta.medicationIntakeCount,
    },
    meta: {
      model: 'none',
      analyzedAt: new Date().toISOString(),
      promptTokenEstimate: 0,
      analysisVersion: '1.1.0',
      error: true,
      errorReason: reason,
    },
  };
}

export function extractAnalysisFromLLMResponse(llmData: Record<string, unknown>): Record<string, unknown> | null {
  const toolCall = (llmData as any)?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      if (parsed && typeof parsed === 'object' && typeof parsed.summary === 'string') return parsed;
    } catch { /* noop */ }
  }
  const content = (llmData as any)?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && typeof parsed.summary === 'string') return parsed;
    } catch { /* noop */ }
  }
  return null;
}

export function validateExtractedResult(result: Record<string, unknown>): boolean {
  if (typeof result.summary !== 'string' || result.summary.length < 5) return false;
  const requiredArrays = ['possiblePatterns', 'painContextFindings', 'fatigueContextFindings',
    'medicationContextFindings', 'openQuestions', 'confidenceNotes'];
  for (const key of requiredArrays) {
    if (!Array.isArray(result[key])) return false;
  }
  return true;
}

export interface RunLLMOptions {
  serializedContext: string;
  meta: AnalysisMeta;
  fromDate: string;
  toDate: string;
  apiKey: string;
  /** Defaults to true (App). Doctor-Share MUST pass false. */
  includesPrivateNotes?: boolean;
}

export type RunLLMResult =
  | { ok: true; body: Record<string, unknown>; status: 200 }
  | { ok: false; body: Record<string, unknown>; status: number };


/**
 * Run the full LLM call → extract → validate pipeline.
 * Returns a structured result ready to be returned by an edge function
 * (status code already chosen, body already json-serializable).
 */
export async function runAnalysisLLM(opts: RunLLMOptions): Promise<RunLLMResult> {
  const { serializedContext, meta, fromDate, toDate, apiKey, includesPrivateNotes } = opts;
  const tokenEstimate = Math.ceil(serializedContext.length / 4);

  if ((meta.voiceEventCount + meta.painEntryCount) < MIN_VOICE_EVENTS_OR_ENTRIES) {
    return {
      ok: false,
      status: 200,
      body: buildUnavailableResult(
        'Zu wenig Daten für eine sinnvolle Analyse. Bitte mindestens einige Tage dokumentieren.',
        meta, fromDate, toDate,
      ),
    };
  }
  if (serializedContext.length > MAX_CONTEXT_CHARS) {
    return {
      ok: false,
      status: 413,
      body: { error: 'Analysezeitraum zu groß. Bitte einen kürzeren Zeitraum wählen.' },
    };
  }

  const systemPrompt = buildSystemPrompt(meta, { includesPrivateNotes });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  let llmResponse: Response;
  try {
    llmResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analysiere die folgenden Verlaufsdaten aus dem Migräne-Tagebuch (${meta.totalDays} Tage, ${fromDate.slice(0, 10)} bis ${toDate.slice(0, 10)}).

ZENTRALE FRAGE: Welche Faktoren könnten mit Migräne/Kopfschmerz zusammenhängen?

VERLAUFSDATEN:

${serializedContext}` },
        ],
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'function', function: { name: 'submit_voice_analysis' } },
      }),
      signal: controller.signal,
    });
  } catch (fetchError) {
    clearTimeout(timeoutId);
    const isTimeout = fetchError instanceof DOMException && fetchError.name === 'AbortError';
    if (isTimeout) {
      return {
        ok: false, status: 504,
        body: buildUnavailableResult(
          'Die Analyse hat zu lange gedauert. Bitte einen kürzeren Zeitraum wählen.',
          meta, fromDate, toDate,
        ),
      };
    }
    throw fetchError;
  }
  clearTimeout(timeoutId);

  if (!llmResponse.ok) {
    const status = llmResponse.status;
    if (status === 429) return { ok: false, status: 429, body: { error: 'Rate Limit erreicht. Bitte später erneut versuchen.', code: 'RATE_LIMIT_EXCEEDED' } };
    if (status === 402) return { ok: false, status: 402, body: { error: 'Guthaben aufgebraucht.', code: 'INSUFFICIENT_CREDITS' } };
    if (status >= 500) {
      return {
        ok: false, status: 502,
        body: buildUnavailableResult('Der KI-Dienst ist vorübergehend nicht verfügbar.', meta, fromDate, toDate),
      };
    }
    return { ok: false, status, body: { error: `LLM-Fehler ${status}` } };
  }

  let llmData: Record<string, unknown>;
  try { llmData = await llmResponse.json(); }
  catch {
    return { ok: false, status: 200, body: buildUnavailableResult('Die KI-Antwort konnte nicht verarbeitet werden.', meta, fromDate, toDate) };
  }

  const analysisResult = extractAnalysisFromLLMResponse(llmData);
  if (!analysisResult || !validateExtractedResult(analysisResult)) {
    return { ok: false, status: 200, body: buildUnavailableResult('Die KI hat keine vollständige strukturierte Analyse zurückgegeben.', meta, fromDate, toDate) };
  }

  const result = {
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
      model: 'google/gemini-2.5-flash',
      analyzedAt: new Date().toISOString(),
      promptTokenEstimate: tokenEstimate,
      analysisVersion: '1.1.0',
    },
  };
  return { ok: true, status: 200, body: result };
}
