/**
 * Edge Function: get-permanent-doctor-code
 * Holt den permanenten Arzt-Code des Nutzers.
 * Falls keiner existiert, wird einmalig einer erstellt.
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

    // Prüfe ob User bereits einen permanenten Code hat
    const { data: existingCode, error: fetchError } = await supabase
      .from("doctor_shares")
      .select("id, code, code_display, created_at")
      .eq("user_id", user.id)
      .is("revoked_at", null) // Nur nicht-widerrufene Codes
      .order("created_at", { ascending: true }) // Ältesten zuerst (den originalen)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Datenbankfehler" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Falls Code existiert, diesen zurückgeben
    if (existingCode) {
      return new Response(
        JSON.stringify({
          id: existingCode.id,
          code: existingCode.code,
          code_display: existingCode.code_display,
          created_at: existingCode.created_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Kein Code vorhanden -> Neuen erstellen mit Race-Condition-Schutz
    let attempts = 0;
    let codeData: { code: string; display: string } | null = null;
    
    while (attempts < 5) {
      const candidate = generateShareCode();
      
      // Prüfe ob Code bereits existiert (Code-Kollision, nicht User-Kollision)
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

    // Permanenten Code erstellen (kein Ablaufdatum)
    // Mit Unique-Index auf user_id WHERE revoked_at IS NULL geschützt
    const { data: newCode, error: insertError } = await supabase
      .from("doctor_shares")
      .insert({
        user_id: user.id,
        code: codeData.code,
        code_display: codeData.display,
        expires_at: null, // Kein Ablauf - permanent
        default_range: "3m",
      })
      .select("id, code, code_display, created_at")
      .single();

    // Falls Unique-Violation (Race Condition: anderer Request war schneller)
    if (insertError) {
      // Code 23505 = unique_violation in PostgreSQL
      if (insertError.code === "23505") {
        console.log("Race condition detected, fetching existing code");
        // Nochmal fetchen - der andere Request hat bereits einen Code erstellt
        const { data: raceCode } = await supabase
          .from("doctor_shares")
          .select("id, code, code_display, created_at")
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
