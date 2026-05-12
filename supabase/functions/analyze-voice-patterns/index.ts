import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { requireAiConsent } from '../_shared/aiConsentGate.ts';
import { checkPatternAnalysisQuota, commitPatternAnalysisUsage, quotaErrorBody } from '../_shared/aiQuotaGate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ============================================================
// === CONSTANTS ===
// ============================================================

/** Max input context chars (~30k tokens for Gemini). Safety margin below 128k context. */
const MAX_CONTEXT_CHARS = 120_000;
/** Warn threshold */
const WARN_CONTEXT_CHARS = 80_000;
/** Minimum data to attempt analysis */
const MIN_VOICE_EVENTS_OR_ENTRIES = 1;
/** LLM call timeout in ms */
const LLM_TIMEOUT_MS = 90_000;

// ============================================================
// === INPUT SCHEMA ===
// ============================================================

const RequestSchema = z.object({
  serializedContext: z.string().min(10),
  meta: z.object({
    totalDays: z.number(),
    voiceEventCount: z.number(),
    painEntryCount: z.number(),
    medicationIntakeCount: z.number(),
    daysWithPain: z.number(),
    daysWithMecfs: z.number(),
  }),
  fromDate: z.string(),
  toDate: z.string(),
});

// ============================================================
// === TOOL SCHEMA FOR STRUCTURED OUTPUT ===
// ============================================================

const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_voice_analysis",
    description: "Submit the structured analysis of the patient's voice diary data. All findings are hypotheses, not diagnoses.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "2–3 Sätze. Wichtigste Erkenntnis zuerst (Medikamentenverhalten hat Vorrang). Kein Meta-Einleitung. Knapp wie ein klinisches Kurzfazit."
        },
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
              title: { type: "string", description: "Short label, e.g. 'Duschen → Erschöpfung'" },
              description: { type: "string", description: "1-3 sentences, cautiously worded" },
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
        openQuestions: {
          type: "array",
          items: { type: "string" },
          description: "What remains unclear or needs more data"
        },
        confidenceNotes: {
          type: "array",
          items: { type: "string" },
          description: "Notes about data gaps, limits, possible biases"
        }
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

// ============================================================
// === SYSTEM PROMPT ===
// ============================================================

function buildSystemPrompt(meta: z.infer<typeof RequestSchema>['meta']): string {
  const thinData = (meta.voiceEventCount + meta.painEntryCount) < 10;
  const thinDataWarning = thinData
    ? `\nACHTUNG: Sehr wenige Daten (${meta.voiceEventCount + meta.painEntryCount} Einträge). evidenceStrength maximal "low". Betone Datenlücken in confidenceNotes.\n`
    : '';

  return `Du bist ein erfahrener Migräne-Analyst. Du fasst mögliche Zusammenhänge ruhig, breit und fachlich zusammen – wie eine sorgfältige medizinische Auswertung, die nichts ohne Hinweis auslässt.

KERNAUFGABE: Migräne-/kopfschmerzrelevante Zusammenhänge identifizieren. Mehrere Perspektiven (Auslöser, Wetter, Zeitmuster, Medikamente, Energie/PEM, Datenqualität) IMMER bearbeiten – auch wenn das Ergebnis pro Sektion „kein klares Muster" lautet.

REGELN:

1. SPRACHE: Deutsch. Ruhig, präzise, hilfreich. Kurze Sätze. Nicht belehrend.

2. KEINE DIAGNOSEN – nur vorsichtige Hypothesen ("möglicherweise", "fällt auf", "könnte zusammenhängen", "Hinweis").

3. PFLICHTSEKTIONEN — JEDE Kategorie MUSS bearbeitet werden. Wenn keine Daten oder kein Signal vorliegt, schreibe einen kurzen, klaren Eintrag wie „Keine Wetterdaten im Zeitraum vorhanden", „Kein Zeitmuster erkennbar", „ME/CFS-/PEM-Daten nicht ausreichend dokumentiert" – NICHT die Sektion stillschweigend leer lassen.

4. AUSGABE-MINDESTMENGEN (zwingend):
   * possiblePatterns: 2–4 Hauptmuster (evidenceStrength medium oder high) + 4–8 zusätzliche schwächere Hinweise (evidenceStrength=low). Insgesamt 6–12 Einträge anstreben. Schwache Hinweise klar als „möglicher Hinweis" / „schwacher Hinweis" formulieren.
   * painContextFindings: 1–4 Beobachtungen zu Lokalisation, Aura, Intensität, Dauer. Bei fehlenden Daten 1 Eintrag „Keine differenzierten Schmerzkontextdaten".
   * fatigueContextFindings: 1–4 Beobachtungen zu Energie, Erschöpfung, PEM, Belastung am Vortag (T-1, T-2), Crash-Mustern. Bei fehlenden Daten 1 Eintrag „ME/CFS-/PEM-Daten nicht ausreichend dokumentiert" (evidenceStrength=low).
   * medicationContextFindings: 1–4 Beobachtungen zu Einnahmezeitpunkt relativ zum Schmerzbeginn, Triptan-Zurückhaltung, Wiederholungseinnahmen, MOH-Risiko (nur bei klarer Datenbasis).
   * recurringSequences: 0–4 nicht-triviale Abfolgen mit echtem Erkenntnisgewinn.
   * openQuestions: 1–3 konkrete, beantwortbare Fragen für die nächste Dokumentationsphase.
   * confidenceNotes: 2–4 Datenqualitätsnotizen (Wetter-Abdeckung, Zeit-/Uhrzeitdaten, Tagesfaktoren-Abdeckung, Sample-Größe). Konkret, nicht generisch.

5. SCHMERZ- UND ME/CFS-FOKUS: Relevanzreihenfolge bei Hauptmustern (medium/high):
   a) Medikamentenverhalten (Übergebrauch, Vermeidung, Triptan-Zurückhaltung, spätes Einnehmen)
   b) Schlaf/Schlafrhythmus
   c) Stress/Überlastung
   d) Wetter/Luftdruck (Δ24h ≤ −3 hPa oder ≥ +3 hPa, Temperatursprünge)
   e) Tageszeit/Wochentag-Häufungen
   f) Reize (Licht, Lärm, Bildschirm)
   g) Belastung → PEM/Crash → Kopfschmerz (Folgetag, T+1/T+2)
   Schwache Hinweise (low) auch zu Helligkeit, Stimmung, Tagesfaktor-Korrelationen, Ernährung, Hydration.

6. SUMMARY (2–3 Sätze): wichtigste Erkenntnis zuerst. Keine Meta-Einleitung. Nicht wiederholen, was darunter ausführlicher steht.

7. WETTER (Pflicht-Sektion in confidenceNotes UND ggf. possiblePatterns):
   Wenn Δp24h ≤ −3 hPa oder ≥ +3 hPa wiederholt mit Schmerztagen zusammenfällt → Hinweis als possiblePatterns mit evidenceStrength low/medium. Sonst expliziter confidenceNote: „Wetterabdeckung X Tage; keine klare Häufung an Druckabfall-Tagen erkennbar" – konkret mit Zahlen, die im Datensatz stehen.

8. ZEITMUSTER (Pflicht): Wenn die Wochentag- oder Tagesphasen-Aggregate eine klare Häufung zeigen (Top-Tag ≥ 30 % oder Top-Phase ≥ 40 % der Einträge mit Uhrzeit) → possiblePatterns. Sonst confidenceNote „Zeitmuster nicht klar erkennbar (n=X mit Uhrzeit)".

9. MEDIKAMENTEN-VERMEIDUNGSVERHALTEN: Wenn Akutmedikamente trotz starker Beschwerden spät/nicht eingesetzt werden → starkes Pattern. Sachlich, nicht belehrend.

10. VERBOTENE TRIVIALE MUSTER (NIEMALS):
    * Schmerz → Medikament/Triptan
    * Kopfschmerz → Ruhe/Schlaf/Bett
    * Müdigkeit → Ruhe
    * Schmerz → Übelkeit (Begleitsymptom)
    * Medikament → Wirkung beobachtet (ohne Kontext)

11. EVIDENZ-STUFEN:
    * "high": ≥3 unabhängige Vorkommen mit klarer zeitlicher Nähe.
    * "medium": 2 Vorkommen oder gemischtes Bild.
    * "low": 1 Vorkommen, lückenhafte Daten, mehrdeutige Zeitbezüge → IMMER für „schwächere Hinweise" verwenden.

12. ZAHLEN-DISZIPLIN: NUR Zahlen, die im Datensatz vorkommen. KEINE erfundenen Prozente. Wenn keine Zahl belegbar → qualitativ formulieren.

13. DEDUPLIZIERUNG: Jeder Inhalt nur einmal. Wenn ein Thema schon als Pattern steht → nicht in painContext/medContext/openQuestions wiederholen. ABER: Pflichtsektionen bleiben gefüllt – nutze andere Aspekte oder eine klare Lücken-Aussage.

14. KEIN TAGESBERICHT. Keine Datumslisten. Beispieldaten sparsam ("z.B. am 10.").

15. MEDIZINISCHE VORSICHT: Keine Diagnose, keine Therapieempfehlung. Ggf. einmaliger Hinweis „mit Ärztin/Arzt besprechen".

16. NUTZE DEN ABSCHNITT „=== Deterministische Vorab-Auswertung ===" aus dem Datensatz: Diese Zahlen sind belegt. Übernimm sie wo passend in possiblePatterns (low evidence) und confidenceNotes.
${thinDataWarning}
DATENSATZ: ${meta.totalDays} Tage, ${meta.daysWithPain} Schmerztage, ${meta.painEntryCount} Einträge, ${meta.medicationIntakeCount} Medikamenteneinnahmen, ME/CFS-Tage: ${meta.daysWithMecfs}.

Verwende submit_voice_analysis. Halte die Mindestmengen ein.`;
}

// ============================================================
// === HELPERS ===
// ============================================================

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Build a controlled error/unavailable result that does NOT pretend
 * to be a real analysis but uses the same structure shape.
 */
function buildUnavailableResult(
  reason: string,
  meta: z.infer<typeof RequestSchema>['meta'],
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
      fromDate,
      toDate,
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
      analysisVersion: '1.0.0',
      error: true,
      errorReason: reason,
    },
  };
}

/**
 * Try to extract a valid analysis result from LLM response.
 * Handles: tool_calls, plain JSON content, partial failures.
 */
function extractAnalysisFromLLMResponse(llmData: Record<string, unknown>): Record<string, unknown> | null {
  // Path 1: tool_calls (expected)
  const toolCall = (llmData as any)?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      if (parsed && typeof parsed === 'object' && typeof parsed.summary === 'string') {
        return parsed;
      }
    } catch {
      console.error('[analyze-voice-patterns] Failed to parse tool_call arguments');
    }
  }

  // Path 2: content as JSON (fallback if LLM ignores tool_choice)
  const content = (llmData as any)?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && typeof parsed.summary === 'string') {
        console.warn('[analyze-voice-patterns] Extracted from content instead of tool_call');
        return parsed;
      }
    } catch {
      // not valid JSON in content
    }
  }

  return null;
}

/**
 * Validate the extracted analysis has all required array fields.
 */
function validateExtractedResult(result: Record<string, unknown>): boolean {
  if (typeof result.summary !== 'string' || result.summary.length < 5) return false;
  const requiredArrays = ['possiblePatterns', 'painContextFindings', 'fatigueContextFindings',
    'medicationContextFindings', 'openQuestions', 'confidenceNotes'];
  for (const key of requiredArrays) {
    if (!Array.isArray(result[key])) return false;
  }
  return true;
}

// ============================================================
// === SERVE ===
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Nicht authentifiziert' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Authentifizierung fehlgeschlagen' }, 401);
    }

    // AI CONSENT GATE (DSGVO Art. 9)
    const consentBlock = await requireAiConsent(supabase, user.id, corsHeaders);
    if (consentBlock) return consentBlock;

    // QUOTA + COOLDOWN GATE (service role)
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const quotaCheck = await checkPatternAnalysisQuota(supabaseAdmin, user.id, { enforceCooldown: true });
    if (!quotaCheck.allowed) {
      console.log(`[analyze-voice-patterns] blocked reason=${quotaCheck.blockedReason} user=${user.id.slice(0, 8)}…`);
      return jsonResponse(quotaErrorBody(quotaCheck), quotaCheck.status ?? 429);
    }

    // Parse request
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400);
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: 'Ungültige Anfrage', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { serializedContext, meta, fromDate, toDate } = parsed.data;

    // === DATA SUFFICIENCY CHECK ===
    if ((meta.voiceEventCount + meta.painEntryCount) < MIN_VOICE_EVENTS_OR_ENTRIES) {
      console.warn(`[analyze-voice-patterns] Insufficient data: ${meta.voiceEventCount} voice, ${meta.painEntryCount} pain`);
      return jsonResponse({
        error: 'Zu wenig Daten für eine sinnvolle Analyse. Bitte mindestens einige Tage dokumentieren.',
        code: 'INSUFFICIENT_DATA',
        errorCode: 'INSUFFICIENT_DATA',
      }, 422);
    }

    // === CONTEXT SIZE CHECK ===
    const contextChars = serializedContext.length;
    const tokenEstimate = Math.ceil(contextChars / 4);

    if (contextChars > MAX_CONTEXT_CHARS) {
      console.error(`[analyze-voice-patterns] Context too large: ${contextChars} chars (~${tokenEstimate} tokens)`);
      return jsonResponse({
        error: 'Analysezeitraum zu groß. Bitte einen kürzeren Zeitraum wählen.',
        code: 'CONTEXT_TOO_LARGE',
        errorCode: 'CONTEXT_TOO_LARGE',
        contextChars,
        tokenEstimate,
        maxChars: MAX_CONTEXT_CHARS,
      }, 413);
    }

    if (contextChars > WARN_CONTEXT_CHARS) {
      console.warn(`[analyze-voice-patterns] Large context: ${contextChars} chars (~${tokenEstimate} tokens)`);
    }

    // === LLM CALL ===
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY nicht konfiguriert');
    }

    const systemPrompt = buildSystemPrompt(meta);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    let llmResponse: Response;
    try {
      llmResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Analysiere die folgenden Verlaufsdaten aus dem Migräne-Tagebuch (${meta.totalDays} Tage, ${fromDate.slice(0, 10)} bis ${toDate.slice(0, 10)}).

ZENTRALE FRAGE: Welche Faktoren oder Konstellationen könnten mit Migräne/Kopfschmerz zusammenhängen?

Bitte identifiziere:
1. Die wichtigsten möglichen Einflussfaktoren für Kopfschmerz/Migräne (Reize, Belastung, Schlaf, Essen/Trinken, Stress, Aktivität)
2. Wiederkehrende Muster und Abfolgen, die vor Schmerzphasen auffallen
3. Kontexte rund um Medikamenteneinnahmen
4. Was noch unklar bleibt und worauf weiter geachtet werden könnte

WICHTIG: 
- Priorisiere nach Relevanz für Migräne, nicht nach Reihenfolge im Datensatz
- Keine Tageschroniken oder Datumslisten
- Jeder Punkt nur EINMAL – keine Wiederholungen zwischen Abschnitten
- Lieber wenige klare Beobachtungen als viele vage

VERLAUFSDATEN:

${serializedContext}`
            },
          ],
          tools: [ANALYSIS_TOOL],
          tool_choice: { type: 'function', function: { name: 'submit_voice_analysis' } },
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const isTimeout = fetchError instanceof DOMException && fetchError.name === 'AbortError';
      console.error(`[analyze-voice-patterns] LLM fetch ${isTimeout ? 'timeout' : 'error'}:`, fetchError);

      if (isTimeout) {
        return jsonResponse({
          error: 'Die Analyse hat zu lange gedauert. Bitte einen kürzeren Zeitraum wählen oder es später erneut versuchen.',
          code: 'TIMEOUT',
          errorCode: 'TIMEOUT',
        }, 504);
      }
      return jsonResponse({
        error: 'Der KI-Dienst ist vorübergehend nicht erreichbar. Bitte später erneut versuchen.',
        code: 'LLM_UNAVAILABLE',
        errorCode: 'LLM_UNAVAILABLE',
      }, 502);
    }
    clearTimeout(timeoutId);

    // === HANDLE LLM HTTP ERRORS (NO quota commit on any of these) ===
    if (!llmResponse.ok) {
      const status = llmResponse.status;
      const errText = await llmResponse.text();
      console.error(`[analyze-voice-patterns] LLM error ${status}:`, errText.slice(0, 500));

      if (status === 429) {
        return jsonResponse({ error: 'Rate Limit erreicht. Bitte später erneut versuchen.', code: 'LLM_UNAVAILABLE', errorCode: 'LLM_UNAVAILABLE' }, 429);
      }
      if (status === 402) {
        return jsonResponse({ error: 'Guthaben aufgebraucht.', code: 'LLM_UNAVAILABLE', errorCode: 'LLM_UNAVAILABLE' }, 402);
      }
      if (status >= 500) {
        return jsonResponse({
          error: 'Der KI-Dienst ist vorübergehend nicht verfügbar. Bitte später erneut versuchen.',
          code: 'LLM_UNAVAILABLE',
          errorCode: 'LLM_UNAVAILABLE',
        }, 502);
      }
      return jsonResponse({ error: `LLM request failed (${status})`, code: 'LLM_UNAVAILABLE', errorCode: 'LLM_UNAVAILABLE' }, 502);
    }

    // === PARSE LLM RESPONSE ===
    let llmData: Record<string, unknown>;
    try {
      llmData = await llmResponse.json();
    } catch {
      console.error('[analyze-voice-patterns] Failed to parse LLM response as JSON');
      return jsonResponse({ error: 'Die KI-Antwort konnte nicht verarbeitet werden.', code: 'LLM_UNAVAILABLE', errorCode: 'LLM_UNAVAILABLE' }, 502);
    }

    // === EXTRACT STRUCTURED ANALYSIS ===
    const analysisResult = extractAnalysisFromLLMResponse(llmData);
    if (!analysisResult) {
      console.error('[analyze-voice-patterns] No valid analysis in LLM response:', JSON.stringify(llmData).slice(0, 500));
      return jsonResponse({ error: 'Die KI hat keine strukturierte Analyse zurückgegeben. Bitte erneut versuchen.', code: 'LLM_UNAVAILABLE', errorCode: 'LLM_UNAVAILABLE' }, 502);
    }

    // === VALIDATE EXTRACTED RESULT ===
    if (!validateExtractedResult(analysisResult)) {
      console.error('[analyze-voice-patterns] Extracted result failed validation:', JSON.stringify(analysisResult).slice(0, 500));
      return jsonResponse({ error: 'Die KI-Analyse war unvollständig. Bitte erneut versuchen.', code: 'LLM_UNAVAILABLE', errorCode: 'LLM_UNAVAILABLE' }, 502);
    }

    // === ATTACH META & SCOPE ===
    const result = {
      ...analysisResult,
      scope: {
        fromDate,
        toDate,
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
        analysisVersion: '2.1.0',
      },
      schema_version: '2.1',
      analysis_version: '2.1.0',
    };

    // === COMMIT QUOTA (only on success + validation OK) ===
    await commitPatternAnalysisUsage(supabaseAdmin, user.id, quotaCheck.snapshot);

    const len = (k: string) => Array.isArray((analysisResult as any)[k]) ? (analysisResult as any)[k].length : 0;
    console.log(`[analyze-voice-patterns] Success: ${meta.totalDays}d, ~${tokenEstimate}tok, counts: pp=${len('possiblePatterns')} pcf=${len('painContextFindings')} fcf=${len('fatigueContextFindings')} mcf=${len('medicationContextFindings')} rs=${len('recurringSequences')} oq=${len('openQuestions')} cn=${len('confidenceNotes')}, quota=${quotaCheck.snapshot.currentUsage + 1}/${quotaCheck.quota.limit}`);

    return jsonResponse(result, 200);

  } catch (error) {
    console.error('[analyze-voice-patterns] Unhandled error:', error);
    const msg = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return jsonResponse({ error: msg }, 500);
  }
});
