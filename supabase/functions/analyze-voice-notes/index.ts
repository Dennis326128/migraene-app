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
    .datetime({ message: 'toDate muss ISO 8601 Format haben' }),
  mode: z.enum(['full', 'doctor_summary']).optional().default('full')
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

// Generic error handler with requestId
function handleError(error: unknown, context: string, requestId: string): Response {
  console.error(`❌ [${context}] [${requestId}] Error:`, error);
  if (error instanceof Error) {
    console.error(`[${requestId}] Stack trace:`, error.stack);
  }

  const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
  
  // Zod validation error
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({ 
      requestId,
      error: 'Ungültige Datumseingabe',
      details: error.errors.map(e => e.message)
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Auth errors
  if (errorMessage.includes('authorization') || errorMessage.includes('authentifizierung') || errorMessage.includes('unauthorized') || errorMessage.includes('keine authentifizierung')) {
    return new Response(JSON.stringify({ 
      requestId,
      error: 'Authentifizierung fehlgeschlagen'
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Rate limit
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return new Response(JSON.stringify({ 
      requestId,
      error: 'Rate Limit erreicht. Bitte später erneut versuchen.'
    }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Credits exhausted
  if (errorMessage.includes('guthaben') || errorMessage.includes('402') || errorMessage.includes('credits')) {
    return new Response(JSON.stringify({ 
      requestId,
      error: 'Guthaben aufgebraucht. Bitte Credits hinzufügen.'
    }), {
      status: 402,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Generic server error
  return new Response(JSON.stringify({ 
    requestId,
    error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
  }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Tag extraction helpers
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
  // Generate request ID at the very start
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log(`[analyze-voice-notes] [${requestId}] Request started`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse and validate request body
    let requestBody: z.infer<typeof AnalysisRequestSchema>;
    
    try {
      const rawBody = await req.json();
      console.log(`[${requestId}] Raw body received:`, JSON.stringify(rawBody));
      requestBody = AnalysisRequestSchema.parse(rawBody);
      console.log(`[${requestId}] Validation passed, mode: ${requestBody.mode}`);
    } catch (parseError) {
      if (parseError instanceof z.ZodError) {
        console.error(`[${requestId}] Zod validation error:`, parseError.errors);
        return new Response(JSON.stringify({ 
          requestId,
          error: 'Ungültige Datumseingabe',
          details: parseError.errors.map(e => e.message)
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      // Invalid JSON
      console.error(`[${requestId}] JSON parse error:`, parseError);
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Ungültiges JSON im Request-Body'
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { fromDate, toDate, mode } = requestBody;
    
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[${requestId}] No Authorization header`);
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Keine Authentifizierung'
      }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error(`[${requestId}] Missing Supabase env vars`);
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Server-Konfigurationsfehler'
      }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user from JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error(`[${requestId}] Auth error:`, authError);
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Authentifizierung fehlgeschlagen'
      }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[${requestId}] User authenticated: ${user.id}`);

    // Check if AI is enabled for user
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ai_enabled')
      .eq('user_id', user.id)
      .single();

    if (!profile?.ai_enabled) {
      console.log(`[${requestId}] AI disabled for user`);
      return new Response(JSON.stringify({ 
        requestId,
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

    if (voiceError) {
      console.error(`[${requestId}] Voice notes error:`, voiceError);
      throw voiceError;
    }

    console.log(`[${requestId}] Voice notes fetched: ${voiceNotes?.length || 0}`);

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

    // Group tags
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

    // Fetch pain entries with weather
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

    if (painError) {
      console.error(`[${requestId}] Pain entries error:`, painError);
      throw painError;
    }

    console.log(`[${requestId}] Pain entries fetched: ${painEntries?.length || 0}`);

    // Fetch medication courses for before/after analysis
    const { data: medicationCourses } = await supabase
      .from('medication_courses')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: true });

    console.log(`[${requestId}] Medication courses fetched: ${medicationCourses?.length || 0}`);

    // Structure entries for analysis
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

    // Combine all data
    const allData = [
      ...structuredEntries,
      ...(voiceNotes || []).map(n => ({
        date: new Date(n.occurred_at).toISOString().split('T')[0],
        time: new Date(n.occurred_at).toISOString().split('T')[1].substring(0, 5),
        type: 'voice_note' as const,
        text: n.text
      }))
    ].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

    // No data case
    if (allData.length === 0) {
      console.log(`[${requestId}] No data found in range`);
      return new Response(JSON.stringify({ 
        requestId,
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

    // Build medication courses summary for prompt
    let medicationCoursesSummary = '';
    if (medicationCourses && medicationCourses.length > 0) {
      const prophylaxeCourses = medicationCourses.filter(c => c.type === 'prophylaxe');
      if (prophylaxeCourses.length > 0) {
        medicationCoursesSummary = `\n\n💊 PROPHYLAXE-VERLÄUFE:\n${prophylaxeCourses.map(c => {
          const status = c.is_active ? 'aktiv' : `beendet am ${c.end_date || 'unbekannt'}`;
          const effectiveness = c.subjective_effectiveness !== null 
            ? ` (Selbstbewertung: ${c.subjective_effectiveness}/10)` 
            : '';
          return `  • ${c.medication_name}: ${c.dose_text || 'Dosis nicht angegeben'}, Start: ${c.start_date || 'unbekannt'}, Status: ${status}${effectiveness}`;
        }).join('\n')}`;
      }
    }

    // Build tags summary
    const tagsSummary = topTags.length > 0 
      ? `\n\n🏷️ HÄUFIGSTE KONTEXT-TAGS:\n${topTags.map(t => `  • ${t.label}: ${t.count}x erkannt`).join('\n')}`
      : '';
    
    const hashtagsSummary = topHashtags.length > 0
      ? `\n\n#️⃣ HASHTAGS:\n${topHashtags.map(h => `  • ${h.tag}: ${h.count}x`).join('\n')}`
      : '';

    // Build data text (with limits to prevent prompt overflow)
    const MAX_DATA_ENTRIES = 200;
    const limitedData = allData.slice(-MAX_DATA_ENTRIES); // Take most recent
    
    const dataText = limitedData.map(d => {
      if ('type' in d && d.type === 'voice_note') {
        const noteTags = extractTags(d.text);
        const noteHashtags = extractHashtags(d.text);
        const tagsStr = noteTags.length > 0 
          ? ` [Tags: ${noteTags.map(t => TAG_LABELS[t.tag] || t.tag).join(', ')}]` 
          : '';
        const hashtagsStr = noteHashtags.length > 0 
          ? ` ${noteHashtags.join(' ')}` 
          : '';
        return `[${d.date} ${d.time}] 📝 NOTIZ: ${d.text.substring(0, 200)}${d.text.length > 200 ? '...' : ''}${tagsStr}${hashtagsStr}`;
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
        entry += `\n  💬 Notiz: ${d.notes.substring(0, 150)}${d.notes.length > 150 ? '...' : ''}`;
      }
      
      return entry;
    }).join('\n\n');

    const hasWeatherData = structuredEntries.some(e => e.weather !== null);

    // Check for LLM API key
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // If no API key, return deterministic analysis
    if (!LOVABLE_API_KEY) {
      console.log(`[${requestId}] No LOVABLE_API_KEY, returning deterministic analysis`);
      
      const deterministicInsights = buildDeterministicInsights(
        structuredEntries, 
        allTags, 
        topTags, 
        medicationCourses || [],
        fromDate,
        toDate
      );
      
      return new Response(JSON.stringify({
        requestId,
        insights: deterministicInsights,
        analyzed_entries: painEntries?.length || 0,
        voice_notes_count: voiceNotes?.length || 0,
        total_analyzed: allData.length,
        has_weather_data: hasWeatherData,
        date_range: { from: fromDate.split('T')[0], to: toDate.split('T')[0] },
        ai_available: false,
        tags: {
          total_tags: allTags.length,
          unique_tags: topTags.length,
          top_tags: topTags,
          top_hashtags: topHashtags,
          tags_by_category: buildTagsByCategory(allTags)
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build prompt based on mode (FIX: use requestBody.mode, not validatedBody)
    let prompt: string;
    let systemMessage: string;
    
    if (mode === 'doctor_summary') {
      systemMessage = 'Sie sind ein medizinischer Assistent für Fachpersonal. Schreiben Sie präzise, faktisch und kompakt.';
      prompt = `Sie erhalten Migräne-Daten (${allData.length} Einträge von ${fromDate.split('T')[0]} bis ${toDate.split('T')[0]}) für eine KOMPAKTE ärztliche Zusammenfassung.

DATENSATZ:

${dataText}${tagsSummary}${hashtagsSummary}${medicationCoursesSummary}

AUFGABE:
Erstellen Sie eine KOMPAKTE Zusammenfassung (80-120 Wörter) für medizinisches Fachpersonal.

FOKUS: Nur Muster, die NICHT offensichtlich aus Rohdaten erkennbar sind:
• Wetter-Trigger (z.B. Luftdruckabfall >5 hPa/24h)
• Kontext-Faktoren aus Tags/Notizen mit zeitlichem Zusammenhang
• Temporale Muster (z.B. Tageszeit-Cluster)
• Prophylaxe-Wirkung (vorher/nachher Vergleich falls Daten vorhanden)

FORMAT:
• Stichpunktartig, keine Einleitung
• 2-3 konkrete Handlungsempfehlungen
• Medizinisch präzise, aber ohne Fachjargon`;
    } else {
      systemMessage = 'Sie sind ein hilfreicher Assistent für Kopfschmerz-Musteranalyse. Schreiben Sie klar, verständlich und verwenden Sie die Höflichkeitsform "Sie". Dies ist KEINE medizinische Beratung, sondern eine private Datenauswertung.';
      prompt = `Analysieren Sie diese Kopfschmerz-Daten (${allData.length} Einträge von ${fromDate.split('T')[0]} bis ${toDate.split('T')[0]}) für eine KI-MUSTER-ANALYSE.

DATENSATZ:

${dataText}${tagsSummary}${hashtagsSummary}${medicationCoursesSummary}

AUFGABE:
Erstellen Sie eine strukturierte Muster-Analyse für den Nutzer. WICHTIG: Dies ist eine PRIVATE Datenauswertung, KEIN ärztlicher Rat.

INHALTLICHE STRUKTUR (ca. 200-300 Wörter):

**📊 Zusammenfassung**
- Kurze Übersicht: Anzahl Episoden, Zeitraum, allgemeine Tendenz

**🔍 Erkannte Muster**
- Tageszeit-Muster (falls erkennbar)
- Wetter-Zusammenhänge (Luftdruck, Temperatur falls Daten vorhanden)
- Kontext-Faktoren aus Tags (Schlaf, Stress, etc.)

**⚡ Mögliche Trigger**
- Was verschlechtert? (basierend auf Daten, nicht Spekulation)
- Vorsichtige Formulierung: "scheint zusammenzuhängen", "tritt häufig auf"

**✅ Was zu helfen scheint**
- Medikamente mit positiver Wirkung
- Faktoren die mit weniger Episoden korrelieren

${medicationCourses && medicationCourses.length > 0 ? `
**📈 Prophylaxe-Verlauf**
- Vergleich vor/nach Therapiebeginn (falls genug Daten)
- Subjektive Wirksamkeit aus Nutzer-Angaben
` : ''}

**💡 Hinweise**
- 2-3 konkrete Beobachtungen für Selbst-Tracking
- Hinweis: Dies ersetzt keine ärztliche Beratung

FORMATIERUNG:
- Gut lesbares Markdown
- Keine Rohdaten-Listen oder technische Timestamps
- Deutsche Datumsformate (dd.MM.yyyy)
- Zahlen sinnvoll runden`;
    }

    console.log(`[${requestId}] Calling AI Gateway, mode: ${mode}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[${requestId}] AI Gateway Error: ${aiResponse.status}`, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          requestId,
          error: 'Rate Limit erreicht. Bitte später erneut versuchen.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          requestId,
          error: 'Guthaben aufgebraucht. Bitte Credits hinzufügen.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Fallback to deterministic if AI fails
      console.log(`[${requestId}] AI failed, falling back to deterministic`);
      const deterministicInsights = buildDeterministicInsights(
        structuredEntries, 
        allTags, 
        topTags, 
        medicationCourses || [],
        fromDate,
        toDate
      );
      
      return new Response(JSON.stringify({
        requestId,
        insights: deterministicInsights + '\n\n*Hinweis: KI-Text war vorübergehend nicht verfügbar.*',
        analyzed_entries: painEntries?.length || 0,
        voice_notes_count: voiceNotes?.length || 0,
        total_analyzed: allData.length,
        has_weather_data: hasWeatherData,
        date_range: { from: fromDate.split('T')[0], to: toDate.split('T')[0] },
        ai_available: false,
        tags: {
          total_tags: allTags.length,
          unique_tags: topTags.length,
          top_tags: topTags,
          top_hashtags: topHashtags,
          tags_by_category: buildTagsByCategory(allTags)
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const insights = aiData.choices[0].message.content;

    console.log(`[${requestId}] AI response received, tokens: ${aiData.usage?.total_tokens || 'unknown'}`);

    // Audit log (non-blocking)
    try {
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'AI_PATTERN_ANALYSIS',
        table_name: 'pain_entries',
        old_data: {
          requestId,
          model: 'gemini-2.5-flash',
          mode,
          voice_notes_count: voiceNotes?.length || 0,
          pain_entries_count: painEntries?.length || 0,
          total_analyzed: allData.length,
          has_weather_data: hasWeatherData,
          tokens: aiData.usage?.total_tokens || 0
        }
      });
    } catch (auditError) {
      // Log but don't fail the request
      console.error(`[${requestId}] Audit log failed (non-fatal):`, auditError);
    }

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Request completed in ${duration}ms`);

    return new Response(JSON.stringify({
      requestId,
      insights,
      analyzed_entries: painEntries?.length || 0,
      voice_notes_count: voiceNotes?.length || 0,
      total_analyzed: allData.length,
      has_weather_data: hasWeatherData,
      date_range: { from: fromDate.split('T')[0], to: toDate.split('T')[0] },
      ai_available: true,
      tags: {
        total_tags: allTags.length,
        unique_tags: topTags.length,
        top_tags: topTags,
        top_hashtags: topHashtags,
        tags_by_category: buildTagsByCategory(allTags)
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return handleError(error, 'analyze-voice-notes', requestId);
  }
});

// Helper to build tags by category
function buildTagsByCategory(allTags: Array<ExtractedTag & { noteText: string; date: string }>) {
  return Object.entries(
    allTags.reduce((acc, tag) => {
      acc[tag.category] = (acc[tag.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([category, count]) => ({ category, count }));
}

// Deterministic insights when AI is unavailable
function buildDeterministicInsights(
  entries: Array<{ date: string; pain_level: string; aura_type: string; medications: string; weather: any }>,
  allTags: ExtractedTag[],
  topTags: Array<{ tag: string; label: string; count: number }>,
  courses: any[],
  fromDate: string,
  toDate: string
): string {
  const totalEntries = entries.length;
  const fromFormatted = new Date(fromDate).toLocaleDateString('de-DE');
  const toFormatted = new Date(toDate).toLocaleDateString('de-DE');
  
  let md = `## 📊 Kopfschmerz-Muster (${fromFormatted} – ${toFormatted})\n\n`;
  md += `**${totalEntries} Einträge** im gewählten Zeitraum.\n\n`;
  
  // Pain level distribution
  const painLevels: Record<string, number> = {};
  entries.forEach(e => {
    painLevels[e.pain_level] = (painLevels[e.pain_level] || 0) + 1;
  });
  
  if (Object.keys(painLevels).length > 0) {
    md += `### Schmerzintensität\n`;
    Object.entries(painLevels)
      .sort(([,a], [,b]) => b - a)
      .forEach(([level, count]) => {
        md += `- ${level}: ${count}x (${Math.round(count/totalEntries*100)}%)\n`;
      });
    md += '\n';
  }
  
  // Top tags
  if (topTags.length > 0) {
    md += `### Häufige Faktoren\n`;
    topTags.slice(0, 5).forEach(t => {
      md += `- ${t.label}: ${t.count}x erkannt\n`;
    });
    md += '\n';
  }
  
  // Medications
  const meds: Record<string, number> = {};
  entries.forEach(e => {
    if (e.medications && e.medications !== 'keine') {
      e.medications.split(',').forEach(m => {
        const name = m.trim();
        if (name) meds[name] = (meds[name] || 0) + 1;
      });
    }
  });
  
  if (Object.keys(meds).length > 0) {
    md += `### Medikamente\n`;
    Object.entries(meds)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([med, count]) => {
        md += `- ${med}: ${count}x verwendet\n`;
      });
    md += '\n';
  }
  
  // Prophylaxe courses
  const prophylaxe = courses.filter(c => c.type === 'prophylaxe');
  if (prophylaxe.length > 0) {
    md += `### Prophylaxe-Verläufe\n`;
    prophylaxe.forEach(c => {
      const status = c.is_active ? '🟢 aktiv' : '⏹️ beendet';
      md += `- **${c.medication_name}** (${c.dose_text || 'Dosis nicht angegeben'}): ${status}`;
      if (c.subjective_effectiveness !== null) {
        md += ` – Selbstbewertung: ${c.subjective_effectiveness}/10`;
      }
      md += '\n';
    });
    md += '\n';
  }
  
  md += `---\n*Diese Auswertung basiert auf Ihren Tracker-Daten. Sie ersetzt keine ärztliche Beratung.*`;
  
  return md;
}
