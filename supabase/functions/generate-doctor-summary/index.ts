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
 * Input: { fromDate, toDate, includeContextNotes?: boolean }
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

    const { fromDate, toDate, includeContextNotes = false } = await req.json();

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
        pain_locations,
        medications,
        notes,
        me_cfs_severity_score,
        me_cfs_severity_level,
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

    // Kontextnotizen laden wenn aktiviert
    let contextNotesText = '';
    if (includeContextNotes) {
      const { data: voiceNotes } = await supabaseClient
        .from('voice_notes')
        .select('text, occurred_at, context_type')
        .eq('user_id', user.id)
        .gte('occurred_at', fromDate)
        .lte('occurred_at', toDate)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: true });

      if (voiceNotes && voiceNotes.length > 0) {
        contextNotesText = voiceNotes.map(n => {
          const date = formatDateGerman(n.occurred_at);
          const contextLabel = n.context_type ? ` [${n.context_type}]` : '';
          return `${date}${contextLabel}: ${n.text}`;
        }).join('\n');
      }
    }

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

    // Context notes section for prompt
    const contextNotesSection = includeContextNotes && contextNotesText 
      ? `\n\nKONTEXTNOTIZEN (Sprachnotizen/Zusatzinformationen):\n${contextNotesText}\n\nWichtig: Berücksichtige die Kontextnotizen bei der Analyse der "Besonderen Auffälligkeiten". Falls relevante Muster oder Trigger in den Kontextnotizen erwähnt werden (z.B. Stress, Schlaf, Ernährung, Hormone), erwähne diese im Bericht.`
      : '';

    // ── ME/CFS aggregierter Featureblock (gefiltert nach Tracking-Start) ──
    // Fetch mecfs_tracking_started_at from user_profiles
    let mecfsStartDate: string | null = null;
    {
      const { data: profileData } = await supabaseClient
        .from('user_profiles')
        .select('mecfs_tracking_started_at')
        .eq('user_id', user.id)
        .maybeSingle();
      mecfsStartDate = profileData?.mecfs_tracking_started_at ?? null;
    }

    // If no persisted start date, derive from entries
    if (!mecfsStartDate) {
      for (const e of entries) {
        if (e.me_cfs_severity_score === undefined || e.me_cfs_severity_score === null) continue;
        const d = e.selected_date || e.timestamp_created?.split('T')[0];
        if (d && (!mecfsStartDate || d < mecfsStartDate)) mecfsStartDate = d;
      }
    }

    const mecfsEntries = mecfsStartDate
      ? entries.filter(e => {
          const d = e.selected_date || e.timestamp_created?.split('T')[0];
          return d && d >= mecfsStartDate!;
        })
      : entries;

    const meCfsDayMap = new Map<string, number>();
    for (const e of mecfsEntries) {
      const date = e.selected_date || e.timestamp_created?.split('T')[0];
      if (!date) continue;
      const score = e.me_cfs_severity_score ?? 0;
      meCfsDayMap.set(date, Math.max(meCfsDayMap.get(date) ?? 0, score));
    }
    const meCfsScores = Array.from(meCfsDayMap.values());
    const meCfsDaysWithBurden = meCfsScores.filter(s => s > 0).length;

    let meCfsFeatureBlock = '';
    if (meCfsDaysWithBurden > 0) {
      const documentedDays = meCfsScores.length;
      const meCfsPct = Math.round((meCfsDaysWithBurden / documentedDays) * 100);
      const meCfsAvg = meCfsScores.reduce((a, b) => a + b, 0) / documentedDays;
      const burdenPer30 = Math.round(((meCfsDaysWithBurden / documentedDays) * 30) * 10) / 10;
      const levelLabel = (s: number): string => s <= 0 ? 'keine' : s <= 4 ? 'leicht' : s <= 7 ? 'mittel' : 'schwer';
      meCfsFeatureBlock = `\nME/CFS (aggregiert, Basis: ${documentedDays} dokumentierte Tage seit Beginn der ME/CFS-Erfassung): Belastete Tage: ${burdenPer30}/30 (hochgerechnet), ${meCfsPct}%, Ø Tages-MAX: ${(Math.round(meCfsAvg * 10) / 10)}/10 (${levelLabel(meCfsAvg)}).`;
    }

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
- ME/CFS nur erwähnen, wenn ein ME/CFS-Featureblock in den Daten vorhanden ist
- Keine Kausalitätsbehauptungen bei ME/CFS, nur Assoziationen ("tendenziell", "im Mittel")

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

7. Besondere Auffälligkeiten: Nur klinisch relevante Besonderheiten erwähnen.${includeContextNotes ? ' Berücksichtige hierbei auch relevante Informationen aus den Kontextnotizen (z.B. Stressfaktoren, Schlafmuster, hormonelle Zusammenhänge).' : ''}
   Beispiel: "Besondere Auffälligkeiten: Auffällig sind die hohe Attackenfrequenz und wiederholte Mehrfacheinnahmen von Akutmedikation an einzelnen Tagen."
   Maximal 2-3 Sätze.

8. ME/CFS-Belastung: NUR wenn ME/CFS-Featureblock in den Daten vorhanden ist, kurz erwähnen.
   Beispiel: "ME/CFS-Belastung: An 45% der Tage wurde eine ME/CFS-Beeinträchtigung dokumentiert, überwiegend leicht bis mittel. An Tagen mit höherer ME/CFS-Belastung war die Schmerzintensität tendenziell erhöht."
   Wenn kein ME/CFS-Featureblock vorhanden: diesen Abschnitt KOMPLETT WEGLASSEN.
   KEINE Kausalitätsbehauptungen, nur sachliche Beschreibung der Assoziation.

WICHTIG: Beende den Text direkt nach dem letzten zutreffenden Abschnitt. Fuege KEINEN Hinweis, Disclaimer oder "Hinweis:" Absatz hinzu - dieser wird separat im PDF eingefuegt.

DATEN:
Anzahl Attacken: ${entries.length}
Tage im Zeitraum: ${daysCount}
Durchschnitt Attacken pro Monat: ${(entries.length / (daysCount / 30)).toFixed(1).replace('.', ',')}
${limits && limits.length > 0 ? `Medikamentenlimits: ${limits.map(l => `${l.medication_name}: max. ${l.limit_count}/${l.period_type}`).join(', ')}` : ''}

Medikamentenverläufe (Prophylaxe/Akuttherapie):
${coursesText}
${contextNotesSection}

Einträge:
${entries.map(e => {
  const date = e.selected_date || e.timestamp_created?.split('T')[0];
  const time = e.selected_time || '';
  const pain = e.pain_level || 'unbekannt';
  const meds = e.medications?.join(', ') || 'keine';
  const locations = (e.pain_locations || []).join(', ') || 'keine Angabe';
  const weather = Array.isArray(e.weather) ? e.weather[0] : e.weather;
  const pressure = weather?.pressure_mb ? `${weather.pressure_mb}hPa` : '';
  const pressureChange = weather?.pressure_change_24h ? `(${weather.pressure_change_24h > 0 ? '+' : ''}${weather.pressure_change_24h}hPa/24h)` : '';
  const cfs = e.me_cfs_severity_score > 0 ? `, ME/CFS ${e.me_cfs_severity_level}` : '';
  
  const entryEffects = effects?.filter(eff => eff.entry_id === e.id) || [];
  const effectsText = entryEffects.length > 0 
    ? entryEffects.map(eff => `${eff.med_name}:${eff.effect_rating}`).join(', ')
    : 'keine Bewertung';
  
  return `${date} ${time}: Schmerz ${pain}, Aura ${e.aura_type || 'keine'}, Ort ${locations}, Meds ${meds}, Wirkung ${effectsText}${cfs}${pressure ? `, Druck ${pressure}${pressureChange}` : ''}`;
}).join('\n')}
${meCfsFeatureBlock}

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
    
    // Clean up any remaining markdown artifacts AND remove any disclaimer/Hinweis text
    summary = summary
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/^-\s+/gm, '')
      .replace(/•/g, '')
      // Remove any Hinweis/Disclaimer paragraph (robust patterns - beginning, end, or standalone)
      .replace(/^Hinweis:.*$/gim, '')
      .replace(/\n+Hinweis:.*$/gis, '')
      .replace(/\n*\d+\.\s*Hinweis:.*$/gis, '')
      .replace(/Wichtiger Hinweis:.*$/gis, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return new Response(
      JSON.stringify({ 
        summary,
        context_notes_included: includeContextNotes && contextNotesText.length > 0
      }),
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
