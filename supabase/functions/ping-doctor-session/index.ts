/**
 * Edge Function: ping-doctor-session
 * Hält die Arzt-Session aktiv (aktualisiert last_activity_at)
 * Auth: Cookie (doctor_session) ODER Header (x-doctor-session)
 * 
 * Unterstützt permanente Codes (expires_at: NULL)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Erlaubte Origins für CORS mit Credentials
const ALLOWED_ORIGINS = [
  "https://migraina.lovable.app",
  "https://migraene-app.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com");

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "https://migraina.lovable.app",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-doctor-session, authorization, x-client-info, apikey, cookie",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
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

// Session ID extrahieren: Cookie ODER Header Fallback
function getSessionId(req: Request): string | null {
  // 1. Versuche Cookie
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);
  if (cookies["doctor_session"]) {
    return cookies["doctor_session"];
  }
  
  // 2. Fallback: Header (für Safari/iOS wo Cookies nicht funktionieren)
  const headerSession = req.headers.get("x-doctor-session");
  if (headerSession) {
    return headerSession;
  }
  
  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Session-ID aus Cookie ODER Header
    const sessionId = getSessionId(req);

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

    // Session laden (inkl. share_active_until für 24h-Fenster)
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
          revoked_at,
          share_active_until
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

    const share = session.doctor_shares as { 
      id: string; 
      expires_at: string | null;
      revoked_at: string | null;
      share_active_until: string | null;
    };
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

    // Code-Lebensdauer (expires_at kann NULL sein für permanente Codes)
    if (share.expires_at && now > new Date(share.expires_at)) {
      await supabase
        .from("doctor_share_sessions")
        .update({ ended_at: now.toISOString() })
        .eq("id", sessionId);

      return new Response(
        JSON.stringify({ active: false, reason: "share_expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NEU: 24h-Freigabe-Fenster prüfen (share_active_until)
    if (!share.share_active_until || now > new Date(share.share_active_until)) {
      await supabase
        .from("doctor_share_sessions")
        .update({ ended_at: now.toISOString() })
        .eq("id", sessionId);

      return new Response(
        JSON.stringify({ active: false, reason: "not_shared" }),
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
