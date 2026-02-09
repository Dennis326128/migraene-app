/**
 * Edge Function: get-shared-report-data
 * 
 * API CONTRACT v1 (2026-02-09)
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * DEFAULT Response (v1-only):
 *   { report: DoctorReportJSON }
 * 
 * report.meta.reportVersion === "v1"
 * report.meta.schemaVersion === "v1"
 * 
 * LEGACY Mode (opt-in, temporary):
 *   Query: ?legacy=1  OR  Header: X-Report-Legacy: 1
 *   → Adds flat legacy fields alongside { report }
 *   → Will be removed after website migration is confirmed.
 * 
 * Auth: Cookie (doctor_session) OR Header (x-doctor-session)
 * ═══════════════════════════════════════════════════════════════════════
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildDoctorReportSnapshot,
  getCachedSnapshot,
  isSnapshotStale,
  upsertSnapshot,
  type DoctorReportJSON,
} from "../_shared/doctorReportSnapshot.ts";

// ═══════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  "https://migraina.lovable.app",
  "https://migraene-app.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin)
    || origin.endsWith(".lovable.app")
    || origin.endsWith(".lovableproject.com");

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "https://migraina.lovable.app",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-doctor-session, x-report-legacy, authorization, x-client-info, apikey, cookie",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SESSION HELPERS
// ═══════════════════════════════════════════════════════════════════════

const SESSION_TIMEOUT_MINUTES = 60;

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach(cookie => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) cookies[name] = value;
  });
  return cookies;
}

function getSessionId(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);
  if (cookies["doctor_session"]) return cookies["doctor_session"];
  const headerSession = req.headers.get("x-doctor-session");
  if (headerSession) return headerSession;
  return null;
}

async function validateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ valid: boolean; userId?: string; shareId?: string; defaultRange?: string; reason?: string }> {
  const { data: session, error } = await supabase
    .from("doctor_share_sessions")
    .select(`
      id, last_activity_at, ended_at,
      doctor_shares!inner (
        id, user_id, expires_at, revoked_at, share_active_until, default_range
      )
    `)
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !session) return { valid: false, reason: "session_not_found" };
  if (session.ended_at) return { valid: false, reason: "session_ended" };

  const share = session.doctor_shares as {
    id: string; user_id: string; expires_at: string | null;
    revoked_at: string | null; share_active_until: string | null; default_range: string;
  };
  const now = new Date();

  if (share.revoked_at) return { valid: false, reason: "share_revoked" };
  if (share.expires_at && now > new Date(share.expires_at)) return { valid: false, reason: "share_expired" };
  if (!share.share_active_until || now > new Date(share.share_active_until)) return { valid: false, reason: "not_shared" };

  const lastActivity = new Date(session.last_activity_at);
  const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
  if (minutesSinceActivity > SESSION_TIMEOUT_MINUTES) return { valid: false, reason: "session_timeout" };

  return { valid: true, userId: share.user_id, shareId: share.id, defaultRange: share.default_range || "3m" };
}

// ═══════════════════════════════════════════════════════════════════════
// LEGACY RESPONSE BUILDER (opt-in only)
// ═══════════════════════════════════════════════════════════════════════

function buildLegacyFields(reportJson: DoctorReportJSON, userId: string) {
  return {
    patient: reportJson.optional.patientData ? {
      first_name: reportJson.optional.patientData.firstName,
      last_name: reportJson.optional.patientData.lastName,
      full_name: reportJson.optional.patientData.fullName,
      date_of_birth: reportJson.optional.patientData.dateOfBirth,
      street: reportJson.optional.patientData.street,
      postal_code: reportJson.optional.patientData.postalCode,
      city: reportJson.optional.patientData.city,
      phone: reportJson.optional.patientData.phone,
      fax: reportJson.optional.patientData.fax,
      health_insurance: reportJson.optional.patientData.healthInsurance,
      insurance_number: reportJson.optional.patientData.insuranceNumber,
      salutation: reportJson.optional.patientData.salutation,
      title: reportJson.optional.patientData.title,
    } : null,
    summary: {
      headache_days: reportJson.summary.headacheDays,
      migraine_days: reportJson.summary.migraineDays,
      triptan_days: reportJson.summary.triptanDays,
      acute_med_days: reportJson.summary.acuteMedDays,
      aura_days: reportJson.summary.auraDays,
      avg_intensity: reportJson.summary.avgIntensity,
      overuse_warning: reportJson.summary.overuseWarning,
      days_in_range: reportJson.summary.daysInRange,
      total_triptan_intakes: reportJson.summary.totalTriptanIntakes,
      kpis: reportJson.summary.kpis,
      normalizedKPIs: reportJson.summary.normalizedKPIs,
    },
    chart_data: {
      dates: reportJson.charts.intensityOverTime.map(d => d.date),
      pain_levels: reportJson.charts.intensityOverTime.map(d => d.maxIntensity),
    },
    entries: reportJson.tables.entries.map(e => ({
      id: e.id,
      user_id: userId,
      selected_date: e.date,
      selected_time: e.time,
      pain_level: e.intensityLabel.toLowerCase().replace(" ", "_"),
      medications: e.medications,
      notes: e.note,
      aura_type: e.aura || "keine",
      pain_locations: e.painLocations,
    })),
    entries_total: reportJson.tables.entriesTotal,
    entries_page: reportJson.tables.entriesPage,
    entries_page_size: reportJson.tables.entriesPageSize,
    medication_stats: reportJson.tables.medicationStats.map(m => ({
      name: m.name,
      intake_count: m.intakeCount,
      avg_effect: m.avgEffect,
      effect_count: m.effectCount,
    })),
    medication_courses: reportJson.tables.prophylaxisCourses.map(c => ({
      id: c.id,
      medication_name: c.name,
      start_date: c.startDate,
      end_date: c.endDate,
      dose_text: c.doseText,
      is_active: c.isActive,
      subjective_effectiveness: c.effectiveness,
      side_effects_text: c.sideEffects,
      discontinuation_reason: c.discontinuationReason,
      type: "prophylaxe",
    })),
    user_medications: [],
    location_stats: reportJson.tables.locationStats,
    from_date: reportJson.meta.fromDate,
    to_date: reportJson.meta.toDate,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Keine aktive Sitzung", reason: "no_session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sessionResult = await validateSession(supabase, sessionId);
    if (!sessionResult.valid) {
      return new Response(
        JSON.stringify({ error: "Sitzung abgelaufen oder Freigabe beendet", reason: sessionResult.reason }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = sessionResult.userId!;
    const shareId = sessionResult.shareId!;

    const url = new URL(req.url);
    const range = url.searchParams.get("range") || sessionResult.defaultRange || "3m";
    const page = parseInt(url.searchParams.get("page") || "1", 10);

    // Legacy opt-in: ?legacy=1 OR Header X-Report-Legacy: 1
    const wantsLegacy = url.searchParams.get("legacy") === "1"
      || req.headers.get("x-report-legacy") === "1";

    console.log(`[Doctor Report v1] user=${userId.substring(0, 8)}... range=${range} legacy=${wantsLegacy}`);

    // Update session activity
    await supabase
      .from("doctor_share_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", sessionId);

    // ═══════════════════════════════════════════════════════════════════
    // SNAPSHOT FLOW
    // ═══════════════════════════════════════════════════════════════════

    let reportJson: DoctorReportJSON;

    // 1) Check cache
    const cached = await getCachedSnapshot(supabase, shareId, range);
    let needsRebuild = !cached || cached.isStale;

    // 2) Staleness check
    if (cached && !cached.isStale) {
      const stale = await isSnapshotStale(supabase, userId, range, cached.sourceUpdatedAt);
      if (stale) {
        needsRebuild = true;
        await supabase
          .from("doctor_share_report_snapshots")
          .update({ is_stale: true })
          .eq("id", cached.id);
      }
    }

    // 3) Build or use cache
    if (needsRebuild) {
      console.log(`[Doctor Report v1] Building new snapshot share=${shareId.substring(0, 8)}`);
      const { reportJson: newReport, sourceUpdatedAt } = await buildDoctorReportSnapshot(supabase, {
        userId, range, page, includePatientData: true,
      });
      await upsertSnapshot(supabase, shareId, range, newReport, sourceUpdatedAt, sessionId);
      reportJson = newReport;
    } else if (page > 1) {
      // Pagination needs fresh build
      const { reportJson: newReport } = await buildDoctorReportSnapshot(supabase, {
        userId, range, page, includePatientData: true,
      });
      reportJson = newReport;
    } else {
      console.log(`[Doctor Report v1] Using cached snapshot share=${shareId.substring(0, 8)}`);
      reportJson = cached!.reportJson;
    }

    // ═══════════════════════════════════════════════════════════════════
    // RESPONSE: v1-only by default
    // ═══════════════════════════════════════════════════════════════════

    // Ensure schemaVersion is set
    const enrichedReport: DoctorReportJSON = {
      ...reportJson,
      meta: {
        ...reportJson.meta,
        schemaVersion: "v1",
      },
    };

    const responseBody: Record<string, unknown> = {
      report: enrichedReport,
    };

    // Legacy fields only on explicit opt-in
    if (wantsLegacy) {
      console.log(`[Doctor Report v1] Including legacy fields (opt-in)`);
      Object.assign(responseBody, buildLegacyFields(enrichedReport, userId));
    }

    return new Response(
      JSON.stringify(responseBody),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[Doctor Report v1] Error:", err);
    return new Response(
      JSON.stringify({ error: "Interner Fehler", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
