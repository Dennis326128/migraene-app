/**
 * Edge Function: get-permanent-doctor-code
 * Holt den permanenten Arzt-Code des Nutzers.
 * Falls kein Code existiert, wird einmalig einer erstellt.
 * Idempotent: Gibt immer denselben Code zurück.
 *
 * Rückgabe:
 * { code, code_display, is_active, expires_at, is_currently_active, default_range, ... }
 *
 * is_currently_active = is_active AND (expires_at IS NULL OR expires_at > now())
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Code-Generator: 8 Zeichen aus sicherem Charset
const SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateShareCode(): { code: string; display: string } {
  let raw = "";
  for (let i = 0; i < 8; i++) {
    raw += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  }
  const display = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  return { code: raw, display };
}

/** Compute whether share is currently active */
function computeIsCurrentlyActive(isActive: boolean, expiresAt: string | null): boolean {
  if (!isActive) return false;
  if (!expiresAt) return true;
  return new Date(expiresAt) > new Date();
}

/** Build standardized response object */
function buildResponse(row: {
  id: string;
  code: string;
  code_display: string;
  created_at: string;
  is_active: boolean;
  expires_at: string | null;
  default_range: string;
}) {
  const isCurrentlyActive = computeIsCurrentlyActive(row.is_active, row.expires_at);

  // If expired but is_active still true, auto-correct in background (fire-and-forget)
  return {
    id: row.id,
    code: row.code,
    code_display: row.code_display,
    created_at: row.created_at,
    is_active: row.is_active,
    expires_at: row.expires_at,
    is_currently_active: isCurrentlyActive,
    default_range: row.default_range,
    // Legacy compatibility fields
    is_share_active: isCurrentlyActive,
    share_active_until: row.expires_at,
    share_revoked_at: (!row.is_active && row.expires_at) ? row.expires_at : null,
    was_revoked_today: false,
  };
}

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to fetch existing code (unique per user where revoked_at IS NULL)
    const { data: existing, error: fetchError } = await supabase
      .from("doctor_shares")
      .select("id, code, code_display, created_at, is_active, expires_at, default_range")
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

    // If exists, auto-correct expired is_active and return
    if (existing) {
      const isCurrentlyActive = computeIsCurrentlyActive(existing.is_active, existing.expires_at);

      // Auto-correct: if DB says active but actually expired, set is_active=false
      if (existing.is_active && !isCurrentlyActive) {
        await supabase
          .from("doctor_shares")
          .update({ is_active: false })
          .eq("id", existing.id);
        existing.is_active = false;
      }

      return new Response(
        JSON.stringify(buildResponse(existing)),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No code exists → create one (idempotent, collision-safe)
    let codeData: { code: string; display: string } | null = null;
    for (let attempts = 0; attempts < 5; attempts++) {
      const candidate = generateShareCode();
      const { data: collision } = await supabase
        .from("doctor_shares")
        .select("id")
        .eq("code", candidate.code)
        .maybeSingle();
      if (!collision) {
        codeData = candidate;
        break;
      }
    }

    if (!codeData) {
      return new Response(
        JSON.stringify({ error: "Code-Generierung fehlgeschlagen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: newCode, error: insertError } = await supabase
      .from("doctor_shares")
      .insert({
        user_id: user.id,
        code: codeData.code,
        code_display: codeData.display,
        expires_at: null,
        default_range: "3m",
        is_active: false,
      })
      .select("id, code, code_display, created_at, is_active, expires_at, default_range")
      .single();

    if (insertError) {
      // Race condition: another request created the code
      if (insertError.code === "23505") {
        console.log("Race condition detected, fetching existing code");
        const { data: raceCode } = await supabase
          .from("doctor_shares")
          .select("id, code, code_display, created_at, is_active, expires_at, default_range")
          .eq("user_id", user.id)
          .is("revoked_at", null)
          .single();

        if (raceCode) {
          return new Response(
            JSON.stringify(buildResponse(raceCode)),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Code konnte nicht erstellt werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(buildResponse(newCode)),
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
