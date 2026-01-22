/**
 * Edge Function: ping-doctor-session
 * Hält die Arzt-Session aktiv (aktualisiert last_activity_at)
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
        JSON.stringify({ active: false, reason: "no_session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Supabase Client mit Service Role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Session laden
    const { data: session, error: sessionError } = await supabase
      .from("doctor_share_sessions")
      .select(`
        id,
        share_id,
        last_activity_at,
        ended_at,
        doctor_shares!inner (
          id,
          expires_at,
          revoked_at
        )
      `)
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ active: false, reason: "session_not_found" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Session bereits beendet?
    if (session.ended_at) {
      return new Response(
        JSON.stringify({ active: false, reason: "session_ended" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const share = session.doctor_shares as { id: string; expires_at: string; revoked_at: string | null };
    const now = new Date();

    // Share widerrufen?
    if (share.revoked_at) {
      // Session beenden
      await supabase
        .from("doctor_share_sessions")
        .update({ ended_at: now.toISOString() })
        .eq("id", sessionId);

      return new Response(
        JSON.stringify({ active: false, reason: "share_revoked" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Share abgelaufen?
    if (now > new Date(share.expires_at)) {
      await supabase
        .from("doctor_share_sessions")
        .update({ ended_at: now.toISOString() })
        .eq("id", sessionId);

      return new Response(
        JSON.stringify({ active: false, reason: "share_expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inaktivitäts-Timeout prüfen
    const lastActivity = new Date(session.last_activity_at);
    const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);

    if (minutesSinceActivity > SESSION_TIMEOUT_MINUTES) {
      await supabase
        .from("doctor_share_sessions")
        .update({ ended_at: now.toISOString() })
        .eq("id", sessionId);

      return new Response(
        JSON.stringify({ active: false, reason: "session_timeout" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Session aktiv → last_activity_at aktualisieren
    await supabase
      .from("doctor_share_sessions")
      .update({ last_activity_at: now.toISOString() })
      .eq("id", sessionId);

    // Verbleibende Minuten berechnen
    const remainingMinutes = Math.max(0, SESSION_TIMEOUT_MINUTES - minutesSinceActivity);

    return new Response(
      JSON.stringify({ 
        active: true, 
        remaining_minutes: Math.round(remainingMinutes) 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    const corsHeaders = getCorsHeaders(req);
    return new Response(
      JSON.stringify({ active: false, reason: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
