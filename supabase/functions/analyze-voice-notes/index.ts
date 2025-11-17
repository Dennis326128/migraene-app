import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fromDate, toDate } = await req.json();
    
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Keine Authentifizierung');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user ID from auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Authentifizierung fehlgeschlagen');

    // Check if AI analysis is enabled
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ai_enabled')
      .eq('user_id', user.id)
      .single();

    if (!profile?.ai_enabled) {
      return new Response(JSON.stringify({ 
        error: 'AI-Analyse ist in den Einstellungen deaktiviert' 
      }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Fetch voice notes
    const { data: voiceNotes, error: voiceError } = await supabase
      .from('voice_notes')
      .select('occurred_at, text')
      .eq('user_id', user.id)
      .gte('occurred_at', fromDate)
      .lte('occurred_at', toDate)
      .order('occurred_at', { ascending: true });

    if (voiceError) throw voiceError;

    // Fetch ALL pain entries with structured data and weather
    const { data: painEntries, error: painError } = await supabase
      .from('pain_entries')
      .select(`
        timestamp_created,
        selected_date,
        selected_time,
        pain_level,
        aura_type,
        pain_location,
        medications,
        notes,
        weather:weather_logs!pain_entries_weather_id_fkey (
          temperature_c,
          pressure_mb,
          humidity,
          pressure_change_24h,
          condition_text,
          moon_phase
        )
      `)
      .eq('user_id', user.id)
      .gte('timestamp_created', fromDate)
      .lte('timestamp_created', toDate)
      .order('timestamp_created', { ascending: true });

    if (painError) throw painError;

    // Structure data for LLM analysis
    const structuredEntries = (painEntries || []).map(entry => {
      const weather = Array.isArray(entry.weather) ? entry.weather[0] : entry.weather;
      const date = entry.selected_date || entry.timestamp_created.split('T')[0];
      const time = entry.selected_time || entry.timestamp_created.split('T')[1].substring(0, 5);
      
      return {
        date,
        time,
        pain_level: entry.pain_level,
        aura_type: entry.aura_type,
        pain_location: entry.pain_location || 'nicht angegeben',
        medications: entry.medications?.join(', ') || 'keine',
        notes: entry.notes || '',
        weather: weather ? {
          temp: weather.temperature_c,
          pressure: weather.pressure_mb,
          pressure_change: weather.pressure_change_24h,
          humidity: weather.humidity,
          condition: weather.condition_text,
          moon_phase: weather.moon_phase
        } : null
      };
    });

    // Combine with voice notes
    const allData = [
      ...structuredEntries,
      ...(voiceNotes || []).map(n => ({
        date: new Date(n.occurred_at).toISOString().split('T')[0],
        time: new Date(n.occurred_at).toISOString().split('T')[1].substring(0, 5),
        type: 'voice_note',
        text: n.text
      }))
    ].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

    if (allData.length === 0) {
      return new Response(JSON.stringify({ 
        insights: 'Keine Daten im gewählten Zeitraum gefunden.',
        analyzed_entries: 0,
        voice_notes_count: 0,
        total_analyzed: 0,
        has_weather_data: false,
        date_range: { from: fromDate.split('T')[0], to: toDate.split('T')[0] }
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Build detailed prompt for LLM
    const dataText = allData.map(d => {
      if (d.type === 'voice_note') {
        return `[${d.date} ${d.time}] 📝 NOTIZ: ${d.text}`;
      }
      
      let entry = `[${d.date} ${d.time}] 🩺 MIGRÄNE-EINTRAG
  • Schmerzlevel: ${d.pain_level}
  • Aura: ${d.aura_type}
  • Lokalisation: ${d.pain_location}
  • Medikamente: ${d.medications}`;
      
      if (d.weather) {
        entry += `
  🌤️ WETTER:
  • Temperatur: ${d.weather.temp}°C
  • Luftdruck: ${d.weather.pressure} hPa${d.weather.pressure_change ? ` (Δ24h: ${d.weather.pressure_change > 0 ? '+' : ''}${d.weather.pressure_change} hPa)` : ''}
  • Luftfeuchtigkeit: ${d.weather.humidity}%
  • Bedingung: ${d.weather.condition}${d.weather.moon_phase ? `\n  • Mondphase: ${d.weather.moon_phase}` : ''}`;
      }
      
      if (d.notes) {
        entry += `\n  💬 Notiz: ${d.notes}`;
      }
      
      return entry;
    }).join('\n\n');

    const hasWeatherData = structuredEntries.some(e => e.weather !== null);

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY nicht konfiguriert');

    const prompt = `Sie erhalten eine ausführliche, faktenbasierte Analyse von Migräne-Daten (inkl. Wetter, Wochentage, Medikamente, Schmerzlevel usw.). 

DATENSATZ (${allData.length} Einträge von ${fromDate.split('T')[0]} bis ${toDate.split('T')[0]}):

${dataText}

AUFGABE:
Erstellen Sie eine kurze, leicht verständliche Zusammenfassung für Betroffene.

VORGEHEN:
1. Schreiben Sie in klaren, einfachen Sätzen und verwenden Sie die Höflichkeitsform „Sie"
2. Geben Sie nur die wichtigsten 3–6 Kernaussagen wieder – keine langen Listen, Tabellen oder Aufzählungen von Einträgen
3. Vermeiden Sie Rohdaten und Details wie:
   - ISO-Zeitstempel (z.B. 2025-10-04 15:39:00)
   - Lange Zahlen mit vielen Nachkommastellen (z.B. -8.199999999999932)
   - Vollständige Auflistungen einzelner Messwerte
   Fassen Sie solche Informationen stattdessen zusammen (z.B. „Mehrere Anfälle traten bei hoher Luftfeuchtigkeit über 80 % auf.")

DATUMS- UND ZAHLENFORMAT:
4. Schreiben Sie Daten im deutschen, gut lesbaren Format:
   - „am 04.10.2025 gegen 15:30 Uhr" oder
   - „am 4. Oktober 2025"
   Verwenden Sie KEINE Sekunden und KEINE technischen Zeitstempel
5. Runden Sie Zahlen sinnvoll:
   - Luftdruckänderungen auf ganze hPa
   - Temperatur auf ganze °C
   - Prozentwerte auf ganze Prozent

INHALTLICHE STRUKTUR (insgesamt ca. 150–220 Wörter):
a) Kurze Überschrift (z.B. „Kurz-Auswertung Ihrer Migräne-Einträge")
b) 1 kurzer Absatz zur Häufigkeit der Migräne (z.B. welcher Monat auffällig war)
c) 1 kurzer Absatz zu möglichen Mustern (z.B. Tageszeiten, Wetter wie hohe Luftfeuchtigkeit oder Luftdruckwechsel – nur wenn in den Daten erwähnt)
d) 1 kurzer Absatz zu Medikamenten (häufig genutzte Mittel, aber ohne alle Dosierungen und jede einzelne Einnahme aufzuzählen)
e) 1 kurzer Absatz zu Symptomen (z.B. typische Schmerzlokalisation, ob Aura vorhanden ist oder nicht)
f) Optional: 2–3 Stichpunkte „Für Ihr nächstes Arztgespräch", in einfachen Formulierungen

STIL UND SICHERHEIT:
7. Bleiben Sie streng faktenbasiert und spekulieren Sie nicht
8. Wenn die Datenlage begrenzt ist, erwähnen Sie das EINMAL am Ende in einem kurzen Satz (z.B. „Die Ergebnisse sind vorläufig, weil bisher nur eine begrenzte Anzahl an Einträgen vorliegt.")
9. Nutzen Sie eine freundliche, unterstützende Formulierung, aber machen Sie klar, dass die Auswertung keinen ärztlichen Rat ersetzt und als Grundlage für ein Arztgespräch dienen soll

Formatieren Sie die Antwort in gut lesbarem Markdown OHNE Rohdaten-Listen und OHNE technischen Fachjargon.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Sie sind ein hilfreicher medizinischer Assistent, der Migräne-Patienten dabei unterstützt, ihre Daten zu verstehen. Schreiben Sie klar, verständlich und patientenfreundlich. Verwenden Sie die Höflichkeitsform "Sie".' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate Limit erreicht. Bitte später erneut versuchen.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Guthaben aufgebraucht. Bitte Credits hinzufügen.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI Gateway Error:', aiResponse.status, errorText);
      throw new Error(`AI-Analyse fehlgeschlagen: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const insights = aiData.choices[0].message.content;

    // Log metadata only (no content)
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'AI_ANALYSIS',
      table_name: 'voice_notes',
      old_data: {
        model: 'gemini-2.5-flash',
        voice_notes_count: voiceNotes?.length || 0,
        pain_entries_count: painEntries?.length || 0,
        total_analyzed: allData.length,
        has_weather_data: hasWeatherData,
        tokens: aiData.usage?.total_tokens || 0
      }
    });

    return new Response(JSON.stringify({
      insights,
      analyzed_entries: painEntries?.length || 0,
      voice_notes_count: voiceNotes?.length || 0,
      total_analyzed: allData.length,
      has_weather_data: hasWeatherData,
      date_range: { from: fromDate.split('T')[0], to: toDate.split('T')[0] }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
