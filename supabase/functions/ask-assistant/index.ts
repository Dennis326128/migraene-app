import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: ask-assistant
 * 
 * Voice Q&A für Migräne-Fragen
 * - Lädt Nutzer-Daten als Kontext
 * - Beantwortet Fragen mit Safety-Checks
 * 
 * Input: { question: string, locale?: string }
 * Output: { answerShort, answerBullets[], fromYourDataBullets[], safetyNote?, suggestedFollowUps[] }
 */

interface PainEntry {
  selected_date: string;
  pain_level: string;
  aura_type: string;
  pain_location: string;
  medications: string[] | null;
  notes: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { question, locale = 'de' } = await req.json();

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: 'Bitte gib eine Frage ein' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📝 Ask Assistant: "${question.substring(0, 50)}..."`);

    // Load user context data (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const fromDate = ninetyDaysAgo.toISOString().split('T')[0];

    // Fetch pain entries
    const { data: entries, error: entriesError } = await supabaseClient
      .from('pain_entries')
      .select('selected_date, pain_level, aura_type, pain_location, medications, notes')
      .eq('user_id', user.id)
      .gte('selected_date', fromDate)
      .order('selected_date', { ascending: false })
      .limit(300);

    if (entriesError) {
      console.error('Error fetching entries:', entriesError);
    }

    // Fetch user medications
    const { data: userMeds } = await supabaseClient
      .from('user_medications')
      .select('name, intake_type, effect_category, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Fetch medication courses (Prophylaxe)
    const { data: medCourses } = await supabaseClient
      .from('medication_courses')
      .select('medication_name, type, is_active, start_date, end_date')
      .eq('user_id', user.id);

    // Build data summary for context
    const dataSummary = buildDataSummary(entries || [], userMeds || [], medCourses || []);
    
    console.log(`📊 Data summary: ${dataSummary.entriesCount} entries, ${dataSummary.medsCount} medications`);

    // Build LLM prompt
    const systemPrompt = `Du bist ein sachlicher In-App Assistent für eine Migräne-Tagebuch-App.

REGELN:
- Antworte kurz, verständlich und hilfsbereit (2-6 Sätze Hauptantwort)
- KEINE medizinischen Diagnosen stellen
- KEINE konkreten Dosierungen oder Einnahme-Anweisungen geben
- Bei Alarmzeichen (stärkster Kopfschmerz des Lebens, neurologische Ausfälle, Fieber mit Kopfschmerz) → klarer Hinweis auf ärztliche Abklärung/Notfall
- Wenn du Daten des Nutzers verwendest, nenne konkrete Zahlen/Zeiträume
- Sprich den Nutzer mit "du" an
- Sprache: Deutsch

FORMAT (JSON):
{
  "answerShort": "Hauptantwort in 2-6 Sätzen",
  "answerBullets": ["Punkt 1", "Punkt 2"], // optional, Details als Bulletpoints
  "fromYourDataBullets": ["Punkt 1"], // optional, nur wenn Nutzerdaten verwendet
  "safetyNote": "Sicherheitshinweis", // optional, nur bei kritischen Themen
  "suggestedFollowUps": ["Folgefrage 1"] // optional, max 2
}`;

    const userPrompt = `NUTZERFRAGE: "${question}"

NUTZERDATEN (letzte 90 Tage):
${dataSummary.text}

Beantworte die Frage basierend auf den verfügbaren Daten. Wenn die Frage allgemein zu Migräne ist und keine spezifischen Nutzerdaten benötigt, beantworte sie trotzdem sachlich.`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service nicht konfiguriert' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate Limit erreicht. Bitte später erneut versuchen.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Guthaben aufgebraucht. Bitte Credits hinzufügen.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('🤖 AI Response received');

    // Parse JSON response
    let parsedResponse;
    try {
      // Extract JSON from response (might be wrapped in markdown)
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: use raw content as answer
        parsedResponse = {
          answerShort: rawContent.replace(/```json\n?|\n?```/g, '').trim()
        };
      }
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      parsedResponse = {
        answerShort: rawContent.replace(/```json\n?|\n?```/g, '').trim()
      };
    }

    return new Response(
      JSON.stringify({
        answerShort: parsedResponse.answerShort || 'Keine Antwort verfügbar.',
        answerBullets: parsedResponse.answerBullets || [],
        fromYourDataBullets: parsedResponse.fromYourDataBullets || [],
        safetyNote: parsedResponse.safetyNote,
        suggestedFollowUps: parsedResponse.suggestedFollowUps || []
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ask-assistant:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unbekannter Fehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper: Build data summary for LLM context
function buildDataSummary(
  entries: PainEntry[],
  meds: Array<{ name: string; intake_type: string | null; effect_category: string | null; is_active: boolean | null }>,
  courses: Array<{ medication_name: string; type: string; is_active: boolean; start_date: string | null; end_date: string | null }>
): { text: string; entriesCount: number; medsCount: number } {
  
  const entriesCount = entries.length;
  const medsCount = meds.length;

  if (entriesCount === 0) {
    return {
      text: 'Keine Einträge in den letzten 90 Tagen vorhanden.',
      entriesCount: 0,
      medsCount
    };
  }

  // Pain level stats
  const painLevels = entries.map(e => e.pain_level).filter(Boolean);
  const painMap: Record<string, number> = {};
  painLevels.forEach(p => {
    painMap[p] = (painMap[p] || 0) + 1;
  });
  
  // Most common pain level
  const mostCommonPain = Object.entries(painMap).sort((a, b) => b[1] - a[1])[0];

  // Medication usage
  const medUsage: Record<string, number> = {};
  entries.forEach(e => {
    (e.medications || []).forEach(m => {
      medUsage[m] = (medUsage[m] || 0) + 1;
    });
  });
  
  // Top medications
  const topMeds = Object.entries(medUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `${name}: ${count}×`);

  // Aura types
  const auraTypes = entries.map(e => e.aura_type).filter(a => a && a !== 'keine');
  const uniqueAuras = [...new Set(auraTypes)];

  // Pain locations
  const locations = entries.map(e => e.pain_location).filter(Boolean);
  const locationCounts: Record<string, number> = {};
  locations.forEach(l => {
    if (l) locationCounts[l] = (locationCounts[l] || 0) + 1;
  });
  const topLocations = Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Active prophylaxis
  const activeProphylaxis = courses
    .filter(c => c.is_active && c.type === 'prophylaxis')
    .map(c => c.medication_name);

  // Build summary text
  const lines: string[] = [];
  lines.push(`- ${entriesCount} Migräne-Einträge in den letzten 90 Tagen`);
  
  if (mostCommonPain) {
    lines.push(`- Häufigste Schmerzstärke: ${mostCommonPain[0]} (${mostCommonPain[1]}×)`);
  }
  
  if (topMeds.length > 0) {
    lines.push(`- Eingenommene Akutmedikamente: ${topMeds.join(', ')}`);
  }
  
  if (uniqueAuras.length > 0) {
    lines.push(`- Aura-Typen: ${uniqueAuras.join(', ')}`);
  }
  
  if (topLocations.length > 0) {
    lines.push(`- Schmerzlokalisationen: ${topLocations.map(([l, c]) => `${l} (${c}×)`).join(', ')}`);
  }
  
  if (activeProphylaxis.length > 0) {
    lines.push(`- Aktive Prophylaxe: ${activeProphylaxis.join(', ')}`);
  }
  
  if (medsCount > 0) {
    const medNames = meds.slice(0, 5).map(m => m.name);
    lines.push(`- Hinterlegte Medikamente: ${medNames.join(', ')}${medsCount > 5 ? ` (+${medsCount - 5} weitere)` : ''}`);
  }

  return {
    text: lines.join('\n'),
    entriesCount,
    medsCount
  };
}
