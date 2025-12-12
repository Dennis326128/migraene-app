import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_QUOTA_MONTHLY_REQUESTS = 50;

interface DraftField<T> {
  value: T | null;
  confidence: "high" | "medium" | "low";
  source: string | null;
}

interface MedicationItem {
  med_name: string;
  medication_id: string | null;
  taken_time: DraftField<string>;
  dose_text: DraftField<string>;
  effect_rating: DraftField<string>;
  effect_score: DraftField<number>;
  side_effects: DraftField<string[]>;
  notes: DraftField<string>;
}

interface SymptomItem {
  symptom_id: string | null;
  symptom_name: string;
  confidence: "high" | "medium" | "low";
  source: string | null;
}

interface TriggerItem {
  value: string;
  confidence: "high" | "medium" | "low";
  source: string | null;
}

interface PainEntry {
  selected_date: DraftField<string>;
  selected_time: DraftField<string>;
  pain_level: DraftField<string>;
  pain_location: DraftField<string>;
  aura_type: DraftField<string>;
  notes_append: DraftField<string>;
  medications: {
    names: string[];
    ids: (string | null)[];
    items: MedicationItem[];
  };
  symptoms: SymptomItem[];
  triggers: TriggerItem[];
}

interface DraftResult {
  originalText: string;
  painEntry: PainEntry;
  warnings: Array<{ path: string; type: string; message: string }>;
  follow_up: Array<{ id: string; question: string; path: string }>;
  engineUsed: "llm";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, timezone = "Europe/Berlin" } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ai-draft-from-text] User ${user.id} - Processing: "${text.substring(0, 100)}..."`);

    // Check quota
    const currentMonth = new Date().toISOString().substring(0, 7) + "-01";
    const { data: usageData } = await supabase
      .from("user_ai_usage")
      .select("request_count")
      .eq("user_id", user.id)
      .eq("feature", "llm_draft")
      .gte("period_start", currentMonth)
      .maybeSingle();

    const currentUsage = usageData?.request_count || 0;
    if (currentUsage >= AI_QUOTA_MONTHLY_REQUESTS) {
      console.log(`[ai-draft-from-text] Quota exceeded for user ${user.id}: ${currentUsage}/${AI_QUOTA_MONTHLY_REQUESTS}`);
      return new Response(JSON.stringify({ 
        error: "quota_exceeded", 
        message: "Monatliches KI-Limit erreicht",
        usage: currentUsage,
        limit: AI_QUOTA_MONTHLY_REQUESTS
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load user medications
    const { data: userMedications } = await supabase
      .from("user_medications")
      .select("id, name, wirkstoff, staerke, darreichungsform, einheit, medication_status, intolerance_flag")
      .eq("user_id", user.id)
      .eq("is_active", true);

    // Load symptom catalog
    const { data: symptomCatalog } = await supabase
      .from("symptom_catalog")
      .select("id, name")
      .eq("is_active", true);

    // Prepare medication list for LLM
    const medicationList = (userMedications || []).map(m => ({
      id: m.id,
      name: m.name,
      wirkstoff: m.wirkstoff,
      staerke: m.staerke
    }));

    const symptomList = (symptomCatalog || []).map(s => ({
      id: s.id,
      name: s.name
    }));

    // Calculate today/yesterday dates
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[ai-draft-from-text] LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Du bist ein Migräne-Tagebuch-Assistent. Extrahiere strukturierte Daten aus deutscher Spracheingabe.

WICHTIG:
- "gestern" = ${yesterdayStr}
- "heute" = ${todayStr}
- Zeitzone: ${timezone}

VERFÜGBARE MEDIKAMENTE DES NUTZERS:
${JSON.stringify(medicationList, null, 2)}

VERFÜGBARE SYMPTOME:
${JSON.stringify(symptomList, null, 2)}

REGELN:
1. Datum: Löse "gestern/heute/vorgestern" auf konkretes YYYY-MM-DD auf.
2. Uhrzeit: Format HH:mm (24h). "morgens"→08:00, "mittags"→12:00, "abends"→18:00, "nachts"→22:00.
3. Schmerzstärke: 0-10 oder Text (keine/leicht/mittel/stark/sehr_stark).
4. Medikamente: Matche gegen die Nutzerliste. Bei Treffer: medication_id setzen. Sonst null.
5. Wirkung: effect_rating (none/poor/moderate/good/very_good), effect_score (0-10).
   - "gar nicht geholfen" → none/0
   - "kaum geholfen" → poor/2
   - "etwas geholfen" → moderate/5
   - "gut geholfen" → good/7
   - "sehr gut geholfen" → very_good/9
6. Symptome: Matche gegen Katalog. symptom_id bei Treffer, sonst null.
7. Trigger: Extrahiere als freie Texte (Stress, Wetter, Schlafmangel, etc.).
8. Confidence: "high" wenn explizit genannt, "medium" bei Ableitung, "low" bei Unsicherheit.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analysiere diesen Text und extrahiere alle relevanten Informationen:\n\n"${text}"` }
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_migraine_draft",
            description: "Erstellt einen strukturierten Entwurf aus der Spracheingabe",
            parameters: {
              type: "object",
              properties: {
                selected_date: {
                  type: "object",
                  properties: {
                    value: { type: "string", description: "YYYY-MM-DD format" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    source: { type: "string" }
                  },
                  required: ["value", "confidence"]
                },
                selected_time: {
                  type: "object",
                  properties: {
                    value: { type: "string", description: "HH:mm format" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    source: { type: "string" }
                  },
                  required: ["confidence"]
                },
                pain_level: {
                  type: "object",
                  properties: {
                    value: { type: "string", description: "0-10 or text" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    source: { type: "string" }
                  },
                  required: ["confidence"]
                },
                pain_location: {
                  type: "object",
                  properties: {
                    value: { type: "string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    source: { type: "string" }
                  },
                  required: ["confidence"]
                },
                aura_type: {
                  type: "object",
                  properties: {
                    value: { type: "string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    source: { type: "string" }
                  },
                  required: ["confidence"]
                },
                notes_append: {
                  type: "object",
                  properties: {
                    value: { type: "string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    source: { type: "string" }
                  },
                  required: ["confidence"]
                },
                medications: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      med_name: { type: "string" },
                      medication_id: { type: "string", description: "UUID from user medications or null" },
                      taken_time: {
                        type: "object",
                        properties: {
                          value: { type: "string" },
                          confidence: { type: "string", enum: ["high", "medium", "low"] },
                          source: { type: "string" }
                        }
                      },
                      dose_text: {
                        type: "object",
                        properties: {
                          value: { type: "string" },
                          confidence: { type: "string", enum: ["high", "medium", "low"] },
                          source: { type: "string" }
                        }
                      },
                      effect_rating: {
                        type: "object",
                        properties: {
                          value: { type: "string", enum: ["none", "poor", "moderate", "good", "very_good"] },
                          confidence: { type: "string", enum: ["high", "medium", "low"] },
                          source: { type: "string" }
                        }
                      },
                      effect_score: {
                        type: "object",
                        properties: {
                          value: { type: "number", minimum: 0, maximum: 10 },
                          confidence: { type: "string", enum: ["high", "medium", "low"] },
                          source: { type: "string" }
                        }
                      },
                      side_effects: {
                        type: "object",
                        properties: {
                          value: { type: "array", items: { type: "string" } },
                          confidence: { type: "string", enum: ["high", "medium", "low"] },
                          source: { type: "string" }
                        }
                      },
                      notes: {
                        type: "object",
                        properties: {
                          value: { type: "string" },
                          confidence: { type: "string", enum: ["high", "medium", "low"] },
                          source: { type: "string" }
                        }
                      }
                    },
                    required: ["med_name"]
                  }
                },
                symptoms: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      symptom_id: { type: "string" },
                      symptom_name: { type: "string" },
                      confidence: { type: "string", enum: ["high", "medium", "low"] },
                      source: { type: "string" }
                    },
                    required: ["symptom_name", "confidence"]
                  }
                },
                triggers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      value: { type: "string" },
                      confidence: { type: "string", enum: ["high", "medium", "low"] },
                      source: { type: "string" }
                    },
                    required: ["value", "confidence"]
                  }
                },
                warnings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      path: { type: "string" },
                      type: { type: "string", enum: ["missing", "ambiguous", "low_confidence"] },
                      message: { type: "string" }
                    },
                    required: ["path", "type", "message"]
                  }
                }
              },
              required: ["selected_date", "pain_level", "medications", "symptoms", "triggers"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_migraine_draft" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ai-draft-from-text] LLM API error: ${response.status} - ${errorText}`);
      
      if (response.status === 429 || response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "ai_rate_limit",
          message: "KI-Service temporär nicht verfügbar"
        }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const llmResponse = await response.json();
    console.log("[ai-draft-from-text] LLM response received");

    // Extract tool call result
    const toolCall = llmResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "create_migraine_draft") {
      console.error("[ai-draft-from-text] No valid tool call in response");
      return new Response(JSON.stringify({ error: "Invalid LLM response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(toolCall.function.arguments);
    } catch (parseError) {
      console.error("[ai-draft-from-text] Failed to parse tool arguments:", parseError);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build DraftResult
    const draftResult: DraftResult = {
      originalText: text,
      painEntry: {
        selected_date: parsedResult.selected_date || { value: null, confidence: "low", source: null },
        selected_time: parsedResult.selected_time || { value: null, confidence: "low", source: null },
        pain_level: parsedResult.pain_level || { value: null, confidence: "low", source: null },
        pain_location: parsedResult.pain_location || { value: null, confidence: "low", source: null },
        aura_type: parsedResult.aura_type || { value: "keine", confidence: "high", source: null },
        notes_append: parsedResult.notes_append || { value: null, confidence: "low", source: null },
        medications: {
          names: (parsedResult.medications || []).map((m: MedicationItem) => m.med_name),
          ids: (parsedResult.medications || []).map((m: MedicationItem) => m.medication_id || null),
          items: (parsedResult.medications || []).map((m: MedicationItem) => ({
            med_name: m.med_name,
            medication_id: m.medication_id || null,
            taken_time: m.taken_time || { value: null, confidence: "low", source: null },
            dose_text: m.dose_text || { value: null, confidence: "low", source: null },
            effect_rating: m.effect_rating || { value: null, confidence: "low", source: null },
            effect_score: m.effect_score || { value: null, confidence: "low", source: null },
            side_effects: m.side_effects || { value: [], confidence: "low", source: null },
            notes: m.notes || { value: null, confidence: "low", source: null }
          }))
        },
        symptoms: parsedResult.symptoms || [],
        triggers: parsedResult.triggers || []
      },
      warnings: parsedResult.warnings || [],
      follow_up: [],
      engineUsed: "llm"
    };

    // Increment usage
    await supabase.from("user_ai_usage").upsert({
      user_id: user.id,
      feature: "llm_draft",
      request_count: currentUsage + 1,
      period_start: currentMonth
    }, { onConflict: "user_id,feature,period_start" });

    console.log(`[ai-draft-from-text] Successfully processed for user ${user.id}. Usage: ${currentUsage + 1}/${AI_QUOTA_MONTHLY_REQUESTS}`);

    return new Response(JSON.stringify(draftResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[ai-draft-from-text] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
