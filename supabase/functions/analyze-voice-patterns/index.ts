import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

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
          description: "2-5 sentence overall summary of observations. Cautiously worded."
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
    ? `\nACHTUNG: Dieser Datensatz ist SEHR KLEIN (${meta.voiceEventCount} Spracheinträge, ${meta.painEntryCount} Einträge). 
Sei besonders vorsichtig mit Musteraussagen. Setze evidenceStrength maximal auf "low". 
Betone in confidenceNotes explizit die geringe Datenmenge.
Bei weniger als 3 Beobachtungen eines Musters formuliere: "Einzelbeobachtung – kein belastbares Muster ableitbar."\n`
    : '';

  return `Du bist ein medizinischer Datenanalyst für ein Migräne- und ME/CFS-Tagebuch.
Du analysierst Verlaufsdaten aus Sprachnotizen, strukturierten Einträgen und Medikamentenprotokollen.

DEIN ZIEL:
Dem Nutzer helfen zu verstehen, welche Faktoren oder Konstellationen mit seiner Migräne zusammenhängen KÖNNTEN.
Fokussiere auf praktisch nützliche Beobachtungen, nicht auf abstrakte Datenanalyse.

WICHTIGE REGELN:

1. KEINE DIAGNOSEN STELLEN
   - Du identifizierst mögliche Muster und Zusammenhänge
   - Formuliere IMMER als Beobachtung/Hypothese, NIEMALS als medizinische Wahrheit
   - Verwende: "möglicherweise", "es fällt auf", "ein möglicher Zusammenhang", "könnte darauf hindeuten"
   - NIEMALS: "verursacht", "ist der Trigger", "beweist", "zeigt eindeutig"

2. DATENQUELLEN VERSTEHEN
   - Rohtexte aus Sprachnotizen sind die primäre Quelle – sie enthalten die ungefilterte Patientenperspektive
   - Strukturierte Felder (NRS, Medikamente, Orte) sind Hilfsschichten – nützlich, aber nicht allein maßgeblich
   - "[bestätigt]" und "[bearbeitet]" markieren vom Nutzer überprüfte Daten – diese sind vertrauenswürdiger
   - "→ Eintrag #X" zeigt Verlinkung zu einem strukturierten Eintrag

3. INHALTLICHE QUALITÄT DER AUSGABE
   - Die summary soll die 2-4 wichtigsten Erkenntnisse priorisieren, NICHT generisch "es wurden X Tage analysiert" sagen
   - Jedes Pattern muss einen EIGENSTÄNDIGEN Informationsgehalt haben – keine Wiederholung desselben Inhalts in leicht anderer Form
   - Wenn ein Muster bereits als possiblePattern beschrieben ist, NICHT nochmal in painContextFindings oder fatigueContextFindings wiederholen
   - Sortiere possiblePatterns nach Relevanz: stärkere Evidenz und häufigere Beobachtungen zuerst
   - Maximal 5 possiblePatterns – lieber wenige starke als viele schwache
   - Maximal 3 painContextFindings – nur wenn sie Mehrwert ÜBER die Patterns hinaus bieten
   - Maximal 2 fatigueContextFindings – nur wenn migränerelevant oder evidenzstark
   - openQuestions und confidenceNotes NICHT redundant: jeder Punkt nur einmal, hilfreich formuliert

3b. MIGRÄNE-PRIORISIERUNG
   - Die für Migräne relevantesten Faktoren sollen in possiblePatterns OBEN stehen:
     * Schlaf / Schlafmangel / Schlafrhythmus
     * Stress / Überlastung / Anspannung
     * Reizfaktoren (Licht, Lärm, Menschenmengen, Bildschirmzeit)
     * Medikamente in zeitlicher Beziehung zu Schmerz (Wirkung, Übergebrauch)
     * Wiederkehrende Vorboten oder Abfolgen vor Schmerzphasen
     * Ernährungs-/Trinkverhalten nur bei auffälligem Muster
   - Wetterzusammenhänge nur dann prominent, wenn belastbare Häufigkeit erkennbar (>50% Koinzidenz)
   - Allgemeine Erschöpfungs-/Stimmungsmuster nur wenn Migränebezug erkennbar
   - Wenn zu viele mittelmäßige Muster erkannt werden: nur die stärksten 3-5 ausgeben

4. KEIN TAGESBERICHT
   - KEINE Aufzählung einzelner Tage oder Datumslisten
   - KEINE chronologische Nacherzählung
   - Beispiele nur SEHR sparsam zur Veranschaulichung, z.B. "z.B. am 10. Apr." – nie als Hauptinhalt
   - Fokussiere auf MUSTER und HÄUFIGKEITEN, nicht auf Einzelereignisse

5. ZEITLICHE ANALYSE
   - Beachte zeitliche Reihenfolge innerhalb von Tagen
   - Beachte Phasenübergänge (z.B. Belastung → Erschöpfung → Ruhe)
   - Prüfe auf wiederkehrende Sequenzen über mehrere Tage
   - Unterscheide zwischen zeitlicher Nähe und möglicher Kausalität

6. ME/CFS UND BELASTUNGSINTOLERANZ
   - Erkenne PEM-verdächtige Muster (Aktivität → verzögerte Erschöpfung)
   - In dieser Analyse: ME/CFS-Muster nur dann prominent einbeziehen, wenn sie
     - in zeitlicher Nähe zu Kopfschmerz/Migräne auftreten
     - als Belastungskontext für Migräne relevant wirken
   - Reine Erschöpfungsmuster ohne Migränebezug eher kurz halten

7. UNSICHERHEIT AKTIV UND HILFREICH KOMMUNIZIEREN
   - Bei weniger als 5 Beobachtungen: evidenceStrength maximal "low"
   - Bei weniger als 3 Beobachtungen: explizit als "einzelne Beobachtung" kennzeichnen
   - openQuestions sollen dem Nutzer sagen, worauf er achten könnte – nicht nur "zu wenig Daten" wiederholen
   - confidenceNotes kurz und sachlich, nicht übermäßig defensiv

8. KORRELATION ≠ KAUSALITÄT
   - Zwei aufeinanderfolgende Ereignisse bedeuten nicht automatisch einen kausalen Zusammenhang
   - Formuliere: "tritt häufig in zeitlicher Nähe auf" statt "führt zu"

9. DATENSCHUTZ
   - Nenne keine persönlichen Daten oder Namen
   - Verweise auf Einträge nur über Datum und ungefähre Uhrzeit
${thinDataWarning}
KONTEXT ZUM DATENSATZ:
- Analysezeitraum: ${meta.totalDays} Tage
- Spracheinträge: ${meta.voiceEventCount}
- Strukturierte Einträge: ${meta.painEntryCount}
- Medikamenteneinnahmen: ${meta.medicationIntakeCount}
- Tage mit Schmerz: ${meta.daysWithPain}
- Tage mit ME/CFS-Signalen: ${meta.daysWithMecfs}

Antworte auf Deutsch. Verwende die bereitgestellte Funktion submit_voice_analysis für deine strukturierte Antwort.`;
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

    // Check AI enabled
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ai_enabled, ai_unlimited')
      .eq('user_id', user.id)
      .single();

    if (profile && !profile.ai_enabled) {
      return jsonResponse({ error: 'AI-Analyse ist deaktiviert' }, 403);
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
      const result = buildUnavailableResult(
        'Zu wenig Daten für eine sinnvolle Analyse. Bitte mindestens einige Tage dokumentieren.',
        meta, fromDate, toDate,
      );
      return jsonResponse(result, 200);
    }

    // === CONTEXT SIZE CHECK ===
    const contextChars = serializedContext.length;
    const tokenEstimate = Math.ceil(contextChars / 4);

    if (contextChars > MAX_CONTEXT_CHARS) {
      console.error(`[analyze-voice-patterns] Context too large: ${contextChars} chars (~${tokenEstimate} tokens)`);
      return jsonResponse({
        error: 'Analysezeitraum zu groß. Bitte einen kürzeren Zeitraum wählen.',
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
        const result = buildUnavailableResult(
          'Die Analyse hat zu lange gedauert. Bitte einen kürzeren Zeitraum wählen oder es später erneut versuchen.',
          meta, fromDate, toDate,
        );
        return jsonResponse(result, 504);
      }
      throw fetchError;
    }
    clearTimeout(timeoutId);

    // === HANDLE LLM HTTP ERRORS ===
    if (!llmResponse.ok) {
      const status = llmResponse.status;
      const errText = await llmResponse.text();
      console.error(`[analyze-voice-patterns] LLM error ${status}:`, errText.slice(0, 500));

      if (status === 429) {
        return jsonResponse({ error: 'Rate Limit erreicht. Bitte später erneut versuchen.' }, 429);
      }
      if (status === 402) {
        return jsonResponse({ error: 'Guthaben aufgebraucht. Bitte Credits hinzufügen.' }, 402);
      }

      // For 5xx: return unavailable result instead of crashing
      if (status >= 500) {
        const result = buildUnavailableResult(
          'Der KI-Dienst ist vorübergehend nicht verfügbar. Bitte später erneut versuchen.',
          meta, fromDate, toDate,
        );
        return jsonResponse(result, 502);
      }

      throw new Error(`LLM request failed: ${status}`);
    }

    // === PARSE LLM RESPONSE ===
    let llmData: Record<string, unknown>;
    try {
      llmData = await llmResponse.json();
    } catch {
      console.error('[analyze-voice-patterns] Failed to parse LLM response as JSON');
      const result = buildUnavailableResult(
        'Die KI-Antwort konnte nicht verarbeitet werden.',
        meta, fromDate, toDate,
      );
      return jsonResponse(result, 200);
    }

    // === EXTRACT STRUCTURED ANALYSIS ===
    const analysisResult = extractAnalysisFromLLMResponse(llmData);

    if (!analysisResult) {
      console.error('[analyze-voice-patterns] No valid analysis in LLM response:', JSON.stringify(llmData).slice(0, 500));
      const result = buildUnavailableResult(
        'Die KI hat keine strukturierte Analyse zurückgegeben. Bitte erneut versuchen.',
        meta, fromDate, toDate,
      );
      return jsonResponse(result, 200);
    }

    // === VALIDATE EXTRACTED RESULT ===
    if (!validateExtractedResult(analysisResult)) {
      console.error('[analyze-voice-patterns] Extracted result failed validation:', JSON.stringify(analysisResult).slice(0, 500));
      const result = buildUnavailableResult(
        'Die KI-Analyse war unvollständig. Bitte erneut versuchen.',
        meta, fromDate, toDate,
      );
      return jsonResponse(result, 200);
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
        analysisVersion: '1.0.0',
      },
    };

    console.log(`[analyze-voice-patterns] Success: ${meta.totalDays}d, ~${tokenEstimate}tok, ${(analysisResult.possiblePatterns as unknown[])?.length ?? 0} patterns`);

    return jsonResponse(result, 200);

  } catch (error) {
    console.error('[analyze-voice-patterns] Unhandled error:', error);
    const msg = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return jsonResponse({ error: msg }, 500);
  }
});
