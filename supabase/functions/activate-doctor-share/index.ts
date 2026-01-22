/**
 * Edge Function: activate-doctor-share
 * Aktiviert/Beendet die 24h-Freigabe für den Arzt-Code des Nutzers
 * 
 * POST mit { action: "activate" }: Aktiviert Freigabe (share_active_until = now + 24h)
 * POST mit { action: "revoke" }: Beendet Freigabe sofort
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth prüfen
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Body parsen für action
    let action = "activate";
    try {
      const body = await req.json();
      if (body.action === "revoke") {
        action = "revoke";
      }
    } catch {
      // Kein Body = activate (Standard)
    }

    // Supabase Client mit User-Token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // User verifizieren
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Bestehenden Code finden
    const { data: existingShare, error: fetchError } = await supabase
      .from("doctor_shares")
      .select("id, code, code_display, share_active_until, share_revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: true })
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
        JSON.stringify({ error: "Kein Arzt-Code vorhanden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();

    // REVOKE = Freigabe beenden
    if (action === "revoke") {
      const { error: updateError } = await supabase
        .from("doctor_shares")
        .update({
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

      console.log(`[Doctor Share] Revoked share for user ${user.id.substring(0, 8)}...`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Freigabe beendet",
          share_active_until: now.toISOString(),
          share_revoked_at: now.toISOString(),
          is_share_active: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTIVATE = Freigabe aktivieren (24h)
    const activeUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { error: updateError } = await supabase
      .from("doctor_shares")
      .update({
        share_active_until: activeUntil.toISOString(),
        share_revoked_at: null, // Reset revoked_at beim Aktivieren
      })
      .eq("id", existingShare.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Freigabe konnte nicht aktiviert werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Doctor Share] Activated share for user ${user.id.substring(0, 8)}... until ${activeUntil.toISOString()}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Freigabe aktiviert für 24 Stunden",
        share_active_until: activeUntil.toISOString(),
        share_revoked_at: null,
        is_share_active: true,
        code_display: existingShare.code_display,
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
