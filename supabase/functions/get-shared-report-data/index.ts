/**
 * Edge Function: get-shared-report-data
 * Liefert Report-Daten für die Arzt-Ansicht
 * Auth: Cookie (doctor_session)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Dynamischer CORS Origin für Credentials (Wildcard * funktioniert nicht mit credentials)
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isAllowed = origin.includes("lovable.app") || origin.includes("localhost");
  
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "https://migraene-app.lovable.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cookie",
    "Access-Control-Allow-Credentials": "true",
  };
}

const SESSION_TIMEOUT_MINUTES = 60;

// Cookie Parser
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(";").forEach(cookie => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      cookies[name] = value;
    }
  });
  
  return cookies;
}

// Date Range berechnen
function getDateRange(range: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  
  switch (range) {
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "3m":
      from.setMonth(from.getMonth() - 3);
      break;
    case "6m":
      from.setMonth(from.getMonth() - 6);
      break;
    case "12m":
      from.setFullYear(from.getFullYear() - 1);
      break;
    default:
      from.setMonth(from.getMonth() - 3); // Default: 3 Monate
  }
  
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

// Pain Level zu Zahl
function painLevelToNumber(level: string): number {
  const map: Record<string, number> = {
    "-": 0,
    "leicht": 3,
    "mittel": 5,
    "stark": 7,
    "sehr_stark": 9,
  };
  return map[level] ?? 5;
}

// Session validieren (gemeinsame Logik)
async function validateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ valid: boolean; userId?: string; reason?: string }> {
  const { data: session, error } = await supabase
    .from("doctor_share_sessions")
    .select(`
      id,
      last_activity_at,
      ended_at,
      doctor_shares!inner (
        id,
        user_id,
        expires_at,
        revoked_at
      )
    `)
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !session) {
    return { valid: false, reason: "session_not_found" };
  }

  if (session.ended_at) {
    return { valid: false, reason: "session_ended" };
  }

  const share = session.doctor_shares as { 
    id: string; 
    user_id: string; 
    expires_at: string; 
    revoked_at: string | null 
  };
  const now = new Date();

  if (share.revoked_at) {
    return { valid: false, reason: "share_revoked" };
  }

  if (now > new Date(share.expires_at)) {
    return { valid: false, reason: "share_expired" };
  }

  const lastActivity = new Date(session.last_activity_at);
  const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);

  if (minutesSinceActivity > SESSION_TIMEOUT_MINUTES) {
    return { valid: false, reason: "session_timeout" };
  }

  return { valid: true, userId: share.user_id };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Session-ID aus Cookie
    const cookieHeader = req.headers.get("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const sessionId = cookies["doctor_session"];

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Keine aktive Sitzung" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Supabase Client mit Service Role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Session validieren
    const sessionResult = await validateSession(supabase, sessionId);
    if (!sessionResult.valid) {
      return new Response(
        JSON.stringify({ error: "Sitzung abgelaufen", reason: sessionResult.reason }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = sessionResult.userId!;

    // Query-Parameter
    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "3m";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = 50;

    const { from, to } = getDateRange(range);

    // Session Activity aktualisieren
    await supabase
      .from("doctor_share_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", sessionId);

    // ═══════════════════════════════════════════════════════════════════════
    // DATEN LADEN (parallel)
    // ═══════════════════════════════════════════════════════════════════════

    // First get all entry IDs for the period (for medication_effects query)
    const { data: allEntryIds } = await supabase
      .from("pain_entries")
      .select("id")
      .eq("user_id", userId)
      .gte("selected_date", from)
      .lte("selected_date", to);

    const entryIds = allEntryIds?.map(e => e.id) || [];

    const [
      entriesResult,
      entriesCountResult,
      medicationCoursesResult,
      medicationEffectsResult,
    ] = await Promise.all([
      // Pain Entries (paginiert)
      supabase
        .from("pain_entries")
        .select("*")
        .eq("user_id", userId)
        .gte("selected_date", from)
        .lte("selected_date", to)
        .order("selected_date", { ascending: false })
        .order("selected_time", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1),

      // Total Count
      supabase
        .from("pain_entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("selected_date", from)
        .lte("selected_date", to),

      // Medication Courses (Prophylaxe)
      supabase
        .from("medication_courses")
        .select("*")
        .eq("user_id", userId)
        .order("start_date", { ascending: false }),

      // Medication Effects - only query if we have entries
      entryIds.length > 0
        ? supabase
            .from("medication_effects")
            .select("entry_id, med_name, effect_rating, effect_score")
            .in("entry_id", entryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const entries = entriesResult.data || [];
    const totalEntries = entriesCountResult.count || 0;
    const medicationCourses = medicationCoursesResult.data || [];
    const medicationEffects = medicationEffectsResult.data || [];

    // ═══════════════════════════════════════════════════════════════════════
    // SUMMARY BERECHNEN (nutze bereits geladene entries für Performance)
    // ═══════════════════════════════════════════════════════════════════════

    // Wenn wir mehr als pageSize haben, brauchen wir alle Entries für Summary
    let summaryEntries = entries;
    if (totalEntries > pageSize) {
      const { data: allEntriesForSummary } = await supabase
        .from("pain_entries")
        .select("id, selected_date, pain_level, medications")
        .eq("user_id", userId)
        .gte("selected_date", from)
        .lte("selected_date", to);
      summaryEntries = allEntriesForSummary || [];
    }

    // Tage mit Schmerzen
    const painDays = new Set(
      summaryEntries
        .filter(e => e.pain_level && e.pain_level !== "-")
        .map(e => e.selected_date)
    );

    // Migränetage (stark/sehr_stark)
    const migraineDays = new Set(
      summaryEntries
        .filter(e => e.pain_level === "stark" || e.pain_level === "sehr_stark")
        .map(e => e.selected_date)
    );

    // Triptantage
    const triptanKeywords = ["triptan", "suma", "riza", "zolmi", "nara", "almo", "ele", "frova"];
    const triptanDays = new Set(
      summaryEntries
        .filter(e => 
          e.medications?.some((med: string) => 
            triptanKeywords.some(kw => med.toLowerCase().includes(kw))
          )
        )
        .map(e => e.selected_date)
    );

    // Akutmedikationstage
    const acuteMedDays = new Set(
      summaryEntries
        .filter(e => e.medications && e.medications.length > 0)
        .map(e => e.selected_date)
    );

    // Durchschnittliche Intensität
    const painLevels = summaryEntries
      .filter(e => e.pain_level && e.pain_level !== "-")
      .map(e => painLevelToNumber(e.pain_level));
    const avgIntensity = painLevels.length > 0
      ? painLevels.reduce((a, b) => a + b, 0) / painLevels.length
      : 0;

    // Overuse-Warnung: > 10 Akutmedikationstage/Monat
    const daysInRange = Math.ceil(
      (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    const monthsInRange = daysInRange / 30;
    const acuteMedDaysPerMonth = acuteMedDays.size / monthsInRange;
    const overuseWarning = acuteMedDaysPerMonth > 10;

    // ═══════════════════════════════════════════════════════════════════════
    // CHART DATA
    // ═══════════════════════════════════════════════════════════════════════

    // Gruppiere nach Datum für Chart
    const chartDataMap = new Map<string, number>();
    summaryEntries.forEach(entry => {
      if (entry.selected_date && entry.pain_level && entry.pain_level !== "-") {
        const existing = chartDataMap.get(entry.selected_date);
        const level = painLevelToNumber(entry.pain_level);
        if (!existing || level > existing) {
          chartDataMap.set(entry.selected_date, level);
        }
      }
    });

    const chartDates = Array.from(chartDataMap.keys()).sort();
    const chartPainLevels = chartDates.map(d => chartDataMap.get(d) || 0);

    // ═══════════════════════════════════════════════════════════════════════
    // MEDICATION STATS
    // ═══════════════════════════════════════════════════════════════════════

    const medStats = new Map<string, { count: number; effects: number[]; totalScore: number }>();
    
    summaryEntries.forEach(entry => {
      entry.medications?.forEach((med: string) => {
        if (!medStats.has(med)) {
          medStats.set(med, { count: 0, effects: [], totalScore: 0 });
        }
        const stat = medStats.get(med)!;
        stat.count++;
      });
    });

    // Effects hinzufügen
    medicationEffects.forEach(effect => {
      const stat = medStats.get(effect.med_name);
      if (stat && effect.effect_score !== null) {
        stat.effects.push(effect.effect_score);
        stat.totalScore += effect.effect_score;
      }
    });

    const medicationStatsArray = Array.from(medStats.entries())
      .map(([name, stat]) => ({
        name,
        intake_count: stat.count,
        avg_effect: stat.effects.length > 0 
          ? Math.round((stat.totalScore / stat.effects.length) * 10) / 10 
          : null,
        effect_count: stat.effects.length,
      }))
      .sort((a, b) => b.intake_count - a.intake_count);

    // ═══════════════════════════════════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════════════════════════════════

    return new Response(
      JSON.stringify({
        summary: {
          headache_days: painDays.size,
          migraine_days: migraineDays.size,
          triptan_days: triptanDays.size,
          acute_med_days: acuteMedDays.size,
          avg_intensity: Math.round(avgIntensity * 10) / 10,
          overuse_warning: overuseWarning,
        },
        chart_data: {
          dates: chartDates,
          pain_levels: chartPainLevels,
        },
        entries: entries,
        entries_total: totalEntries,
        entries_page: page,
        entries_page_size: pageSize,
        medication_stats: medicationStatsArray,
        medication_courses: medicationCourses,
        from_date: from,
        to_date: to,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    const corsHeaders = getCorsHeaders(req);
    return new Response(
      JSON.stringify({ error: "Interner Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
