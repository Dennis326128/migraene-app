import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
  return `Du bist ein medizinischer Datenanalyst für ein Migräne- und ME/CFS-Tagebuch.
Du analysierst Verlaufsdaten aus Sprachnotizen, strukturierten Einträgen und Medikamentenprotokollen.

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

3. ZEITLICHE ANALYSE
   - Beachte zeitliche Reihenfolge innerhalb von Tagen
   - Beachte Phasenübergänge (z.B. Belastung → Erschöpfung → Ruhe)
   - Prüfe auf wiederkehrende Sequenzen über mehrere Tage
   - Unterscheide zwischen zeitlicher Nähe und möglicher Kausalität

4. ME/CFS UND BELASTUNGSINTOLERANZ
   - Erkenne PEM-verdächtige Muster (Aktivität → verzögerte Erschöpfung)
   - Beachte: Duschen, Einkaufen, Termine, kurze Wege können ME/CFS-relevante Belastungen sein
   - Reizüberflutung (Licht, Lärm, Menschenmengen) ist ein eigenständiges Signal
   - ME/CFS ist eine eigenständige Analysedimension, nicht nur ein Migräne-Begleitsymptom

5. UNSICHERHEIT AKTIV KOMMUNIZIEREN
   - Bei weniger als 5 Beobachtungen: evidenceStrength maximal "low"
   - Bei weniger als 3 Beobachtungen: explizit als "einzelne Beobachtung" kennzeichnen
   - Zufallsmuster bei kleinen Datenmengen benennen
   - Fehlende Daten (undokumentierte Tage/Zeiten) als Einschränkung nennen
   - Zeitliche Unschärfe ("vorhin", "später") als Unsicherheitsfaktor benennen

6. KORRELATION ≠ KAUSALITÄT
   - Zwei aufeinanderfolgende Ereignisse bedeuten nicht automatisch einen kausalen Zusammenhang
   - Formuliere: "tritt häufig in zeitlicher Nähe auf" statt "führt zu"

7. DATENSCHUTZ
   - Nenne keine persönlichen Daten oder Namen
   - Verweise auf Einträge nur über Datum und ungefähre Uhrzeit

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
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentifizierung fehlgeschlagen' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check AI enabled
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ai_enabled, ai_unlimited')
      .eq('user_id', user.id)
      .single();

    if (profile && !profile.ai_enabled) {
      return new Response(JSON.stringify({ error: 'AI-Analyse ist deaktiviert' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Ungültige Anfrage', details: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { serializedContext, meta, fromDate, toDate } = parsed.data;

    // Call LLM
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY nicht konfiguriert');
    }

    const systemPrompt = buildSystemPrompt(meta);

    const llmResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `Analysiere die folgenden Verlaufsdaten aus dem Patiententagebuch (${meta.totalDays} Tage, ${fromDate.slice(0, 10)} bis ${toDate.slice(0, 10)}).

Bitte identifiziere:
1. Mögliche wiederkehrende Muster (Trigger-Kandidaten, zeitliche Sequenzen)
2. Auffällige Kontexte vor Schmerzereignissen
3. ME/CFS-/Erschöpfungsmuster (PEM-verdächtige Sequenzen, Belastungsfolgen)
4. Kontexte rund um Medikamenteneinnahmen
5. Offene Fragen und Datenlücken

VERLAUFSDATEN:

${serializedContext}`
          },
        ],
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'function', function: { name: 'submit_voice_analysis' } },
      }),
    });

    if (!llmResponse.ok) {
      const status = llmResponse.status;
      const errText = await llmResponse.text();
      console.error(`LLM error ${status}:`, errText);

      if (status === 429) {
        return new Response(JSON.stringify({ error: 'Rate Limit erreicht. Bitte später erneut versuchen.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: 'Guthaben aufgebraucht. Bitte Credits hinzufügen.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`LLM request failed: ${status}`);
    }

    const llmData = await llmResponse.json();

    // Extract tool call result
    const toolCall = llmData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error('No tool call in LLM response:', JSON.stringify(llmData).slice(0, 500));
      throw new Error('LLM returned no structured analysis');
    }

    let analysisResult: Record<string, unknown>;
    try {
      analysisResult = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error('Failed to parse tool call arguments:', toolCall.function.arguments.slice(0, 500));
      throw new Error('LLM returned invalid JSON');
    }

    // Attach meta
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
        promptTokenEstimate: Math.ceil(serializedContext.length / 4),
        analysisVersion: '1.0.0',
      },
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('analyze-voice-patterns error:', error);
    const msg = error instanceof Error ? error.message : 'Unbekannter Fehler';
    const status = msg.includes('429') ? 429 : msg.includes('402') ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
