/**
 * Edge Function: activate-doctor-share
 * Aktiviert oder deaktiviert die zeitlich begrenzte Freigabe.
 *
 * POST (kein Body oder { action: "activate" }):
 *   → is_active = true, expires_at = now + ttl_minutes (default 1440 = 24h)
 *   → Baut sofort einen Report-Snapshot und pinnt ihn an den Share
 *
 * POST { action: "deactivate" | "revoke" }:
 *   → is_active = false (sofort beenden)
 *
 * Idempotent: Erneutes Aktivieren verlängert/erneuert expires_at + Snapshot.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildDoctorReportSnapshot,
  upsertSnapshot,
} from "../_shared/doctorReportSnapshot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_TTL_MINUTES = 24 * 60; // 24 hours

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    let action = "activate";
    let ttlMinutes = DEFAULT_TTL_MINUTES;
    let defaultRange: string | undefined;

    try {
      const body = await req.json();
      if (body.action === "deactivate" || body.action === "revoke") {
        action = "deactivate";
      }
      if (typeof body.ttl_minutes === "number" && body.ttl_minutes > 0) {
        ttlMinutes = body.ttl_minutes;
      }
      if (typeof body.default_range === "string") {
        defaultRange = body.default_range;
      }
    } catch {
      // No body = activate (default)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User-context client for auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service-role client for snapshot building (bypasses RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find existing share
    const { data: existingShare, error: fetchError } = await supabase
      .from("doctor_shares")
      .select("id, code_display, is_active, expires_at, default_range")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Datenbankfehler" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!existingShare) {
      return new Response(
        JSON.stringify({ error: "Kein Arzt-Code vorhanden. Bitte zuerst Code generieren." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();

    // === DEACTIVATE ===
    if (action === "deactivate") {
      const { error: updateError } = await supabase
        .from("doctor_shares")
        .update({
          is_active: false,
          share_active_until: now.toISOString(),
          share_revoked_at: now.toISOString(),
        })
        .eq("id", existingShare.id);

      if (updateError) {
        console.error("Update error:", updateError);
        return new Response(
          JSON.stringify({ error: "Freigabe konnte nicht beendet werden" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[Doctor Share] Deactivated for user ${user.id.substring(0, 8)}...`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Freigabe beendet",
          is_active: false,
          expires_at: existingShare.expires_at,
          is_currently_active: false,
          is_share_active: false,
          share_active_until: now.toISOString(),
          share_revoked_at: now.toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === ACTIVATE ===
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
    const shareRange = defaultRange || existingShare.default_range || "3m";

    const updateData: Record<string, unknown> = {
      is_active: true,
      expires_at: expiresAt.toISOString(),
      share_active_until: expiresAt.toISOString(),
      share_revoked_at: null,
    };

    if (defaultRange) {
      updateData.default_range = defaultRange;
    }

    const { error: updateError } = await supabase
      .from("doctor_shares")
      .update(updateData)
      .eq("id", existingShare.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Freigabe konnte nicht aktiviert werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Doctor Share] Activated for user ${user.id.substring(0, 8)}... until ${expiresAt.toISOString()}`);

    // ─────────────────────────────────────────────────────────────────────
    // SNAPSHOT PINNING: Build and persist the report snapshot immediately
    // This is the Single Source of Truth for the website view + PDF download.
    // The website will use exactly this snapshot instead of rebuilding from live data.
    // ─────────────────────────────────────────────────────────────────────
    let snapshotId: string | null = null;
    try {
      console.log(`[Doctor Share] Building pinned snapshot: shareId=${existingShare.id}, range=${shareRange}, userId=${user.id.substring(0, 8)}...`);

      const { reportJson, sourceUpdatedAt } = await buildDoctorReportSnapshot(serviceClient, {
        userId: user.id,
        range: shareRange,
        page: 1,
        includePatientData: true,
      });

      snapshotId = await upsertSnapshot(serviceClient, existingShare.id, shareRange, reportJson, sourceUpdatedAt, null);

      console.log(`[Doctor Share] ✅ Snapshot pinned: snapshotId=${snapshotId}, shareId=${existingShare.id}, range=${shareRange}, entries=${reportJson.tables?.entriesTotal ?? 0}, headacheDays=${reportJson.summary?.headacheDays ?? 0}`);
    } catch (snapshotErr) {
      // Non-fatal: activation still succeeds, website will build on-demand as fallback
      console.error(`[Doctor Share] ⚠️ Snapshot pinning failed (non-fatal):`, snapshotErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Freigabe aktiviert für ${Math.round(ttlMinutes / 60)} Stunden`,
        is_active: true,
        expires_at: expiresAt.toISOString(),
        is_currently_active: true,
        code_display: existingShare.code_display,
        snapshot_id: snapshotId,
        // Legacy compat
        is_share_active: true,
        share_active_until: expiresAt.toISOString(),
        share_revoked_at: null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Interner Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
