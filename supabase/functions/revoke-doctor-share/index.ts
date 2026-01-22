/**
 * Edge Function: revoke-doctor-share
 * Patient widerruft einen aktiven Share
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

    // Body parsen
    const body = await req.json().catch(() => ({}));
    const shareId = body.share_id;

    if (!shareId) {
      return new Response(
        JSON.stringify({ error: "share_id fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Share widerrufen (RLS prüft automatisch user_id)
    const { data: updated, error: updateError } = await supabase
      .from("doctor_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", shareId)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("Revoke error:", updateError);
      return new Response(
        JSON.stringify({ error: "Widerruf fehlgeschlagen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!updated) {
      return new Response(
        JSON.stringify({ error: "Freigabe nicht gefunden oder bereits widerrufen" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Alle aktiven Sessions beenden (Service Role nötig)
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabaseService
      .from("doctor_share_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("share_id", shareId)
      .is("ended_at", null);

    return new Response(
      JSON.stringify({ revoked: true }),
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
