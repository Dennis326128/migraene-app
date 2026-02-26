/**
 * Edge Function: ping-doctor-session
 * Hält die Arzt-Session aktiv (aktualisiert last_activity_at)
 * Auth: Header x-doctor-session (no cookies)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handlePreflight, getSessionIdFromHeader } from "../_shared/cors.ts";

const SESSION_TIMEOUT_MINUTES = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handlePreflight(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const sessionId = getSessionIdFromHeader(req);
    if (!sessionId) {
      return new Response(
        JSON.stringify({ active: false, reason: "no_session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: session, error: sessionError } = await supabase
      .from("doctor_share_sessions")
      .select(`
        id, last_activity_at, ended_at,
        doctor_shares!inner (
          id, expires_at, revoked_at, is_active
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

    if (session.ended_at) {
      return new Response(
        JSON.stringify({ active: false, reason: "session_ended" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const share = session.doctor_shares as {
      id: string; expires_at: string | null; revoked_at: string | null; is_active: boolean;
    };
    const now = new Date();

    if (share.revoked_at) {
      await supabase.from("doctor_share_sessions").update({ ended_at: now.toISOString() }).eq("id", sessionId);
      return new Response(
        JSON.stringify({ active: false, reason: "share_revoked" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check is_active + expires_at
    const isCurrentlyActive = share.is_active && (!share.expires_at || now < new Date(share.expires_at));
    if (!isCurrentlyActive) {
      await supabase.from("doctor_share_sessions").update({ ended_at: now.toISOString() }).eq("id", sessionId);
      return new Response(
        JSON.stringify({ active: false, reason: "not_shared" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inactivity timeout
    const lastActivity = new Date(session.last_activity_at);
    const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    if (minutesSinceActivity > SESSION_TIMEOUT_MINUTES) {
      await supabase.from("doctor_share_sessions").update({ ended_at: now.toISOString() }).eq("id", sessionId);
      return new Response(
        JSON.stringify({ active: false, reason: "session_timeout" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update activity
    await supabase.from("doctor_share_sessions").update({ last_activity_at: now.toISOString() }).eq("id", sessionId);

    return new Response(
      JSON.stringify({ active: true, remaining_minutes: Math.round(Math.max(0, SESSION_TIMEOUT_MINUTES - minutesSinceActivity)) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ active: false, reason: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
