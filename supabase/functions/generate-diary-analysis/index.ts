import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema for date range requests
const DiaryAnalysisRequestSchema = z.object({
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
  
  // Check: Max 365 days range
  const daysDiff = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 365;
}, {
  message: 'Datumsbereich ungültig: fromDate darf nicht in der Zukunft liegen, toDate muss >= fromDate sein, und max. 365 Tage Spanne'
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

  // Check for AI analysis disabled
  if (errorMessage.includes('ai-analyse') && errorMessage.includes('deaktiviert')) {
    return new Response(JSON.stringify({ 
      error: 'AI-Analyse ist in den Einstellungen deaktiviert'
    }), {
      status: 403,
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate request body
    let requestBody: z.infer<typeof DiaryAnalysisRequestSchema>;
    try {
      const rawBody = await req.json();
      requestBody = DiaryAnalysisRequestSchema.parse(rawBody);
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

    // Fetch pain entries with weather data
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
          condition_text
        )
      `)
      .eq('user_id', user.id)
      .gte('timestamp_created', fromDate)
      .lte('timestamp_created', toDate)
      .order('timestamp_created', { ascending: true });

    if (painError) throw painError;

    if (!painEntries || painEntries.length === 0) {
      return new Response(JSON.stringify({ 
        report: 'Keine Einträge im gewählten Zeitraum gefunden.',
        analyzed_entries: 0
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Structure data for LLM analysis
    const structuredEntries = painEntries.map(entry => {
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
          condition: weather.condition_text
        } : null
      };
    });

    // Build detailed data text for LLM
    const dataText = structuredEntries.map(d => {
      let entry = `[${d.date} ${d.time}] Schmerzlevel: ${d.pain_level}, Aura: ${d.aura_type}, Lokalisation: ${d.pain_location}, Medikamente: ${d.medications}`;
      
      if (d.weather) {
        entry += `, Wetter: ${d.weather.temp}°C, ${d.weather.pressure} hPa${d.weather.pressure_change ? ` (Δ: ${d.weather.pressure_change} hPa)` : ''}, ${d.weather.humidity}% Luftfeuchtigkeit`;
      }
      
      if (d.notes) {
        entry += `, Notiz: ${d.notes}`;
      }
      
      return entry;
    }).join('\n');

    const hasWeatherData = structuredEntries.some(e => e.weather !== null);

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY nicht konfiguriert');

    const prompt = `Erstellen Sie einen professionellen, medizinisch-fundierten Analysebericht für Migränedaten.

DATENSATZ (${painEntries.length} Einträge von ${fromDate.split('T')[0]} bis ${toDate.split('T')[0]}):

${dataText}

ANFORDERUNGEN:

1. **Professioneller medizinischer Ton**: Schreiben Sie sachlich, präzise und fachlich fundiert, aber dennoch verständlich für Laien.

2. **Struktur** (insgesamt 200-280 Wörter):
   - **Überschrift**: "Medizinischer Analysebericht"
   - **Zusammenfassung**: Ein Absatz mit den wichtigsten Befunden (Häufigkeit, Intensität, Zeitraum)
   - **Musteranalyse**: Ein Absatz zu erkennbaren Mustern (zeitlich, meteorologisch, symptomatisch)
   - **Therapeutische Aspekte**: Ein Absatz zur Medikamentennutzung und deren Wirksamkeit
   - **Klinische Beobachtungen**: Besonderheiten wie Aura-Prävalenz, Schmerzlokalisation, Begleitsymptome
   - **Empfehlungen**: 3-4 konkrete, fachlich fundierte Empfehlungen für das Arztgespräch

3. **Zahlenformat**:
   - Verwenden Sie deutsche Datumsangaben (z.B. "04.10.2025" oder "4. Oktober 2025")
   - Runden Sie Werte sinnvoll (ganze hPa, °C, Prozent)
   - Keine technischen Zeitstempel oder übermäßig präzise Dezimalzahlen

4. **Fachliche Genauigkeit**:
   - Nennen Sie konkrete Werte und Häufigkeiten
   - Identifizieren Sie statistisch relevante Korrelationen (z.B. "In 65% der Fälle...")
   - Verwenden Sie medizinische Fachbegriffe wo angebracht, aber erklären Sie diese

5. **Medizinischer Disclaimer**:
   - Schließen Sie mit einem kurzen Hinweis ab, dass dies eine datenbasierte Auswertung ist, die das ärztliche Gespräch unterstützen, aber nicht ersetzen soll

Formatieren Sie die Antwort in gut strukturiertem Markdown mit klaren Überschriften.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Sie sind ein medizinischer Fachassistent, der professionelle Analyseberichte für Migränepatienten erstellt. Ihre Berichte sind präzise, faktenbasiert und folgen medizinischen Standards.' },
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
    const report = aiData.choices[0].message.content;

    // Log metadata only
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'DIARY_ANALYSIS',
      table_name: 'pain_entries',
      old_data: {
        model: 'gemini-2.5-flash',
        entries_count: painEntries.length,
        has_weather_data: hasWeatherData,
        tokens: aiData.usage?.total_tokens || 0
      }
    });

    return new Response(JSON.stringify({
      report,
      analyzed_entries: painEntries.length,
      has_weather_data: hasWeatherData,
      date_range: { from: fromDate.split('T')[0], to: toDate.split('T')[0] }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return handleError(error, 'generate-diary-analysis');
  }
});
