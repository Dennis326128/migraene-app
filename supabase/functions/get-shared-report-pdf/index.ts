/**
 * Edge Function: get-shared-report-pdf
 * Generiert PDF für die Arzt-Ansicht
 * Auth: Cookie (doctor_session) ODER Header (x-doctor-session)
 * 
 * Unterstützt permanente Codes (expires_at: NULL)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

// Erlaubte Origins für CORS mit Credentials
const ALLOWED_ORIGINS = [
  "https://migraina.lovable.app",
  "https://migraene-app.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app");

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

// Date Range berechnen
function getDateRange(range: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  
  switch (range) {
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "3m":
      from.setMonth(from.getMonth() - 3);
      break;
    case "6m":
      from.setMonth(from.getMonth() - 6);
      break;
    case "12m":
      from.setFullYear(from.getFullYear() - 1);
      break;
    default:
      from.setMonth(from.getMonth() - 3);
  }
  
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

// Pain Level zu Zahl
function painLevelToNumber(level: string): number {
  const map: Record<string, number> = {
    "-": 0,
    "leicht": 3,
    "mittel": 5,
    "stark": 7,
    "sehr_stark": 9,
  };
  return map[level] ?? 5;
}

// Pain Level Label
function painLevelLabel(level: string): string {
  const map: Record<string, string> = {
    "-": "Kein Schmerz",
    "leicht": "Leicht",
    "mittel": "Mittel",
    "stark": "Stark",
    "sehr_stark": "Sehr stark",
  };
  return map[level] ?? level;
}

// Datum formatieren (deutsch)
function formatDateGerman(dateStr: string): string {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

// Zeit formatieren
function formatTime(timeStr: string | null): string {
  if (!timeStr) return "";
  return timeStr.substring(0, 5); // HH:MM
}

// Session validieren - inkl. share_active_until Prüfung für 24h-Fenster
async function validateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ valid: boolean; userId?: string; reason?: string }> {
  const { data: session, error } = await supabase
    .from("doctor_share_sessions")
    .select(`
      id,
      last_activity_at,
      ended_at,
      doctor_shares!inner (
        id,
        user_id,
        expires_at,
        revoked_at,
        share_active_until
      )
    `)
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !session) {
    return { valid: false, reason: "session_not_found" };
  }

  if (session.ended_at) {
    return { valid: false, reason: "session_ended" };
  }

  const share = session.doctor_shares as { 
    id: string; 
    user_id: string; 
    expires_at: string | null;
    revoked_at: string | null;
    share_active_until: string | null;
  };
  const now = new Date();

  // Hard-Check: dauerhaft widerrufen
  if (share.revoked_at) {
    return { valid: false, reason: "share_revoked" };
  }

  // Code-Lebensdauer (falls gesetzt)
  if (share.expires_at && now > new Date(share.expires_at)) {
    return { valid: false, reason: "share_expired" };
  }

  // NEU: 24h-Freigabe-Fenster prüfen
  if (!share.share_active_until || now > new Date(share.share_active_until)) {
    return { valid: false, reason: "not_shared" };
  }

  // Session-Timeout
  const lastActivity = new Date(session.last_activity_at);
  const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);

  if (minutesSinceActivity > SESSION_TIMEOUT_MINUTES) {
    return { valid: false, reason: "session_timeout" };
  }

  return { valid: true, userId: share.user_id };
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
        JSON.stringify({ error: "Keine aktive Sitzung" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Supabase Client mit Service Role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Session validieren
    const sessionResult = await validateSession(supabase, sessionId);
    if (!sessionResult.valid) {
      return new Response(
        JSON.stringify({ error: "Sitzung abgelaufen", reason: sessionResult.reason }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = sessionResult.userId!;

    // Query-Parameter
    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "3m";
    const { from, to } = getDateRange(range);

    // Session Activity aktualisieren
    await supabase
      .from("doctor_share_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", sessionId);

    // ═══════════════════════════════════════════════════════════════════════
    // DATEN LADEN
    // ═══════════════════════════════════════════════════════════════════════

    const { data: entries } = await supabase
      .from("pain_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("selected_date", from)
      .lte("selected_date", to)
      .order("selected_date", { ascending: false })
      .order("selected_time", { ascending: false });

    const allEntries = entries || [];

    // ═══════════════════════════════════════════════════════════════════════
    // SUMMARY BERECHNEN
    // ═══════════════════════════════════════════════════════════════════════

    const painDays = new Set(
      allEntries
        .filter(e => e.pain_level && e.pain_level !== "-")
        .map(e => e.selected_date)
    );

    const migraineDays = new Set(
      allEntries
        .filter(e => e.pain_level === "stark" || e.pain_level === "sehr_stark")
        .map(e => e.selected_date)
    );

    // Erweiterte Triptan-Keyword-Liste
    const triptanKeywords = [
      "triptan", "almotriptan", "eletriptan", "frovatriptan", 
      "naratriptan", "rizatriptan", "sumatriptan", "zolmitriptan",
      "suma", "riza", "zolmi", "nara", "almo", "ele", "frova",
      "imigran", "maxalt", "ascotop", "naramig", "almogran",
      "relpax", "allegro", "dolotriptan", "formigran"
    ];
    
    const triptanDays = new Set(
      allEntries
        .filter(e => 
          e.medications?.some((med: string) => 
            triptanKeywords.some(kw => med.toLowerCase().includes(kw))
          )
        )
        .map(e => e.selected_date)
    );

    const acuteMedDays = new Set(
      allEntries
        .filter(e => e.medications && e.medications.length > 0)
        .map(e => e.selected_date)
    );

    const painLevels = allEntries
      .filter(e => e.pain_level && e.pain_level !== "-")
      .map(e => painLevelToNumber(e.pain_level));
    const avgIntensity = painLevels.length > 0
      ? painLevels.reduce((a, b) => a + b, 0) / painLevels.length
      : 0;

    // ═══════════════════════════════════════════════════════════════════════
    // PDF ERSTELLEN (vereinfachte Version für Arzt-Ansicht)
    // ═══════════════════════════════════════════════════════════════════════

    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 40;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // ─── HEADER ───
    page.drawText("Kopfschmerztagebuch", {
      x: margin,
      y,
      size: 20,
      font: helveticaBold,
      color: rgb(0.15, 0.35, 0.65),
    });
    y -= 25;

    page.drawText(`Zeitraum: ${formatDateGerman(from)} – ${formatDateGerman(to)}`, {
      x: margin,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 15;

    page.drawText(`Erstellt am: ${formatDateGerman(new Date().toISOString().split("T")[0])}`, {
      x: margin,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 30;

    // ─── ZUSAMMENFASSUNG ───
    page.drawText("Zusammenfassung", {
      x: margin,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0.15, 0.35, 0.65),
    });
    y -= 20;

    const summaryItems = [
      { label: "Kopfschmerztage", value: painDays.size.toString() },
      { label: "Migränetage (stark/sehr stark)", value: migraineDays.size.toString() },
      { label: "Triptantage", value: triptanDays.size.toString() },
      { label: "Tage mit Akutmedikation", value: acuteMedDays.size.toString() },
      { label: "Ø Intensität", value: avgIntensity.toFixed(1) },
    ];

    summaryItems.forEach(item => {
      page.drawText(`${item.label}:`, {
        x: margin,
        y,
        size: 10,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
      page.drawText(item.value, {
        x: margin + 200,
        y,
        size: 10,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 15;
    });
    y -= 20;

    // ─── EINTRÄGE ───
    page.drawText("Episoden-Liste", {
      x: margin,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0.15, 0.35, 0.65),
    });
    y -= 20;

    // Tabellenkopf
    const colWidths = [80, 60, 150, 200];
    const headers = ["Datum", "Intensität", "Medikamente", "Notizen"];
    let x = margin;
    
    headers.forEach((header, i) => {
      page.drawText(header, {
        x,
        y,
        size: 9,
        font: helveticaBold,
        color: rgb(0.3, 0.3, 0.3),
      });
      x += colWidths[i];
    });
    y -= 5;

    // Linie
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 12;

    // Einträge (max 40 pro Seite)
    const maxEntriesPerPage = 40;
    let entriesOnPage = 0;

    for (const entry of allEntries) {
      if (y < margin + 50 || entriesOnPage >= maxEntriesPerPage) {
        // Neue Seite
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        entriesOnPage = 0;

        // Tabellenkopf wiederholen
        x = margin;
        headers.forEach((header, i) => {
          page.drawText(header, {
            x,
            y,
            size: 9,
            font: helveticaBold,
            color: rgb(0.3, 0.3, 0.3),
          });
          x += colWidths[i];
        });
        y -= 5;
        page.drawLine({
          start: { x: margin, y },
          end: { x: pageWidth - margin, y },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        });
        y -= 12;
      }

      x = margin;

      // Datum + Zeit
      const dateTime = `${formatDateGerman(entry.selected_date)}${entry.selected_time ? `, ${formatTime(entry.selected_time)}` : ""}`;
      page.drawText(dateTime.substring(0, 15), {
        x,
        y,
        size: 8,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
      x += colWidths[0];

      // Intensität
      page.drawText(painLevelLabel(entry.pain_level), {
        x,
        y,
        size: 8,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
      x += colWidths[1];

      // Medikamente
      const meds = (entry.medications || []).join(", ");
      page.drawText(meds.substring(0, 30) + (meds.length > 30 ? "..." : ""), {
        x,
        y,
        size: 8,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
      x += colWidths[2];

      // Notizen
      const notes = (entry.notes || "").replace(/\n/g, " ");
      page.drawText(notes.substring(0, 40) + (notes.length > 40 ? "..." : ""), {
        x,
        y,
        size: 8,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });

      y -= 12;
      entriesOnPage++;
    }

    // ─── FOOTER ───
    const pages = pdfDoc.getPages();
    pages.forEach((p, index) => {
      p.drawText(`Seite ${index + 1} von ${pages.length}`, {
        x: pageWidth / 2 - 30,
        y: 20,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
      p.drawText("Generiert für ärztliche Einsicht", {
        x: margin,
        y: 20,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    });

    // PDF ausgeben
    const pdfBytes = await pdfDoc.save();
    const filename = `Kopfschmerztagebuch_${formatDateGerman(from)}-${formatDateGerman(to)}.pdf`.replace(/\./g, "-");

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    const corsHeaders = getCorsHeaders(req);
    return new Response(
      JSON.stringify({ error: "PDF-Generierung fehlgeschlagen" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
