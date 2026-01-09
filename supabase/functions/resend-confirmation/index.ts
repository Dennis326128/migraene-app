import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate-Limit Konfiguration
const RATE_LIMITS = {
  IP_MAX_REQUESTS: 3,
  IP_WINDOW_MINUTES: 15,
  EMAIL_MAX_REQUESTS: 3,
  EMAIL_WINDOW_MINUTES: 30,
};

// SHA-256 Hash für IP/Email (Anti-Enumeration)
async function hashValue(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// IP aus Request extrahieren
function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Nur POST erlaubt
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ message: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Request Body parsen
    let email: string | undefined;
    try {
      const body = await req.json();
      email = body.email;
    } catch {
      email = undefined;
    }

    // Generische Antwort (immer 200, Anti-Enumeration)
    const successResponse = () =>
      new Response(
        JSON.stringify({
          success: true,
          message: "Wenn ein Konto mit dieser E-Mail existiert, wurde eine Bestätigungsmail gesendet.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    // Keine E-Mail = sofort generische Antwort
    if (!email || typeof email !== "string" || !email.includes("@")) {
      console.log("[resend-confirmation] No valid email provided, returning success");
      return successResponse();
    }

    const normalizedEmail = email.toLowerCase().trim();
    const clientIP = getClientIP(req);
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Hashes erstellen
    const ipHash = await hashValue(clientIP);
    const emailHash = await hashValue(normalizedEmail);

    console.log(`[resend-confirmation] Request from IP hash: ${ipHash.substring(0, 8)}...`);

    // Rate-Limit prüfen: IP
    const ipCutoff = new Date(Date.now() - RATE_LIMITS.IP_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count: ipCount } = await supabase
      .from("resend_confirmation_logs")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .eq("allowed", true)
      .gte("created_at", ipCutoff);

    if ((ipCount ?? 0) >= RATE_LIMITS.IP_MAX_REQUESTS) {
      console.log(`[resend-confirmation] IP rate limit exceeded: ${ipCount} requests`);
      
      // Log blocked request
      await supabase.from("resend_confirmation_logs").insert({
        ip_hash: ipHash,
        email_hash: emailHash,
        allowed: false,
        reason: "ip_rate_limit",
        user_agent: userAgent,
      });

      // Silent drop - return success anyway (Anti-Enumeration)
      return successResponse();
    }

    // Rate-Limit prüfen: Email
    const emailCutoff = new Date(Date.now() - RATE_LIMITS.EMAIL_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count: emailCount } = await supabase
      .from("resend_confirmation_logs")
      .select("*", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .eq("allowed", true)
      .gte("created_at", emailCutoff);

    if ((emailCount ?? 0) >= RATE_LIMITS.EMAIL_MAX_REQUESTS) {
      console.log(`[resend-confirmation] Email rate limit exceeded: ${emailCount} requests`);
      
      // Log blocked request
      await supabase.from("resend_confirmation_logs").insert({
        ip_hash: ipHash,
        email_hash: emailHash,
        allowed: false,
        reason: "email_rate_limit",
        user_agent: userAgent,
      });

      // Silent drop
      return successResponse();
    }

    // Rate-Limit OK - Resend durchführen
    console.log(`[resend-confirmation] Rate limit OK, attempting resend for email hash: ${emailHash.substring(0, 8)}...`);

    // Supabase Auth Resend (Admin API)
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/auth/confirm?type=email&next=/`,
      },
    });

    if (resendError) {
      console.log(`[resend-confirmation] Resend error (might be expected): ${resendError.message}`);
      // Nicht loggen ob Fehler = User existiert nicht (Anti-Enumeration)
    } else {
      console.log(`[resend-confirmation] Resend successful`);
    }

    // Log successful attempt (regardless of actual email sent)
    await supabase.from("resend_confirmation_logs").insert({
      ip_hash: ipHash,
      email_hash: emailHash,
      allowed: true,
      reason: resendError ? "user_not_found_or_confirmed" : "sent",
      user_agent: userAgent,
    });

    return successResponse();
  } catch (error) {
    console.error("[resend-confirmation] Unexpected error:", error);
    
    // Even on error, return generic success (Anti-Enumeration)
    return new Response(
      JSON.stringify({
        success: true,
        message: "Wenn ein Konto mit dieser E-Mail existiert, wurde eine Bestätigungsmail gesendet.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
