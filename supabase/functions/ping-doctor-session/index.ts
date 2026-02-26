/**
 * Edge Function: ping-doctor-session
 * DEPRECATED: No longer used for auth gating.
 * Kept for backwards compatibility — returns active status based on token + DB check.
 * Auth: Header x-doctor-access (signed HMAC token)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { verifyDoctorAccess } from "../_shared/doctorAccessGuard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handlePreflight(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const accessResult = await verifyDoctorAccess(req, supabase);
    if (!accessResult.valid) {
      return new Response(
        JSON.stringify({ active: false, reason: accessResult.reason }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get expires_at for display
    const { data: share } = await supabase
      .from("doctor_shares")
      .select("expires_at")
      .eq("id", accessResult.payload!.share_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ active: true, expires_at: share?.expires_at || null }),
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
