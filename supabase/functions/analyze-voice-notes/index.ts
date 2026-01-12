import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============== QUOTA CONFIGURATION ==============
const FREE_PATTERN_ANALYSIS_MONTHLY = 5;
const PREMIUM_PATTERN_ANALYSIS_MONTHLY = 30; // For future use
const COOLDOWN_SECONDS = 60;

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
  if (from > now) return false;
  if (to < from) return false;
  const daysDiff = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 730;
}, {
  message: 'Datumsbereich ungültig: fromDate darf nicht in der Zukunft liegen, toDate muss >= fromDate sein, und max. 730 Tage (2 Jahre) Spanne'
});

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

// Structured JSON output schema
interface StructuredAnalysis {
  schemaVersion: number;
  timeRange: { from: string; to: string };
  dataCoverage: {
    entries: number;
    notes: number;
    weatherDays: number;
    medDays: number;
    prophylaxisCourses: number;
  };
  overview: {
    headline: string;
    disclaimer: string;
  };
  keyFindings: Array<{
    title: string;
    finding: string;
    evidence: string;
    confidence: 'low' | 'medium' | 'high';
  }>;
  sections: Array<{
    id: string;
    title: string;
    bullets?: string[];
    evidence?: string[];
    subsections?: Array<{
      title: string;
      bullets: string[];
      evidence?: string[];
    }>;
    beforeAfter?: Array<{
      medication: string;
      window: string;
      before: string;
      after: string;
      note: string;
    }>;
  }>;
  tagsFromNotes: Array<{ tag: string; count: number }>;
}

// User profile with quota fields
interface UserProfile {
  ai_enabled: boolean;
  ai_unlimited: boolean;
}

// Quota usage info
interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  cooldownRemaining: number;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log(`[analyze-voice-notes] [${requestId}] Request started`);

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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey || !serviceRoleKey) {
      console.error(`[${requestId}] Missing Supabase env vars`);
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Server-Konfigurationsfehler'
      }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // User client for auth-scoped reads
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Service role client for cache writes and quota updates
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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

    // ============== PROFILE + QUOTA CHECK ==============
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ai_enabled, ai_unlimited')
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

    const isUnlimited = profile.ai_unlimited === true;
    console.log(`[${requestId}] User quota status: unlimited=${isUnlimited}`);

    // Get current period (calendar month)
    const currentPeriod = new Date().toISOString().slice(0, 7) + '-01'; // YYYY-MM-01

    // Fetch usage for pattern_analysis in current period
    const { data: usageData } = await supabaseAdmin
      .from('user_ai_usage')
      .select('request_count, last_used_at')
      .eq('user_id', user.id)
      .eq('feature', 'pattern_analysis')
      .gte('period_start', currentPeriod)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentUsage = usageData?.request_count ?? 0;
    const lastUsedAt = usageData?.last_used_at ? new Date(usageData.last_used_at) : null;
    const quotaLimit = FREE_PATTERN_ANALYSIS_MONTHLY;

    // Calculate cooldown remaining
    let cooldownRemaining = 0;
    if (lastUsedAt && !isUnlimited) {
      const secondsSinceLastUse = (Date.now() - lastUsedAt.getTime()) / 1000;
      cooldownRemaining = Math.max(0, COOLDOWN_SECONDS - secondsSinceLastUse);
    }

    // Build quota info for response
    const quotaInfo: QuotaInfo = {
      used: currentUsage,
      limit: quotaLimit,
      remaining: isUnlimited ? 999 : Math.max(0, quotaLimit - currentUsage),
      isUnlimited,
      cooldownRemaining: Math.ceil(cooldownRemaining)
    };

    // ============== COOLDOWN CHECK (only for non-unlimited) ==============
    if (!isUnlimited && cooldownRemaining > 0) {
      console.log(`[${requestId}] Cooldown active: ${cooldownRemaining}s remaining`);
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Bitte warte kurz, bevor du erneut analysierst.',
        errorCode: 'COOLDOWN',
        cooldownRemaining: Math.ceil(cooldownRemaining),
        quota: quotaInfo
      }), { 
        status: 429, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ============== QUOTA CHECK (only for non-unlimited) ==============
    if (!isUnlimited && currentUsage >= quotaLimit) {
      console.log(`[${requestId}] Quota exhausted: ${currentUsage}/${quotaLimit}`);
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Monatliches Analyselimit erreicht. Nächsten Monat stehen dir wieder Analysen zur Verfügung.',
        errorCode: 'QUOTA_EXCEEDED',
        quota: quotaInfo
      }), { 
        status: 429, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ============== CACHE CHECK ==============
    // Get latest updated_at from relevant source tables
    const { data: latestPainEntry } = await supabase
      .from('pain_entries')
      .select('timestamp_created')
      .eq('user_id', user.id)
      .gte('timestamp_created', fromDate)
      .lte('timestamp_created', toDate)
      .order('timestamp_created', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: latestVoiceNote } = await supabase
      .from('voice_notes')
      .select('captured_at')
      .eq('user_id', user.id)
      .gte('occurred_at', fromDate)
      .lte('occurred_at', toDate)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Determine latest source update
    const painTs = latestPainEntry?.timestamp_created ? new Date(latestPainEntry.timestamp_created).getTime() : 0;
    const voiceTs = latestVoiceNote?.captured_at ? new Date(latestVoiceNote.captured_at).getTime() : 0;
    const latestSourceUpdatedAt = new Date(Math.max(painTs, voiceTs, 1));

    // Build cache key
    const fromDateStr = fromDate.split('T')[0];
    const toDateStr = toDate.split('T')[0];
    const cacheKey = `${user.id}:${fromDateStr}:${toDateStr}:${latestSourceUpdatedAt.toISOString()}`;

    console.log(`[${requestId}] Cache key: ${cacheKey}`);

    // Check for cached result
    const { data: cachedResult } = await supabase
      .from('ai_analysis_cache')
      .select('response_json, created_at')
      .eq('user_id', user.id)
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cachedResult) {
      console.log(`[${requestId}] Cache HIT - returning cached result from ${cachedResult.created_at}`);
      
      // Return cached result without consuming quota
      const duration = Date.now() - startTime;
      console.log(`[${requestId}] Request completed (cached) in ${duration}ms`);

      return new Response(JSON.stringify({
        ...cachedResult.response_json,
        requestId,
        cached: true,
        cachedAt: cachedResult.created_at,
        quota: quotaInfo
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${requestId}] Cache MISS - proceeding with analysis`);

    // ============== DATA FETCHING ==============
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
        pain_locations,
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

    // Fetch medication courses
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
      
      const painLocations = entry.pain_locations;
      const painLocationDisplay = Array.isArray(painLocations) && painLocations.length > 0 
        ? painLocations.join(', ') 
        : 'nicht angegeben';
      
      return {
        date,
        time,
        pain_level: entry.pain_level,
        aura_type: entry.aura_type,
        pain_location: painLocationDisplay,
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

    // Count weather and med days
    const weatherDays = new Set(structuredEntries.filter(e => e.weather).map(e => e.date)).size;
    const medDays = new Set(structuredEntries.filter(e => e.medications !== 'keine').map(e => e.date)).size;
    const prophylaxeCourses = (medicationCourses || []).filter(c => c.type === 'prophylaxe');

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
      const emptyResult: StructuredAnalysis = {
        schemaVersion: 1,
        timeRange: { from: fromDate.split('T')[0], to: toDate.split('T')[0] },
        dataCoverage: { entries: 0, notes: 0, weatherDays: 0, medDays: 0, prophylaxisCourses: 0 },
        overview: { headline: 'Keine Daten', disclaimer: 'Keine Daten im gewählten Zeitraum gefunden.' },
        keyFindings: [],
        sections: [],
        tagsFromNotes: []
      };
      return new Response(JSON.stringify({ 
        requestId,
        structured: emptyResult,
        analyzed_entries: 0,
        voice_notes_count: 0,
        total_analyzed: 0,
        has_weather_data: false,
        date_range: { from: fromDate.split('T')[0], to: toDate.split('T')[0] },
        quota: quotaInfo
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Build data for AI prompt (limited)
    const MAX_DATA_ENTRIES = 200;
    const limitedData = allData.slice(-MAX_DATA_ENTRIES);
    
    const dataText = limitedData.map(d => {
      if ('type' in d && d.type === 'voice_note') {
        return `[${d.date} ${d.time}] NOTIZ: ${d.text.substring(0, 200)}`;
      }
      let entry = `[${d.date} ${d.time}] EINTRAG: Schmerz=${d.pain_level}, Aura=${d.aura_type}, Ort=${d.pain_location}, Medikamente=${d.medications}`;
      if (d.weather) {
        entry += ` | Wetter: ${d.weather.temp}C, ${d.weather.pressure}hPa${d.weather.pressure_change ? ` (24h: ${d.weather.pressure_change > 0 ? '+' : ''}${d.weather.pressure_change})` : ''}, ${d.weather.humidity}%`;
      }
      if (d.notes) entry += ` | Notiz: ${d.notes.substring(0, 100)}`;
      return entry;
    }).join('\n');

    const hasWeatherData = structuredEntries.some(e => e.weather !== null);

    // Build medication courses summary
    let coursesSummary = '';
    if (prophylaxeCourses.length > 0) {
      coursesSummary = '\n\nPROPHYLAXE-VERLÄUFE:\n' + prophylaxeCourses.map(c => {
        const status = c.is_active ? 'aktiv' : `beendet ${c.end_date || ''}`;
        return `- ${c.medication_name}: ${c.dose_text || ''}, Start: ${c.start_date || '?'}, Status: ${status}${c.subjective_effectiveness !== null ? `, Bewertung: ${c.subjective_effectiveness}/10` : ''}`;
      }).join('\n');
    }

    // Tags summary
    const tagsSummary = topTags.length > 0 
      ? '\n\nERKANNTE KONTEXT-TAGS:\n' + topTags.map(t => `- ${t.label}: ${t.count}x`).join('\n')
      : '';

    // Check for LLM API key
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Build deterministic analysis as fallback
    const deterministicResult = buildDeterministicStructured(
      structuredEntries,
      topTags,
      prophylaxeCourses,
      fromDate,
      toDate,
      weatherDays,
      medDays
    );
    
    let finalResult: StructuredAnalysis;
    let aiAvailable = false;

    if (!LOVABLE_API_KEY) {
      console.log(`[${requestId}] No LOVABLE_API_KEY, using deterministic analysis`);
      finalResult = deterministicResult;
    } else {
      // ============== AI ANALYSIS ==============
      const jsonSchema = `{
  "schemaVersion": 1,
  "timeRange": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "dataCoverage": { "entries": number, "notes": number, "weatherDays": number, "medDays": number, "prophylaxisCourses": number },
  "overview": { "headline": "kurze Überschrift", "disclaimer": "Private Auswertung, keine medizinische Beratung." },
  "keyFindings": [{ "title": "Kurztitel", "finding": "Haupterkenntnis", "evidence": "Datenbasis", "confidence": "low|medium|high" }],
  "sections": [
    { "id": "timeOfDay", "title": "Tageszeit-Muster", "bullets": ["..."], "evidence": ["..."] },
    { "id": "weather", "title": "Wetter", "subsections": [{ "title": "Luftdruck", "bullets": ["..."], "evidence": ["..."] }] },
    { "id": "medication", "title": "Medikation", "bullets": ["..."], "beforeAfter": [{ "medication": "Name", "window": "8 Wochen", "before": "...", "after": "...", "note": "n=..." }] },
    { "id": "dataQuality", "title": "Datenlage", "bullets": ["..."] }
  ],
  "tagsFromNotes": [{ "tag": "Label", "count": number }]
}`;

      const systemMessage = `Du bist ein Kopfschmerz-Musteranalyse-System. Antworte NUR mit validem JSON im exakten Schema.

REGELN:
- Keine Emojis
- Keine Begrüßungen oder Floskeln
- Sachlich und faktisch
- Kurze Bulletpoints statt langer Absätze
- Jede Behauptung mit evidence-Satz belegen
- Deutsche Sprache
- Keine medizinischen Empfehlungen

JSON-SCHEMA:
${jsonSchema}`;

      const prompt = `Analysiere diese Kopfschmerz-Daten (${allData.length} Einträge, ${fromDate.split('T')[0]} bis ${toDate.split('T')[0]}).

DATENSATZ:
${dataText}${tagsSummary}${coursesSummary}

AUFGABE:
Erstelle eine strukturierte Musteranalyse als JSON. Fokus auf:
1. Tageszeit-Muster (wann treten Kopfschmerzen auf?)
2. Wetter-Zusammenhänge (Luftdruck, Temperatur, falls Daten vorhanden)
3. Kontext-Faktoren (Tags: Schlaf, Stress, etc.)
4. Medikationsmuster (was wird genommen, was hilft?)
5. Prophylaxe vor/nach (falls Kurse vorhanden)
6. Datenlage-Einschätzung (wie belastbar sind die Muster?)

keyFindings: 3-5 wichtigste Erkenntnisse
sections: Thematische Abschnitte mit Bulletpoints
tagsFromNotes: Die erkannten Kontext-Tags mit Anzahl

Antworte NUR mit dem JSON-Objekt, kein Markdown-Wrapper.`;

      console.log(`[${requestId}] Calling AI Gateway`);

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
            error: 'Rate Limit erreicht. Bitte später erneut versuchen.',
            quota: quotaInfo
          }), {
            status: 429, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ 
            requestId, 
            error: 'Guthaben aufgebraucht. Bitte Credits hinzufügen.',
            quota: quotaInfo
          }), {
            status: 402, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Fallback to deterministic
        console.log(`[${requestId}] AI failed, falling back to deterministic`);
        finalResult = deterministicResult;
      } else {
        const aiData = await aiResponse.json();
        let aiContent = aiData.choices[0].message.content;
        
        console.log(`[${requestId}] AI response received, tokens: ${aiData.usage?.total_tokens || 'unknown'}`);

        // Parse JSON from AI response
        try {
          aiContent = aiContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          finalResult = JSON.parse(aiContent);
          
          finalResult.schemaVersion = 1;
          finalResult.timeRange = { from: fromDate.split('T')[0], to: toDate.split('T')[0] };
          finalResult.dataCoverage = {
            entries: painEntries?.length || 0,
            notes: voiceNotes?.length || 0,
            weatherDays,
            medDays,
            prophylaxisCourses: prophylaxeCourses.length
          };
          
          if (!finalResult.tagsFromNotes || finalResult.tagsFromNotes.length === 0) {
            finalResult.tagsFromNotes = topTags.map(t => ({ tag: t.label, count: t.count }));
          }
          
          aiAvailable = true;
        } catch (parseError) {
          console.error(`[${requestId}] Failed to parse AI JSON:`, parseError);
          console.error(`[${requestId}] Raw AI content:`, aiContent.substring(0, 500));
          
          finalResult = {
            ...deterministicResult,
            overview: {
              ...deterministicResult.overview,
              headline: 'Musteranalyse (Fallback)'
            }
          };
        }
      }
    }

    // ============== UPDATE QUOTA (only if not from cache and not unlimited) ==============
    if (!isUnlimited) {
      const now = new Date().toISOString();
      
      // Upsert usage record - IMPORTANT: onConflict must match the DB unique constraint
      // DB has: UNIQUE (user_id, feature, period_start) for monthly quota tracking
      const { error: usageError } = await supabaseAdmin
        .from('user_ai_usage')
        .upsert({
          user_id: user.id,
          feature: 'pattern_analysis',
          period_start: currentPeriod,
          request_count: currentUsage + 1,
          last_used_at: now,
          updated_at: now
        }, {
          onConflict: 'user_id,feature,period_start',
          ignoreDuplicates: false
        });

      if (usageError) {
        console.error(`[${requestId}] Failed to update usage:`, usageError);
        // Non-fatal - continue anyway
      } else {
        console.log(`[${requestId}] Usage updated: ${currentUsage + 1}/${quotaLimit}`);
      }

      // Update quota info for response
      quotaInfo.used = currentUsage + 1;
      quotaInfo.remaining = Math.max(0, quotaLimit - (currentUsage + 1));
    }

    // ============== CACHE RESULT ==============
    const responsePayload = {
      requestId,
      structured: finalResult,
      analyzed_entries: painEntries?.length || 0,
      voice_notes_count: voiceNotes?.length || 0,
      total_analyzed: allData.length,
      has_weather_data: hasWeatherData,
      date_range: { from: fromDate.split('T')[0], to: toDate.split('T')[0] },
      ai_available: aiAvailable,
      tags: {
        total_tags: allTags.length,
        unique_tags: topTags.length,
        top_tags: topTags,
        top_hashtags: topHashtags
      }
    };

    // Store in cache (using service role)
    const { error: cacheError } = await supabaseAdmin
      .from('ai_analysis_cache')
      .upsert({
        user_id: user.id,
        cache_key: cacheKey,
        feature: 'pattern_analysis',
        from_date: fromDateStr,
        to_date: toDateStr,
        latest_source_updated_at: latestSourceUpdatedAt.toISOString(),
        response_json: responsePayload,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,cache_key'
      });

    if (cacheError) {
      console.error(`[${requestId}] Cache write failed (non-fatal):`, cacheError);
    } else {
      console.log(`[${requestId}] Result cached`);
    }

    // ============== PERSIST TO AI_REPORTS (only for real LLM calls) ==============
    if (aiAvailable) {
      // Generate dedupe_key: hash of user_id + report_type + from_date + to_date + latest_source_updated_at
      const dedupeKey = `${user.id}:pattern_analysis:${fromDateStr}:${toDateStr}:${latestSourceUpdatedAt.toISOString()}`;
      
      // Format title
      const fromFormatted = new Date(fromDate).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
      const toFormatted = new Date(toDate).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
      const reportTitle = `KI-Analysebericht: ${fromFormatted} – ${toFormatted}`;
      
      // Upsert into ai_reports
      const { error: reportError } = await supabaseAdmin
        .from('ai_reports')
        .upsert({
          user_id: user.id,
          report_type: 'pattern_analysis',
          title: reportTitle,
          from_date: fromDateStr,
          to_date: toDateStr,
          source: 'analysis_view',
          input_summary: {
            entries_count: painEntries?.length || 0,
            notes_count: voiceNotes?.length || 0,
            weather_days: weatherDays,
            med_days: medDays,
            prophylaxis_courses: prophylaxeCourses.length
          },
          response_json: responsePayload,
          model: 'google/gemini-2.5-flash',
          dedupe_key: dedupeKey,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,dedupe_key'
        });

      if (reportError) {
        console.error(`[${requestId}] AI Report save failed (non-fatal):`, reportError);
      } else {
        console.log(`[${requestId}] AI Report saved/updated with dedupe_key`);
      }
    }

    // Audit log (non-blocking)
    try {
      await supabaseAdmin.from('audit_logs').insert({
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
          quota_used: quotaInfo.used,
          quota_limit: quotaInfo.limit,
          is_unlimited: isUnlimited,
          report_saved: aiAvailable
        }
      });
    } catch (auditError) {
      console.error(`[${requestId}] Audit log failed (non-fatal):`, auditError);
    }

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Request completed in ${duration}ms`);

    return new Response(JSON.stringify({
      ...responsePayload,
      quota: quotaInfo
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${requestId}] Unhandled error:`, error);
    return new Response(JSON.stringify({ 
      requestId,
      error: error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Build deterministic structured analysis
function buildDeterministicStructured(
  entries: Array<{ date: string; time: string; pain_level: string; aura_type: string; medications: string; weather: any }>,
  topTags: Array<{ tag: string; label: string; count: number }>,
  courses: any[],
  fromDate: string,
  toDate: string,
  weatherDays: number,
  medDays: number
): StructuredAnalysis {
  const totalEntries = entries.length;
  const fromFormatted = new Date(fromDate).toLocaleDateString('de-DE');
  const toFormatted = new Date(toDate).toLocaleDateString('de-DE');
  
  // Pain level distribution
  const painLevels: Record<string, number> = {};
  entries.forEach(e => {
    painLevels[e.pain_level] = (painLevels[e.pain_level] || 0) + 1;
  });
  
  // Time distribution
  const hourBuckets: Record<string, number> = { 'Morgen (6-12)': 0, 'Mittag (12-18)': 0, 'Abend (18-24)': 0, 'Nacht (0-6)': 0 };
  entries.forEach(e => {
    const hour = parseInt(e.time.split(':')[0], 10);
    if (hour >= 6 && hour < 12) hourBuckets['Morgen (6-12)']++;
    else if (hour >= 12 && hour < 18) hourBuckets['Mittag (12-18)']++;
    else if (hour >= 18) hourBuckets['Abend (18-24)']++;
    else hourBuckets['Nacht (0-6)']++;
  });
  
  const topTimeSlot = Object.entries(hourBuckets).sort(([,a], [,b]) => b - a)[0];
  
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
  
  const topMeds = Object.entries(meds).sort(([,a], [,b]) => b - a).slice(0, 5);

  // Build key findings
  const keyFindings: StructuredAnalysis['keyFindings'] = [];
  
  if (topTimeSlot && topTimeSlot[1] > 0) {
    keyFindings.push({
      title: 'Tageszeit',
      finding: `Häufigste Kopfschmerzen: ${topTimeSlot[0]}`,
      evidence: `${topTimeSlot[1]} von ${totalEntries} Einträgen`,
      confidence: topTimeSlot[1] >= 5 ? 'high' : 'medium'
    });
  }
  
  if (topMeds.length > 0) {
    keyFindings.push({
      title: 'Medikation',
      finding: `Meist verwendet: ${topMeds[0][0]}`,
      evidence: `${topMeds[0][1]}x im Zeitraum`,
      confidence: 'high'
    });
  }
  
  if (topTags.length > 0) {
    keyFindings.push({
      title: 'Kontext',
      finding: `Häufiger Faktor: ${topTags[0].label}`,
      evidence: `${topTags[0].count}x erkannt`,
      confidence: topTags[0].count >= 3 ? 'medium' : 'low'
    });
  }

  // Build sections
  const sections: StructuredAnalysis['sections'] = [];
  
  // Time section
  sections.push({
    id: 'timeOfDay',
    title: 'Tageszeit-Muster',
    bullets: Object.entries(hourBuckets)
      .filter(([, count]) => count > 0)
      .sort(([,a], [,b]) => b - a)
      .map(([slot, count]) => `${slot}: ${count} Einträge (${Math.round(count/totalEntries*100)}%)`),
    evidence: [`Basierend auf ${totalEntries} Einträgen`]
  });
  
  // Medication section
  if (topMeds.length > 0) {
    sections.push({
      id: 'medication',
      title: 'Medikation',
      bullets: topMeds.map(([med, count]) => `${med}: ${count}x verwendet`),
      beforeAfter: courses.filter(c => c.type === 'prophylaxe').map(c => ({
        medication: c.medication_name,
        window: 'Gesamtzeitraum',
        before: c.start_date ? `Start: ${new Date(c.start_date).toLocaleDateString('de-DE')}` : 'Startdatum unbekannt',
        after: c.is_active ? 'Läuft noch' : `Beendet: ${c.end_date ? new Date(c.end_date).toLocaleDateString('de-DE') : 'unbekannt'}`,
        note: c.subjective_effectiveness !== null ? `Selbstbewertung: ${c.subjective_effectiveness}/10` : 'Keine Bewertung'
      }))
    });
  }
  
  // Weather section (if data available)
  if (weatherDays > 0) {
    sections.push({
      id: 'weather',
      title: 'Wetter',
      bullets: [`${weatherDays} Tage mit Wetterdaten erfasst`],
      evidence: ['Detaillierte Wetter-Korrelationen erfordern mehr Datenpunkte']
    });
  }
  
  // Data quality section
  sections.push({
    id: 'dataQuality',
    title: 'Datenlage',
    bullets: [
      `${totalEntries} Einträge im Zeitraum ${fromFormatted} bis ${toFormatted}`,
      `${weatherDays} Tage mit Wetterdaten`,
      `${medDays} Tage mit Medikamenteneinnahme`,
      `${courses.filter(c => c.type === 'prophylaxe').length} Prophylaxe-Verläufe dokumentiert`
    ]
  });

  return {
    schemaVersion: 1,
    timeRange: { from: fromDate.split('T')[0], to: toDate.split('T')[0] },
    dataCoverage: {
      entries: totalEntries,
      notes: 0,
      weatherDays,
      medDays,
      prophylaxisCourses: courses.filter(c => c.type === 'prophylaxe').length
    },
    overview: {
      headline: 'Musteranalyse',
      disclaimer: 'Private Auswertung, keine medizinische Beratung.'
    },
    keyFindings,
    sections,
    tagsFromNotes: topTags.map(t => ({ tag: t.label, count: t.count }))
  };
}
