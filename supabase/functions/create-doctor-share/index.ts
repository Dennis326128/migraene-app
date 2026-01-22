/**
 * Edge Function: create-doctor-share
 * Patient erstellt einen zeitlich begrenzten Freigabe-Code für Ärzte
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
  
  const code = letterPart + digitPart; // Normalisiert: "K7QF3921"
  const display = `${letterPart}-${digitPart}`; // Anzeige: "K7QF-3921"
  
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

    // Rate Limiting: Max 5 aktive Shares pro User
    const { count: activeSharesCount } = await supabase
      .from("doctor_shares")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());

    if (activeSharesCount !== null && activeSharesCount >= 5) {
      return new Response(
        JSON.stringify({ error: "Maximale Anzahl aktiver Freigaben erreicht (5)" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Code generieren mit Kollisionsprüfung
    let attempts = 0;
    let codeData: { code: string; display: string } | null = null;
    
    while (attempts < 5) {
      const candidate = generateShareCode();
      
      // Prüfe ob Code bereits existiert
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
        JSON.stringify({ error: "Code-Generierung fehlgeschlagen, bitte erneut versuchen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ablaufzeit: 24 Stunden
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Share erstellen
    const { data: share, error: insertError } = await supabase
      .from("doctor_shares")
      .insert({
        user_id: user.id,
        code: codeData.code,
        code_display: codeData.display,
        expires_at: expiresAt.toISOString(),
        default_range: "3m",
      })
      .select("id, code_display, expires_at, created_at")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Freigabe konnte nicht erstellt werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        id: share.id,
        code: share.code_display,
        expires_at: share.expires_at,
        created_at: share.created_at,
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
