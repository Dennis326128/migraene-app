import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============== QUOTA CONFIGURATION ==============
const FREE_DIARY_REPORT_MONTHLY = 5;
const COOLDOWN_SECONDS = 60;
const FEATURE_NAME = 'diary_report';

// Date-only regex: YYYY-MM-DD
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Validation schema - only accepts date-only format (YYYY-MM-DD)
const RequestSchema = z.object({
  fromDate: z.string().regex(DATE_ONLY_REGEX, { message: 'fromDate muss YYYY-MM-DD Format haben' }),
  toDate: z.string().regex(DATE_ONLY_REGEX, { message: 'toDate muss YYYY-MM-DD Format haben' }),
  includeStats: z.boolean().optional().default(true),
  includeTherapies: z.boolean().optional().default(true),
  includeEntryNotes: z.boolean().optional().default(true),
  includeContextNotes: z.boolean().optional().default(false),
}).refine(data => {
  // Parse as local dates (no timezone conversion)
  const from = new Date(data.fromDate + 'T00:00:00');
  const to = new Date(data.toDate + 'T00:00:00');
  const now = new Date();
  if (from > now) return false;
  if (to < from) return false;
  const daysDiff = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 730;
}, {
  message: 'Datumsbereich ungültig: max. 730 Tage (2 Jahre)'
});

// Debug flag for timezone warnings (set DEBUG_TZ=1 to enable verbose logging)
const DEBUG_TZ = Deno.env.get('DEBUG_TZ') === '1';

// Helper: Get Europe/Berlin UTC offset for a given UTC instant (handles DST)
// Returns offset in minutes (e.g., +60 for CET, +120 for CEST)
// Robust parsing handles: "GMT+1", "GMT+01:00", "UTC+2", "GMT-5", etc.
function getBerlinOffsetMinutes(utcDate: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      timeZoneName: 'shortOffset'
    });
    const parts = formatter.formatToParts(utcDate);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    
    if (!tzPart) {
      if (DEBUG_TZ) console.warn('[getBerlinOffsetMinutes] No timeZoneName part found, defaulting to CET (+60)');
      return 60;
    }
    
    // Robust regex: handles GMT+1, GMT+01:00, UTC+2, GMT-05:00, etc.
    const match = tzPart.value.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (match) {
      const sign = match[1] === '+' ? 1 : -1;
      const hours = parseInt(match[2], 10);
      const mins = match[3] ? parseInt(match[3], 10) : 0;
      return sign * (hours * 60 + mins);
    }
    
    if (DEBUG_TZ) console.warn(`[getBerlinOffsetMinutes] Failed to parse offset from "${tzPart.value}", defaulting to CET (+60)`);
    return 60;
  } catch (err) {
    if (DEBUG_TZ) console.warn('[getBerlinOffsetMinutes] Exception during offset calculation:', err);
    return 60;
  }
}

// Helper: Format a UTC Date to Berlin local time and extract HH:MM deterministically
// Uses formatToParts with en-GB locale to ensure consistent "00" padding
function getBerlinTimeHHMM(utcDate: Date): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(utcDate);
  const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00';
  // Ensure zero-padding (should already be 2-digit, but be defensive)
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

/**
 * Convert a date string (YYYY-MM-DD) to the UTC ISO timestamp that represents
 * exactly 00:00:00 in Europe/Berlin timezone on that date.
 * 
 * Uses multi-pass approach to handle DST transitions correctly:
 * 1. Start with probe at UTC midnight
 * 2. Get Berlin offset at that probe time
 * 3. Compute first approximation of actual UTC
 * 4. Re-check Berlin offset at the approximation (may differ due to DST)
 * 5. If still not 00:00 in Berlin, do a third pass
 * 6. Validate final result is actually Berlin midnight
 * 
 * Example: 2026-01-12 in Berlin (CET, UTC+1)
 * - Berlin 00:00:00+01:00 = 2026-01-11T23:00:00Z
 * 
 * Example: 2026-07-12 in Berlin (CEST, UTC+2)
 * - Berlin 00:00:00+02:00 = 2026-07-11T22:00:00Z
 */
function berlinMidnightToUtcISO(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Step 1: Create probe at UTC midnight for this date
  const probeUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  
  // Step 2: Get Berlin offset at probe time
  const offset1 = getBerlinOffsetMinutes(probeUtc);
  
  // Step 3: First approximation - subtract offset to get Berlin midnight in UTC
  const utc1 = new Date(probeUtc.getTime() - offset1 * 60 * 1000);
  
  // Step 4: Re-check offset at the approximated time
  const offset2 = getBerlinOffsetMinutes(utc1);
  let candidate = utc1;
  
  // Step 5: If offset changed (DST transition), recalculate
  if (offset1 !== offset2) {
    candidate = new Date(probeUtc.getTime() - offset2 * 60 * 1000);
    
    // Step 5b: Third pass - verify and adjust if still not midnight
    const offset3 = getBerlinOffsetMinutes(candidate);
    if (offset2 !== offset3) {
      candidate = new Date(probeUtc.getTime() - offset3 * 60 * 1000);
    }
  }
  
  // Step 6: Validate - ensure result is actually 00:00 in Berlin
  const berlinTime = getBerlinTimeHHMM(candidate);
  if (berlinTime !== '00:00') {
    // Final correction attempt
    const finalOffset = getBerlinOffsetMinutes(candidate);
    const corrected = new Date(probeUtc.getTime() - finalOffset * 60 * 1000);
    const correctedTime = getBerlinTimeHHMM(corrected);
    
    if (correctedTime === '00:00') {
      return corrected.toISOString();
    }
    
    // Log warning but return best effort (only if DEBUG_TZ enabled)
    if (DEBUG_TZ) console.warn(`[berlinMidnightToUtcISO] Could not achieve exact midnight for ${dateStr}. Got ${berlinTime}, using candidate anyway.`);
  }
  
  return candidate.toISOString();
}

/**
 * Get the next day's date string (YYYY-MM-DD)
 */
function nextDay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return d.toISOString().split('T')[0];
}

/**
 * Build UTC ISO range for Europe/Berlin date range.
 * For querying timestamptz columns (e.g., voice_notes.occurred_at).
 * 
 * Returns UTC timestamps such that:
 * - startUtc = Berlin midnight on fromDate
 * - endExclusiveUtc = Berlin midnight on (toDate + 1 day)
 * 
 * Query pattern: >= startUtc AND < endExclusiveUtc
 */
function buildBerlinUtcRange(fromDate: string, toDate: string): { startUtc: string; endExclusiveUtc: string } {
  return {
    startUtc: berlinMidnightToUtcISO(fromDate),
    endExclusiveUtc: berlinMidnightToUtcISO(nextDay(toDate))
  };
}

// Structured output schema for PDF
interface DiaryReportResult {
  schemaVersion: number;
  timeRange: { from: string; to: string };
  dataCoverage: {
    entries: number;
    notes: number;
    weatherDays: number;
    medDays: number;
  };
  headline: string;
  disclaimer: string;
  keyFindings: Array<{
    title: string;
    finding: string;
    evidence: string;
  }>;
  sections: Array<{
    title: string;
    bullets: string[];
  }>;
  createdAt: string;
}

interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  cooldownRemaining: number;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`[generate-ai-diary-report] [${requestId}] Request started`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse and validate request
    let requestBody: z.infer<typeof RequestSchema>;
    try {
      const rawBody = await req.json();
      requestBody = RequestSchema.parse(rawBody);
    } catch (parseError) {
      if (parseError instanceof z.ZodError) {
        return new Response(JSON.stringify({ 
          requestId,
          error: 'Ungültige Eingabe',
          details: parseError.errors.map(e => e.message)
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Ungültiges JSON'
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { fromDate, toDate } = requestBody;
    
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
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
      return new Response(JSON.stringify({ 
        requestId,
        error: 'AI ist in den Einstellungen deaktiviert',
        errorCode: 'AI_DISABLED'
      }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const isUnlimited = profile.ai_unlimited === true;
    const currentPeriod = new Date().toISOString().slice(0, 7) + '-01';

    // Fetch usage for diary_report in current period
    const { data: usageData } = await supabaseAdmin
      .from('user_ai_usage')
      .select('request_count, last_used_at')
      .eq('user_id', user.id)
      .eq('feature', FEATURE_NAME)
      .gte('period_start', currentPeriod)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentUsage = usageData?.request_count ?? 0;
    const lastUsedAt = usageData?.last_used_at ? new Date(usageData.last_used_at) : null;
    const quotaLimit = FREE_DIARY_REPORT_MONTHLY;

    // Calculate cooldown
    let cooldownRemaining = 0;
    if (lastUsedAt && !isUnlimited) {
      const secondsSinceLastUse = (Date.now() - lastUsedAt.getTime()) / 1000;
      cooldownRemaining = Math.max(0, COOLDOWN_SECONDS - secondsSinceLastUse);
    }

    const quotaInfo: QuotaInfo = {
      used: currentUsage,
      limit: quotaLimit,
      remaining: isUnlimited ? 999 : Math.max(0, quotaLimit - currentUsage),
      isUnlimited,
      cooldownRemaining: Math.ceil(cooldownRemaining)
    };

    // Cooldown check
    if (!isUnlimited && cooldownRemaining > 0) {
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Bitte warte kurz, bevor du einen neuen Bericht erstellst.',
        errorCode: 'COOLDOWN',
        cooldownRemaining: Math.ceil(cooldownRemaining),
        quota: quotaInfo
      }), { 
        status: 429, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Quota check
    if (!isUnlimited && currentUsage >= quotaLimit) {
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Monatliches Limit für KI-Berichte erreicht.',
        errorCode: 'QUOTA_EXCEEDED',
        quota: quotaInfo
      }), { 
        status: 429, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ============== DATA FETCHING ==============
    // Strategy:
    // - pain_entries: Use selected_date (date type) for timezone-safe filtering
    //   Supabase doesn't support OR in .gte/.lte, so we fetch entries with selected_date in range.
    //   Entries with NULL selected_date are rare (legacy) - we do a separate fallback query.
    // - voice_notes: Use UTC range for timestamptz (occurred_at) with DST awareness
    const utcRange = buildBerlinUtcRange(fromDate, toDate);
    console.log(`[${requestId}] Date range: ${fromDate} to ${toDate}`);
    console.log(`[${requestId}] UTC range for timestamptz: ${utcRange.startUtc} to ${utcRange.endExclusiveUtc}`);

    // Primary query: pain_entries with selected_date (timezone-safe date comparison)
    const { data: entriesWithDate } = await supabase
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
        me_cfs_severity_score,
        me_cfs_severity_level,
        weather:weather_logs!pain_entries_weather_id_fkey (
          temperature_c,
          pressure_mb,
          humidity,
          pressure_change_24h,
          condition_text,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .not('selected_date', 'is', null)
      .gte('selected_date', fromDate)
      .lte('selected_date', toDate)
      .order('selected_date', { ascending: true })
      .limit(200);

    // Fallback query: entries with NULL selected_date, use timestamp_created UTC range
    // This handles legacy entries that may not have selected_date set
    const { data: entriesWithoutDate } = await supabase
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
        me_cfs_severity_score,
        me_cfs_severity_level,
        weather:weather_logs!pain_entries_weather_id_fkey (
          temperature_c,
          pressure_mb,
          humidity,
          pressure_change_24h,
          condition_text,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .is('selected_date', null)
      .gte('timestamp_created', utcRange.startUtc)
      .lt('timestamp_created', utcRange.endExclusiveUtc)
      .order('timestamp_created', { ascending: true })
      .limit(50);

    // Merge and deduplicate (shouldn't have duplicates, but be safe)
    const painEntries = [...(entriesWithDate || []), ...(entriesWithoutDate || [])];
    
    // Sort merged results by effective date
    painEntries.sort((a, b) => {
      const dateA = a.selected_date || a.timestamp_created?.split('T')[0] || '';
      const dateB = b.selected_date || b.timestamp_created?.split('T')[0] || '';
      return dateA.localeCompare(dateB);
    });

    // Fetch voice_notes using UTC range (occurred_at is timestamptz)
    const { data: voiceNotes } = await supabase
      .from('voice_notes')
      .select('occurred_at, captured_at, text')
      .eq('user_id', user.id)
      .gte('occurred_at', utcRange.startUtc)
      .lt('occurred_at', utcRange.endExclusiveUtc)
      .order('occurred_at', { ascending: true })
      .limit(100);

    // Fetch medication_courses (all, as they may affect analysis context)
    const { data: medicationCourses } = await supabase
      .from('medication_courses')
      .select('updated_at, start_date, end_date')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    console.log(`[${requestId}] Data: ${painEntries.length} entries (${entriesWithDate?.length || 0} with date, ${entriesWithoutDate?.length || 0} fallback), ${voiceNotes?.length || 0} notes, ${medicationCourses?.length || 0} courses`);

    // Build structured data for prompt
    const structuredEntries = (painEntries || []).map(entry => {
      const weather = Array.isArray(entry.weather) ? entry.weather[0] : entry.weather;
      const date = entry.selected_date || entry.timestamp_created?.split('T')[0];
      const time = entry.selected_time || entry.timestamp_created?.split('T')[1]?.substring(0, 5);
      
      return {
        date,
        time,
        pain_level: entry.pain_level,
        aura_type: entry.aura_type,
        medications: entry.medications?.join(', ') || 'keine',
        notes: entry.notes || '',
        me_cfs_score: (entry as any).me_cfs_severity_score ?? 0,
        me_cfs_level: (entry as any).me_cfs_severity_level ?? 'none',
        weather: weather ? {
          temp: weather.temperature_c,
          pressure: weather.pressure_mb,
          humidity: weather.humidity,
        } : null,
        _weatherCreatedAt: weather?.created_at
      };
    });

    const weatherDays = new Set(structuredEntries.filter(e => e.weather).map(e => e.date)).size;
    const medDays = new Set(structuredEntries.filter(e => e.medications !== 'keine').map(e => e.date)).size;

    // No data case
    if (structuredEntries.length === 0) {
      return new Response(JSON.stringify({ 
        requestId,
        error: 'Keine Daten im gewählten Zeitraum gefunden.',
        errorCode: 'NO_DATA',
        quota: quotaInfo
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ============== LLM CALL ==============
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ 
        requestId,
        error: 'KI-Service nicht konfiguriert',
        errorCode: 'AI_NOT_CONFIGURED'
      }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Build prompt data
    const dataText = structuredEntries.slice(-150).map(d => {
      let entry = `[${d.date} ${d.time}] Schmerz=${d.pain_level}, Aura=${d.aura_type}, Medikamente=${d.medications}`;
      if (d.me_cfs_score > 0) {
        entry += `, ME/CFS=${d.me_cfs_level}`;
      }
      if (d.weather) {
        entry += ` | Wetter: ${d.weather.temp}°C, ${d.weather.pressure}hPa`;
      }
      if (d.notes) entry += ` | Notiz: ${d.notes.substring(0, 80)}`;
      return entry;
    }).join('\n');

    // ── ME/CFS aggregierter Featureblock ──
    const meCfsDayMap = new Map<string, number>();
    for (const d of structuredEntries) {
      if (!d.date) continue;
      meCfsDayMap.set(d.date, Math.max(meCfsDayMap.get(d.date) ?? 0, d.me_cfs_score));
    }
    const meCfsScores = Array.from(meCfsDayMap.values());
    const meCfsDaysWithBurden = meCfsScores.filter(s => s > 0).length;

    let meCfsFeatureBlock = '';
    if (meCfsDaysWithBurden > 0) {
      const documentedDays = meCfsScores.length;
      const meCfsPct = Math.round((meCfsDaysWithBurden / documentedDays) * 100);
      const meCfsAvg = meCfsScores.reduce((a, b) => a + b, 0) / documentedDays;
      const levelLabel = (s: number) => s <= 0 ? 'keine' : s <= 4 ? 'leicht' : s <= 7 ? 'mittel' : 'schwer';
      meCfsFeatureBlock = `\n\nME/CFS (aggregiert, Basis: ${documentedDays} dokumentierte Tage): Belastete Tage: ${meCfsPct}%, durchschnittliche Stufe: ${levelLabel(meCfsAvg)}.`;
    }

    const prophylaxeCourses = (medicationCourses || []).filter(c => c.type === 'prophylaxe');
    let coursesSummary = '';
    if (prophylaxeCourses.length > 0) {
      coursesSummary = '\n\nPROPHYLAXE:\n' + prophylaxeCourses.map(c => {
        const status = c.is_active ? 'aktiv' : 'beendet';
        return `- ${c.medication_name}: ${c.dose_text || ''}, Start: ${c.start_date || '?'}, ${status}`;
      }).join('\n');
    }

    const jsonSchema = `{
  "headline": "Kurze sachliche Überschrift (max 10 Worte)",
  "keyFindings": [{ "title": "Kurztitel", "finding": "Haupterkenntnis", "evidence": "Datenbasis" }],
  "sections": [{ "title": "Abschnittstitel", "bullets": ["Bulletpoint 1", "Bulletpoint 2"] }]
}`;

    const systemMessage = `Du bist ein medizinisches Dokumentationssystem für Kopfschmerz-Tagebücher. 
Erstelle eine sachliche, strukturierte Zusammenfassung für den ärztlichen Bericht.

REGELN:
- Keine Emojis
- Keine Diagnosen oder Therapieempfehlungen
- Sachlich und faktisch
- 3-5 Key Findings
- 2-4 thematische Abschnitte mit je 2-4 Bulletpoints
- Deutsche Sprache
- Jede Aussage mit Daten belegen
- ME/CFS nur erwähnen, wenn ein ME/CFS-Featureblock in den Daten vorhanden ist
- Keine Kausalitätsbehauptungen bei ME/CFS, nur Assoziationen ("im Mittel", "tendenziell")
- Keine einzelnen Datumsnennungen für ME/CFS

JSON-SCHEMA:
${jsonSchema}`;

    const prompt = `Erstelle einen ärztlichen Zusammenfassungsbericht für dieses Kopfschmerz-Tagebuch.

ZEITRAUM: ${fromDate.split('T')[0]} bis ${toDate.split('T')[0]}
EINTRÄGE: ${structuredEntries.length}

DATEN:
${dataText}${coursesSummary}${meCfsFeatureBlock}

AUFGABE:
Erstelle eine strukturierte Zusammenfassung als JSON. Fokus auf:
1. Häufigkeit und Intensität der Kopfschmerzen
2. Zeitliche Muster (Tageszeit, Wochentage)
3. Medikamentennutzung
4. ME/CFS-Belastung (NUR wenn ME/CFS-Featureblock oben vorhanden: Häufigkeit, Zusammenhang mit Schmerzintensität - KEINE Kausalität, nur Assoziation)
5. Auffällige Zusammenhänge (falls erkennbar)

Antworte NUR mit dem JSON-Objekt.`;

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
          errorCode: 'RATE_LIMIT',
          quota: quotaInfo
        }), {
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          requestId, 
          error: 'Guthaben aufgebraucht.',
          errorCode: 'PAYMENT_REQUIRED',
          quota: quotaInfo
        }), {
          status: 402, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ 
        requestId, 
        error: 'KI-Analyse fehlgeschlagen',
        errorCode: 'AI_ERROR'
      }), {
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    let aiContent = aiData.choices[0].message.content;
    console.log(`[${requestId}] AI response received, tokens: ${aiData.usage?.total_tokens || 'unknown'}`);

    // Parse AI response
    let parsedResult: { headline: string; keyFindings: any[]; sections: any[] };
    try {
      aiContent = aiContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      parsedResult = JSON.parse(aiContent);
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse AI JSON:`, parseError);
      return new Response(JSON.stringify({ 
        requestId, 
        error: 'KI-Antwort konnte nicht verarbeitet werden',
        errorCode: 'PARSE_ERROR'
      }), {
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build final result (fromDate/toDate are already YYYY-MM-DD format)
    const createdAt = new Date().toISOString();

    const result: DiaryReportResult = {
      schemaVersion: 1,
      timeRange: { from: fromDate, to: toDate },
      dataCoverage: {
        entries: structuredEntries.length,
        notes: voiceNotes?.length || 0,
        weatherDays,
        medDays,
      },
      headline: parsedResult.headline || 'KI-Analysebericht',
      disclaimer: 'Private Auswertung, keine medizinische Beratung.',
      keyFindings: parsedResult.keyFindings || [],
      sections: parsedResult.sections || [],
      createdAt,
    };

    // ============== UPDATE QUOTA ==============
    if (!isUnlimited) {
      const now = new Date().toISOString();
      await supabaseAdmin
        .from('user_ai_usage')
        .upsert({
          user_id: user.id,
          feature: FEATURE_NAME,
          period_start: currentPeriod,
          request_count: currentUsage + 1,
          last_used_at: now,
          updated_at: now,
        }, { onConflict: 'user_id,feature,period_start' });
      
      quotaInfo.used = currentUsage + 1;
      quotaInfo.remaining = Math.max(0, quotaLimit - currentUsage - 1);
    }

    // ============== PERSIST TO ai_reports ==============
    // Calculate latestSourceUpdatedAt from ALL data sources for accurate dedupe
    const timestamps: Date[] = [];
    
    // 1. Latest pain_entry timestamp_created in range
    if (painEntries && painEntries.length > 0) {
      const latestEntry = painEntries[painEntries.length - 1];
      if (latestEntry.timestamp_created) {
        timestamps.push(new Date(latestEntry.timestamp_created));
      }
      // Also check weather_logs created_at if available
      for (const entry of painEntries) {
        const weather = Array.isArray(entry.weather) ? entry.weather[0] : entry.weather;
        if (weather?.created_at) {
          timestamps.push(new Date(weather.created_at));
        }
      }
    }
    
    // 2. Latest voice_note captured_at or occurred_at in range
    if (voiceNotes && voiceNotes.length > 0) {
      for (const note of voiceNotes) {
        if (note.captured_at) {
          timestamps.push(new Date(note.captured_at));
        } else if (note.occurred_at) {
          timestamps.push(new Date(note.occurred_at));
        }
      }
    }
    
    // 3. Latest medication_course updated_at (courses may affect analysis even if outside range)
    if (medicationCourses && medicationCourses.length > 0) {
      for (const course of medicationCourses) {
        if (course.updated_at) {
          timestamps.push(new Date(course.updated_at));
        }
      }
    }
    
    // Use the maximum timestamp, or createdAt if no data
    const latestSourceUpdatedAt = timestamps.length > 0
      ? new Date(Math.max(...timestamps.map(t => t.getTime())))
      : new Date(createdAt);
    
    console.log(`[${requestId}] latestSourceUpdatedAt: ${latestSourceUpdatedAt.toISOString()} (from ${timestamps.length} timestamps)`);
    
    const dedupeKey = `${user.id}:diary_pdf:${fromDate}:${toDate}:${latestSourceUpdatedAt.toISOString()}`;
    
    const reportTitle = `KI-Analysebericht: ${fromDate} – ${toDate}`;
    
    const { data: existingReport } = await supabaseAdmin
      .from('ai_reports')
      .select('id')
      .eq('user_id', user.id)
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();

    let reportId: string;
    
    if (existingReport) {
      // Update existing
      const { data: updated } = await supabaseAdmin
        .from('ai_reports')
        .update({
          title: reportTitle,
          response_json: { structured: result },
          input_summary: {
            entries: structuredEntries.length,
            notes: voiceNotes?.length || 0,
            toggles: requestBody,
          },
          updated_at: createdAt,
        })
        .eq('id', existingReport.id)
        .select('id')
        .single();
      
      reportId = updated?.id || existingReport.id;
      console.log(`[${requestId}] Updated existing report: ${reportId}`);
    } else {
      // Create new
      const { data: created } = await supabaseAdmin
        .from('ai_reports')
        .insert({
          user_id: user.id,
          report_type: 'diary_pdf',
          title: reportTitle,
          from_date: fromDate,
          to_date: toDate,
          source: 'pdf_flow',
          input_summary: {
            entries: structuredEntries.length,
            notes: voiceNotes?.length || 0,
            toggles: requestBody,
          },
          response_json: { structured: result },
          model: 'google/gemini-2.5-flash',
          dedupe_key: dedupeKey,
        })
        .select('id')
        .single();
      
      reportId = created?.id || '';
      console.log(`[${requestId}] Created new report: ${reportId}`);
    }

    console.log(`[${requestId}] Request completed successfully`);

    return new Response(JSON.stringify({
      requestId,
      success: true,
      report: result,
      reportId,
      quota: quotaInfo,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(JSON.stringify({ 
      requestId,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      errorCode: 'INTERNAL_ERROR'
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
