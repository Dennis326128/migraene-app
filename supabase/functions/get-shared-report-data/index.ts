/**
 * Edge Function: get-shared-report-data
 *
 * Auth: Header x-doctor-access (signed HMAC token, no sessions/cookies)
 * Every request verifies token signature + DB share status.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildDoctorReportSnapshot,
  getCachedSnapshot,
  isSnapshotStale,
  upsertSnapshot,
  type DoctorReportJSON,
} from "../_shared/doctorReportSnapshot.ts";
import { getCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { verifyDoctorAccess } from "../_shared/doctorAccessGuard.ts";

// Legacy response builder
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
      id: e.id, user_id: userId, selected_date: e.date, selected_time: e.time,
      pain_level: e.intensityLabel.toLowerCase().replace(" ", "_"),
      medications: e.medications, notes: e.note,
      aura_type: e.aura || "keine", pain_locations: e.painLocations,
    })),
    entries_total: reportJson.tables.entriesTotal,
    entries_page: reportJson.tables.entriesPage,
    entries_page_size: reportJson.tables.entriesPageSize,
    medication_stats: reportJson.tables.medicationStats.map(m => ({
      name: m.name, intake_count: m.intakeCount, avg_effect: m.avgEffect, effect_count: m.effectCount,
    })),
    medication_courses: reportJson.tables.prophylaxisCourses.map(c => ({
      id: c.id, medication_name: c.name, start_date: c.startDate, end_date: c.endDate,
      dose_text: c.doseText, is_active: c.isActive, subjective_effectiveness: c.effectiveness,
      side_effects_text: c.sideEffects, discontinuation_reason: c.discontinuationReason, type: "prophylaxe",
    })),
    user_medications: [],
    location_stats: reportJson.tables.locationStats,
    from_date: reportJson.meta.fromDate,
    to_date: reportJson.meta.toDate,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handlePreflight(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const accessResult = await verifyDoctorAccess(req, supabase);
    if (!accessResult.valid) {
      return new Response(
        JSON.stringify({ error: "Freigabe beendet oder abgelaufen", reason: accessResult.reason }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { share_id: shareId, user_id: userId } = accessResult.payload!;

    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "3m";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const wantsLegacy = url.searchParams.get("legacy") === "1" || req.headers.get("x-report-legacy") === "1";

    // Snapshot flow
    let reportJson: DoctorReportJSON;
    const cached = await getCachedSnapshot(supabase, shareId, range);
    let needsRebuild = !cached || cached.isStale;

    if (cached && !cached.isStale) {
      const stale = await isSnapshotStale(supabase, userId, range, cached.sourceUpdatedAt);
      if (stale) {
        needsRebuild = true;
        await supabase.from("doctor_share_report_snapshots").update({ is_stale: true }).eq("id", cached.id);
      }
    }

    if (needsRebuild) {
      const { reportJson: newReport, sourceUpdatedAt } = await buildDoctorReportSnapshot(supabase, {
        userId, range, page, includePatientData: true,
      });
      await upsertSnapshot(supabase, shareId, range, newReport, sourceUpdatedAt, null);
      reportJson = newReport;
    } else if (page > 1) {
      const { reportJson: newReport } = await buildDoctorReportSnapshot(supabase, {
        userId, range, page, includePatientData: true,
      });
      reportJson = newReport;
    } else {
      reportJson = cached!.reportJson;
    }

    const enrichedReport: DoctorReportJSON = {
      ...reportJson,
      meta: { ...reportJson.meta, schemaVersion: "v1" },
    };

    const responseBody: Record<string, unknown> = { report: enrichedReport };
    if (wantsLegacy) Object.assign(responseBody, buildLegacyFields(enrichedReport, userId));

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
