/**
 * Edge Function: get-doctor-share-status
 * Holt den permanenten Arzt-Code und Freigabe-Status des Nutzers.
 * Falls kein Code existiert, wird einmalig einer erstellt.
 * 
 * NEU: Unterstützt 24h-Freigabe-Fenster via share_active_until
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Code-Generator: 4 Buchstaben + 4 Zahlen
function generateShareCode(): { code: string; display: string } {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Ohne I, O (verwechselbar)
  const digits = "0123456789";
  
  let letterPart = "";
  let digitPart = "";
  
  for (let i = 0; i < 4; i++) {
    letterPart += letters[Math.floor(Math.random() * letters.length)];
    digitPart += digits[Math.floor(Math.random() * digits.length)];
  }
  
  const code = letterPart + digitPart;
  const display = `${letterPart}-${digitPart}`;
  
  return { code, display };
}

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

    // Prüfe ob User bereits einen Code hat
    const { data: existingCode, error: fetchError } = await supabase
      .from("doctor_shares")
      .select("id, code, code_display, created_at, share_active_until, share_revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null) // Nur nicht-widerrufene Codes
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

    // Falls Code existiert, diesen mit Freigabe-Status zurückgeben
    if (existingCode) {
      const now = new Date();
      const shareActiveUntil = existingCode.share_active_until 
        ? new Date(existingCode.share_active_until) 
        : null;
      const shareRevokedAt = existingCode.share_revoked_at
        ? new Date(existingCode.share_revoked_at)
        : null;
      
      // Berechne ob Freigabe aktiv ist
      const isShareActive = shareActiveUntil && shareActiveUntil > now;
      
      // Berechne ob heute bewusst beendet wurde (in User-Zeitzone vereinfacht)
      // Wir prüfen: Wurde in den letzten 24h bewusst beendet?
      const wasRevokedToday = shareRevokedAt && 
        (now.getTime() - shareRevokedAt.getTime()) < 24 * 60 * 60 * 1000;

      return new Response(
        JSON.stringify({
          id: existingCode.id,
          code: existingCode.code,
          code_display: existingCode.code_display,
          created_at: existingCode.created_at,
          share_active_until: existingCode.share_active_until,
          share_revoked_at: existingCode.share_revoked_at,
          is_share_active: isShareActive,
          was_revoked_today: wasRevokedToday,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Kein Code vorhanden -> Neuen erstellen
    let attempts = 0;
    let codeData: { code: string; display: string } | null = null;
    
    while (attempts < 5) {
      const candidate = generateShareCode();
      
      const { data: existing } = await supabase
        .from("doctor_shares")
        .select("id")
        .eq("code", candidate.code)
        .maybeSingle();
      
      if (!existing) {
        codeData = candidate;
        break;
      }
      attempts++;
    }

    if (!codeData) {
      return new Response(
        JSON.stringify({ error: "Code-Generierung fehlgeschlagen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Permanenten Code erstellen (ohne aktive Freigabe)
    const { data: newCode, error: insertError } = await supabase
      .from("doctor_shares")
      .insert({
        user_id: user.id,
        code: codeData.code,
        code_display: codeData.display,
        expires_at: null, // Kein Ablauf - Code ist permanent
        default_range: "3m",
        share_active_until: null, // Freigabe noch nicht aktiv
        share_revoked_at: null,
      })
      .select("id, code, code_display, created_at, share_active_until, share_revoked_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        console.log("Race condition detected, fetching existing code");
        const { data: raceCode } = await supabase
          .from("doctor_shares")
          .select("id, code, code_display, created_at, share_active_until, share_revoked_at")
          .eq("user_id", user.id)
          .is("revoked_at", null)
          .single();

        if (raceCode) {
          return new Response(
            JSON.stringify({
              id: raceCode.id,
              code: raceCode.code,
              code_display: raceCode.code_display,
              created_at: raceCode.created_at,
              share_active_until: raceCode.share_active_until,
              share_revoked_at: raceCode.share_revoked_at,
              is_share_active: false,
              was_revoked_today: false,
            }),
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
      JSON.stringify({
        id: newCode.id,
        code: newCode.code,
        code_display: newCode.code_display,
        created_at: newCode.created_at,
        share_active_until: newCode.share_active_until,
        share_revoked_at: newCode.share_revoked_at,
        is_share_active: false,
        was_revoked_today: false,
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
