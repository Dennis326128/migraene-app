import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema for date range requests
const AnalysisRequestSchema = z.object({
  fromDate: z.string()
    .datetime({ message: 'fromDate muss ISO 8601 Format haben' }),
  toDate: z.string()
    .datetime({ message: 'toDate muss ISO 8601 Format haben' })
}).refine(data => {
  const from = new Date(data.fromDate);
  const to = new Date(data.toDate);
  const now = new Date();
  
  // Check: fromDate not in future
  if (from > now) return false;
  
  // Check: toDate >= fromDate
  if (to < from) return false;
  
  // Check: Max 730 days range (2 years for medical long-term analysis)
  const daysDiff = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 730;
}, {
  message: 'Datumsbereich ungültig: fromDate darf nicht in der Zukunft liegen, toDate muss >= fromDate sein, und max. 730 Tage (2 Jahre) Spanne'
});

// Generic error handler to prevent exposing internal structures
function handleError(error: unknown, context: string): Response {
  // Log detailed error internally
  console.error(`❌ [${context}] Error:`, error);
  if (error instanceof Error) {
    console.error('Stack trace:', error.stack);
  }

  // Determine error type and return generic message
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({ 
      error: 'Ungültige Datumseingabe'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Check for authentication errors
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
  if (errorMessage.includes('authorization') || errorMessage.includes('authentifizierung') || errorMessage.includes('unauthorized')) {
    return new Response(JSON.stringify({ 
      error: 'Authentifizierung fehlgeschlagen'
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Check for rate limit / credit errors (preserve these as they're user-facing)
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return new Response(JSON.stringify({ 
      error: 'Rate Limit erreicht. Bitte später erneut versuchen.'
    }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (errorMessage.includes('guthaben') || errorMessage.includes('402') || errorMessage.includes('credits')) {
    return new Response(JSON.stringify({ 
      error: 'Guthaben aufgebraucht. Bitte Credits hinzufügen.'
    }), {
      status: 402,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Generic server error
  return new Response(JSON.stringify({ 
    error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
  }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Tag-Extraktion (inline für Edge Function)
interface ExtractedTag {
  tag: string;
  category: 'mood' | 'sleep' | 'stress' | 'food' | 'activity' | 'wellbeing' | 'other';
  confidence: number;
}

const TAG_PATTERNS: Record<string, { category: ExtractedTag['category']; patterns: RegExp[] }> = {
  mood_good: { category: 'mood', patterns: [/\b(gut gelaunt|gute laune|fröhlich|glücklich|energiegeladen|motiviert)\b/gi] },
  mood_bad: { category: 'mood', patterns: [/\b(schlecht gelaunt|schlechte laune|niedergeschlagen|traurig|deprimiert)\b/gi] },
  mood_stressed: { category: 'mood', patterns: [/\b(gestresst|stress|angespannt|nervös|unruhig|überfordert)\b/gi] },
  mood_tired: { category: 'mood', patterns: [/\b(müde|erschöpft|kaputt|schlapp|kraftlos)\b/gi] },
  sleep_good: { category: 'sleep', patterns: [/\b(gut geschlafen|ausgeruht|erholsam geschlafen|durchgeschlafen)\b/gi] },
  sleep_bad: { category: 'sleep', patterns: [/\b(schlecht geschlafen|wenig geschlafen|kaum geschlafen|nicht geschlafen)\b/gi] },
  sleep_restless: { category: 'sleep', patterns: [/\b(unruhig geschlafen|oft aufgewacht)\b/gi] },
  stress_high: { category: 'stress', patterns: [/\b(viel stress|sehr stressig|hektisch|unter druck)\b/gi] },
  stress_low: { category: 'stress', patterns: [/\b(entspannt|ruhig|gelassen|stressfrei)\b/gi] },
  food_healthy: { category: 'food', patterns: [/\b(gesund gegessen|obst|gemüse|salat|vollkorn)\b/gi] },
  food_unhealthy: { category: 'food', patterns: [/\b(fastfood|ungesund|pizza|burger|chips|süßigkeiten)\b/gi] },
  food_hydration: { category: 'food', patterns: [/\b(viel getrunken|genug getrunken|viel wasser)\b/gi] },
  food_dehydration: { category: 'food', patterns: [/\b(wenig getrunken|zu wenig getrunken|dehydriert)\b/gi] },
  food_irregular: { category: 'food', patterns: [/\b(wenig gegessen|nichts gegessen|mahlzeit ausgelassen)\b/gi] },
  activity_sport: { category: 'activity', patterns: [/\b(sport|training|joggen|laufen|fitnessstudio|yoga)\b/gi] },
  activity_walking: { category: 'activity', patterns: [/\b(spazieren|gelaufen|zu fuß|gewandert)\b/gi] },
  activity_sedentary: { category: 'activity', patterns: [/\b(sitzend|am schreibtisch|büro|viel gesessen)\b/gi] },
  activity_active: { category: 'activity', patterns: [/\b(aktiv|viel bewegt|viel unterwegs)\b/gi] },
  wellbeing_good: { category: 'wellbeing', patterns: [/\b(fühle mich gut|geht mir gut|ausgeglichen|wohl)\b/gi] },
  wellbeing_bad: { category: 'wellbeing', patterns: [/\b(unwohl|nicht gut|schlecht gefühlt)\b/gi] },
  wellbeing_tense: { category: 'wellbeing', patterns: [/\b(verspannt|nacken|schulter|rücken)\b/gi] },
};

const TAG_LABELS: Record<string, string> = {
  mood_good: 'Gut gelaunt', mood_bad: 'Schlecht gelaunt', mood_stressed: 'Gestresst', mood_tired: 'Müde',
  sleep_good: 'Gut geschlafen', sleep_bad: 'Schlecht geschlafen', sleep_restless: 'Unruhig geschlafen',
  stress_high: 'Viel Stress', stress_low: 'Entspannt',
  food_healthy: 'Gesund gegessen', food_unhealthy: 'Ungesund gegessen',
  food_hydration: 'Viel getrunken', food_dehydration: 'Wenig getrunken', food_irregular: 'Unregelmäßig gegessen',
  activity_sport: 'Sport', activity_walking: 'Spazieren', activity_sedentary: 'Sitzend', activity_active: 'Aktiv',
  wellbeing_good: 'Wohlfühlen', wellbeing_bad: 'Unwohl', wellbeing_tense: 'Verspannt',
};

function extractTags(text: string): ExtractedTag[] {
  const found: ExtractedTag[] = [];
  const lowerText = text.toLowerCase();
  
  for (const [tagKey, { category, patterns }] of Object.entries(TAG_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = lowerText.match(pattern);
      if (matches && matches.length > 0) {
        const confidence = Math.min(1.0, 0.6 + (matches.length * 0.2));
        found.push({ tag: tagKey, category, confidence });
        break;
      }
    }
  }
  return found;
}

function extractHashtags(text: string): string[] {
  const hashtagPattern = /#[\wäöüÄÖÜß-]+/g;
  const matches = text.match(hashtagPattern);
  return matches ? matches.map(tag => tag.toLowerCase()) : [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate request body
    let requestBody: z.infer<typeof AnalysisRequestSchema>;
    try {
      const rawBody = await req.json();
      requestBody = AnalysisRequestSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('❌ Validation error:', error.errors);
        return new Response(JSON.stringify({ 
          error: 'Ungültige Datumseingabe',
          details: error.errors.map(e => e.message)
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    const { fromDate, toDate } = requestBody;
    
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

    // Extract tags from voice notes
    const allTags: Array<ExtractedTag & { noteText: string; date: string }> = [];
    const allHashtags: Record<string, number> = {};
    
    (voiceNotes || []).forEach(note => {
      const tags = extractTags(note.text);
      const hashtags = extractHashtags(note.text);
      const date = new Date(note.occurred_at).toISOString().split('T')[0];
      
      tags.forEach(tag => {
        allTags.push({ ...tag, noteText: note.text, date });
      });
      
      hashtags.forEach(tag => {
        allHashtags[tag] = (allHashtags[tag] || 0) + 1;
      });
    });

    // Group tags by category
    const tagStats: Record<string, number> = {};
    allTags.forEach(({ tag }) => {
      tagStats[tag] = (tagStats[tag] || 0) + 1;
    });

    const topTags = Object.entries(tagStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, label: TAG_LABELS[tag] || tag, count }));

    const topHashtags = Object.entries(allHashtags)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

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
    const tagsSummary = topTags.length > 0 
      ? `\n\n🏷️ HÄUFIGSTE KONTEXT-TAGS:\n${topTags.map(t => `  • ${t.label}: ${t.count}x erkannt`).join('\n')}`
      : '';
    
    const hashtagsSummary = topHashtags.length > 0
      ? `\n\n#️⃣ HASHTAGS:\n${topHashtags.map(h => `  • ${h.tag}: ${h.count}x`).join('\n')}`
      : '';

    const dataText = allData.map(d => {
      if (d.type === 'voice_note') {
        // Extract tags from this specific note
        const noteTags = extractTags(d.text);
        const noteHashtags = extractHashtags(d.text);
        const tagsStr = noteTags.length > 0 
          ? ` [Tags: ${noteTags.map(t => TAG_LABELS[t.tag] || t.tag).join(', ')}]` 
          : '';
        const hashtagsStr = noteHashtags.length > 0 
          ? ` ${noteHashtags.join(' ')}` 
          : '';
        return `[${d.date} ${d.time}] 📝 NOTIZ: ${d.text}${tagsStr}${hashtagsStr}`;
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

    const prompt = `Sie erhalten eine ausführliche, faktenbasierte Analyse von Migräne-Daten (inkl. Wetter, Wochentage, Medikamente, Schmerzlevel UND automatisch erkannte Kontext-Tags aus Notizen). 

DATENSATZ (${allData.length} Einträge von ${fromDate.split('T')[0]} bis ${toDate.split('T')[0]}):

${dataText}${tagsSummary}${hashtagsSummary}

AUFGABE:
Erstellen Sie eine kurze, leicht verständliche Zusammenfassung für Betroffene. WICHTIG: Berücksichtigen Sie auch die erkannten Kontext-Tags (z.B. "Gestresst", "Schlecht geschlafen", "Viel getrunken") und Hashtags für Muster-Erkennung.

VORGEHEN:
1. Schreiben Sie in klaren, einfachen Sätzen und verwenden Sie die Höflichkeitsform „Sie"
2. Geben Sie nur die wichtigsten 3–6 Kernaussagen wieder – keine langen Listen, Tabellen oder Aufzählungen von Einträgen
3. **NEU: Analysieren Sie Zusammenhänge zwischen Kontext-Tags und Schmerzeinträgen** (z.B. "Migräne trat häufig auf, wenn Sie am Vortag schlecht geschlafen haben" oder "Stress-Tags erscheinen oft 1-2 Tage vor Schmerzeinträgen")
4. Vermeiden Sie Rohdaten und Details wie:
   - ISO-Zeitstempel (z.B. 2025-10-04 15:39:00)
   - Lange Zahlen mit vielen Nachkommastellen (z.B. -8.199999999999932)
   - Vollständige Auflistungen einzelner Messwerte
   Fassen Sie solche Informationen stattdessen zusammen (z.B. „Mehrere Anfälle traten bei hoher Luftfeuchtigkeit über 80 % auf.")

DATUMS- UND ZAHLENFORMAT:
5. Schreiben Sie Daten im deutschen, gut lesbaren Format:
   - „am 04.10.2025 gegen 15:30 Uhr" oder
   - „am 4. Oktober 2025"
   Verwenden Sie KEINE Sekunden und KEINE technischen Zeitstempel
6. Runden Sie Zahlen sinnvoll:
   - Luftdruckänderungen auf ganze hPa
   - Temperatur auf ganze °C
   - Prozentwerte auf ganze Prozent

INHALTLICHE STRUKTUR (insgesamt ca. 200–280 Wörter):
a) Kurze Überschrift (z.B. „Kurz-Auswertung Ihrer Migräne-Einträge")
b) 1 kurzer Absatz zur Häufigkeit der Migräne (z.B. welcher Monat auffällig war)
c) **NEU: 1 Absatz zu Kontext-Mustern**: Häufigste Tags und deren mögliche Zusammenhänge mit Migräne (z.B. "Sie haben oft 'Gestresst' und 'Schlecht geschlafen' notiert - diese Faktoren scheinen in zeitlichem Zusammenhang mit Ihren Migräne-Anfällen zu stehen")
d) 1 kurzer Absatz zu möglichen Mustern (z.B. Tageszeiten, Wetter wie hohe Luftfeuchtigkeit oder Luftdruckwechsel – nur wenn in den Daten erwähnt)
e) 1 kurzer Absatz zu Medikamenten (häufig genutzte Mittel, aber ohne alle Dosierungen und jede einzelne Einnahme aufzuzählen)
f) 1 kurzer Absatz zu Symptomen (z.B. typische Schmerzlokalisation, ob Aura vorhanden ist oder nicht)
g) Optional: 2–3 Stichpunkte „Für Ihr nächstes Arztgespräch", **inkl. auffälliger Kontext-Muster** in einfachen Formulierungen

STIL UND SICHERHEIT:
8. Bleiben Sie streng faktenbasiert und spekulieren Sie nicht
9. Bei Tag-Zusammenhängen: Verwenden Sie vorsichtige Formulierungen wie "scheint zusammenzuhängen", "tritt häufig auf", "könnte ein Faktor sein"
10. Wenn die Datenlage begrenzt ist, erwähnen Sie das EINMAL am Ende in einem kurzen Satz (z.B. „Die Ergebnisse sind vorläufig, weil bisher nur eine begrenzte Anzahl an Einträgen vorliegt.")
11. Nutzen Sie eine freundliche, unterstützende Formulierung, aber machen Sie klar, dass die Auswertung keinen ärztlichen Rat ersetzt und als Grundlage für ein Arztgespräch dienen soll

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
      date_range: { from: fromDate.split('T')[0], to: toDate.split('T')[0] },
      tags: {
        total_tags: allTags.length,
        unique_tags: topTags.length,
        top_tags: topTags,
        top_hashtags: topHashtags,
        tags_by_category: Object.entries(
          allTags.reduce((acc, tag) => {
            acc[tag.category] = (acc[tag.category] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).map(([category, count]) => ({ category, count }))
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return handleError(error, 'analyze-voice-notes');
  }
});
