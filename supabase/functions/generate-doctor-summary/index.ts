import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: generate-doctor-summary
 * 
 * Generiert einen strukturierten, arztorientierten KI-Kurzbericht
 * aus Migräne-Tagebuch-Daten für PDF-Reports.
 * 
 * Input: { fromDate, toDate }
 * Output: { summary: string } - Fließtext mit fett hervorgehobenen Überschriften
 */

// Helper: Berechnet Tage zwischen zwei Daten
function calculateDays(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

// Helper: Formatiert Datum deutsch
function formatDateGerman(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
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
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { fromDate, toDate } = await req.json();

    if (!fromDate || !toDate) {
      return new Response(
        JSON.stringify({ error: 'fromDate and toDate required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tagebuch-Einträge mit Wetterdaten laden
    const { data: entries, error: entriesError } = await supabaseClient
      .from('pain_entries')
      .select(`
        id,
        timestamp_created,
        selected_date,
        selected_time,
        pain_level,
        aura_type,
        pain_location,
        medications,
        notes,
        weather:weather_logs!pain_entries_weather_id_fkey (
          pressure_mb,
          pressure_change_24h,
          temperature_c,
          humidity
        )
      `)
      .eq('user_id', user.id)
      .gte('selected_date', fromDate.split('T')[0])
      .lte('selected_date', toDate.split('T')[0])
      .order('selected_date', { ascending: true });

    if (entriesError) {
      console.error('Error fetching entries:', entriesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch entries' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const daysCount = calculateDays(fromDate, toDate);
    const fromFormatted = formatDateGerman(fromDate);
    const toFormatted = formatDateGerman(toDate);

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ 
          summary: `Attackenfrequenz: Im Auswertungszeitraum ${fromFormatted} - ${toFormatted} (${daysCount} Tage) wurden keine Attacken dokumentiert.\n\nHinweis: Automatisch aus den eingegebenen Daten generiert; ersetzt keine ärztliche Diagnose oder Therapieentscheidung.`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Medikamenten-Effekte laden
    const entryIds = entries.map(e => e.id);
    const { data: effects } = await supabaseClient
      .from('medication_effects')
      .select('entry_id, med_name, effect_rating')
      .in('entry_id', entryIds);

    // Medikamentenlimits laden
    const { data: limits } = await supabaseClient
      .from('user_medication_limits')
      .select('medication_name, limit_count, period_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Medikamentenverläufe (Prophylaxe/Akut) laden
    const { data: medicationCourses } = await supabaseClient
      .from('medication_courses')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false });

    // Formatiere Medikamentenverläufe für den Prompt
    const coursesText = medicationCourses && medicationCourses.length > 0
      ? medicationCourses.map(c => {
          const status = c.is_active ? 'aktiv' : `beendet am ${formatDateGerman(c.end_date || '')}`;
          const effectiveness = c.subjective_effectiveness !== null 
            ? `, subjektive Wirksamkeit: ${c.subjective_effectiveness}/10`
            : '';
          const sideEffects = c.had_side_effects && c.side_effects_text 
            ? `, Nebenwirkungen: ${c.side_effects_text}`
            : c.had_side_effects ? ', Nebenwirkungen vorhanden' : '';
          const discontinuation = c.discontinuation_reason 
            ? `, Abbruchgrund: ${c.discontinuation_reason}${c.discontinuation_details ? ` (${c.discontinuation_details})` : ''}`
            : '';
          
          return `- ${c.medication_name} (${c.type}): ${c.dose_text || 'Dosis nicht angegeben'}, seit ${formatDateGerman(c.start_date)}, Status: ${status}${effectiveness}${sideEffects}${discontinuation}`;
        }).join('\n')
      : 'Keine Medikamentenverläufe dokumentiert';

    // Prompt für strukturierten Arztbericht
    const prompt = `Du bist eine medizinisch neutrale KI. Werte Migräne-Tagebuchdaten aus und erstelle einen sehr kurzen, sachlichen Kurzbericht für Ärzt:innen.

WICHTIGE VORGABEN:
- Fokus NUR auf Auffälligkeiten und klinisch relevante Muster
- KEINE Selbstdiagnosen, KEINE Therapieempfehlungen, KEINE Spekulationen
- Kein Smalltalk, keine Anrede, keine Emojis
- Sprache: Deutsch
- DEUTSCHES ZAHLENFORMAT: Dezimaltrennzeichen ist KOMMA (z.B. "6,5" statt "6.5", "20,6" statt "20.6")
- Format: KEIN Markdown (keine *, **, #), nur normaler Fließtext
- Maximal 6-7 kurze Absätze, jeder 1-2 Sätze
- Jeder Absatz beginnt mit fett hervorgehobener Überschrift gefolgt von Doppelpunkt (Format: "Überschrift: Text")
- Einheitlich "Attacken" statt "Episoden" verwenden

ZEITRAUM:
Auswertungszeitraum: ${fromFormatted} – ${toFormatted} (${daysCount} Tage)

STRUKTUR (nur auffällige Punkte erwähnen, irrelevante Abschnitte komplett weglassen):

1. Attackenfrequenz: Gesamtzahl der Attacken im Zeitraum, Durchschnitt pro Monat (30 Tage).
   Beispiel: "Attackenfrequenz: Im Auswertungszeitraum wurden 62 Attacken dokumentiert, entsprechend durchschnittlich 20,6 Attacken pro Monat."
   WICHTIG: Die Gesamtzahl muss EXAKT ${entries.length} sein!

2. Schmerzintensität: Typischer Bereich (z.B. NRS 7–9) und mittlere Intensität mit Komma (z.B. "6,5/10"). NUR erwähnen, wenn Intensität eher hoch (>6) oder stark schwankend ist.
   Beispiel: "Schmerzintensität: Die Attacken liegen überwiegend im Bereich NRS 7–9, mit einer mittleren Schmerzintensität von 6,5/10."

3. Medikation: Kompakte Übersicht der Akutmedikamente im Format "Wirkstoff Dosis Anzahl×".
   Beispiel: "Medikation: Sumatriptan 100 mg 30×, Rizatriptan 10 mg 4×, Ibuprofen 800 mg 10×."
   NUR erwähnen wenn mindestens 3 Einnahmen dokumentiert.

4. Medikamentenübergebrauch: Konkrete Monate mit Triptantagen oder Analgetikatagen auflisten.
   Beispiel: "Medikamentenübergebrauch: Tage mit Sumatriptan-Einnahme: September 10, Oktober 14, November 10. Oktober und November liegen im Bereich eines möglichen Triptan-Übergebrauchs (Grenzwert >10 Tage/Monat)."
   Wenn KEIN Hinweis auf Übergebrauch: "Medikamentenübergebrauch: In den vorliegenden Daten aktuell kein Hinweis auf einen Medikamentenübergebrauch."

5. Wetter / Luftdruck: NUR dann einen Absatz, wenn die Daten einen erkennbaren Zusammenhang zeigen.
   Beispiel: "Wetter / Luftdruck: Attacken häufen sich nach ausgeprägten Luftdruckabfällen, insbesondere am 04.10.2025 und 23.11.2025 mit Abfällen von jeweils >20 hPa."
   Wenn kein relevanter Zusammenhang: diesen Abschnitt KOMPLETT WEGLASSEN.

6. Prophylaxe/Therapieverlauf: Falls Medikamentenverläufe dokumentiert sind, kurz zusammenfassen.
   Beispiel: "Prophylaxe: Topiramat 100 mg seit 01.09.2024 aktiv, subjektive Wirksamkeit 7/10. Amitriptylin 25 mg wurde am 15.06.2024 wegen Nebenwirkungen (Müdigkeit) abgesetzt."
   Wenn keine Verläufe dokumentiert: diesen Abschnitt KOMPLETT WEGLASSEN.

7. Besondere Auffälligkeiten: Nur klinisch relevante Besonderheiten erwähnen.
   Beispiel: "Besondere Auffälligkeiten: Auffällig sind die hohe Attackenfrequenz und wiederholte Mehrfacheinnahmen von Akutmedikation an einzelnen Tagen."
   Maximal 2-3 Sätze.

8. Am Ende IMMER: "Hinweis: Automatisch aus den eingegebenen Daten generiert; ersetzt keine ärztliche Diagnose oder Therapieentscheidung."

DATEN:
Anzahl Attacken: ${entries.length}
Tage im Zeitraum: ${daysCount}
Durchschnitt Attacken pro Monat: ${(entries.length / (daysCount / 30)).toFixed(1).replace('.', ',')}
${limits && limits.length > 0 ? `Medikamentenlimits: ${limits.map(l => `${l.medication_name}: max. ${l.limit_count}/${l.period_type}`).join(', ')}` : ''}

Medikamentenverläufe (Prophylaxe/Akuttherapie):
${coursesText}

Einträge:
${entries.map(e => {
  const date = e.selected_date || e.timestamp_created?.split('T')[0];
  const time = e.selected_time || '';
  const pain = e.pain_level || 'unbekannt';
  const meds = e.medications?.join(', ') || 'keine';
  const weather = Array.isArray(e.weather) ? e.weather[0] : e.weather;
  const pressure = weather?.pressure_mb ? `${weather.pressure_mb}hPa` : '';
  const pressureChange = weather?.pressure_change_24h ? `(${weather.pressure_change_24h > 0 ? '+' : ''}${weather.pressure_change_24h}hPa/24h)` : '';
  
  // Finde Effekte für diesen Eintrag
  const entryEffects = effects?.filter(eff => eff.entry_id === e.id) || [];
  const effectsText = entryEffects.length > 0 
    ? entryEffects.map(eff => `${eff.med_name}:${eff.effect_rating}`).join(', ')
    : 'keine Bewertung';
  
  return `${date} ${time}: Schmerz ${pain}, Aura ${e.aura_type || 'keine'}, Meds ${meds}, Wirkung ${effectsText}${pressure ? `, Druck ${pressure}${pressureChange}` : ''}`;
}).join('\n')}

Gib NUR den fertig formatierten Text zurück, KEIN Markdown.`;

    // Lovable AI aufrufen
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
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
          { role: 'system', content: 'Du bist ein medizinischer KI-Assistent, der prägnante, arztorientierte Zusammenfassungen erstellt. Du verwendest kein Markdown, sondern normalen Fließtext mit Überschriften gefolgt von Doppelpunkt.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    let summary = aiData.choices?.[0]?.message?.content || 'Keine Analyse verfügbar';
    
    // Clean up any remaining markdown artifacts
    summary = summary
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/^-\s+/gm, '')
      .replace(/•/g, '')
      .trim();

    return new Response(
      JSON.stringify({ summary }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-doctor-summary:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
