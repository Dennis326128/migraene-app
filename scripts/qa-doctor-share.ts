/**
 * scripts/qa-doctor-share.ts
 *
 * QA / DEV helper — creates or extends a Doctor-Share for a given test patient
 * and toggles the SSOT flags used by the website integration.
 *
 * SECURITY:
 *   - REQUIRES SUPABASE_SERVICE_ROLE_KEY in env. Refuses to run without it.
 *   - REQUIRES QA_DEV_SECRET in env (a local secret you set yourself) to ensure
 *     this never runs unattended in CI / production. Choose any value.
 *   - Hard cap on TTL (max 7 days). Default TTL is 24h.
 *   - Never deployed as an Edge Function. Local Deno only:
 *
 * USAGE:
 *   QA_DEV_SECRET=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   deno run --allow-env --allow-net scripts/qa-doctor-share.ts \
 *     --user <UUID> \
 *     [--ttl-hours 24] \
 *     [--include-ai] [--allow-generate] [--share-day-factors] \
 *     [--reuse]            # extend an existing active share for this user
 *
 * OUTPUT:
 *   {
 *     "code": "ABCD-1234",
 *     "shareId": "...",
 *     "userId": "...",
 *     "expiresAtISO": "...",
 *     "settings": { include_ai_analysis, allow_ai_generate, share_day_factors }
 *   }
 */

const args = new Map<string, string | boolean>();
for (let i = 0; i < Deno.args.length; i++) {
  const a = Deno.args[i];
  if (a.startsWith("--")) {
    const next = Deno.args[i + 1];
    if (next && !next.startsWith("--")) { args.set(a.slice(2), next); i++; }
    else args.set(a.slice(2), true);
  }
}

function fail(msg: string): never {
  console.error(`[qa-doctor-share] ${msg}`);
  Deno.exit(1);
}

const QA_DEV_SECRET = Deno.env.get("QA_DEV_SECRET");
if (!QA_DEV_SECRET) fail("Refusing to run: QA_DEV_SECRET env var must be set.");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.");

const userId = String(args.get("user") ?? "");
if (!/^[0-9a-f-]{36}$/i.test(userId)) fail("--user <UUID> required.");

const ttlHours = Math.min(Number(args.get("ttl-hours") ?? 24), 24 * 7);
if (!Number.isFinite(ttlHours) || ttlHours <= 0) fail("--ttl-hours must be 1..168");

const includeAi = Boolean(args.get("include-ai"));
const allowGen = Boolean(args.get("allow-generate"));
const shareDayFactors = Boolean(args.get("share-day-factors"));
const reuse = Boolean(args.get("reuse"));
const dryRun = Boolean(args.get("dry-run"));

const { createClient } = await import("jsr:@supabase/supabase-js@2");
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

function genCode(): { code: string; display: string } {
  const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map((b) => ALPH[b % ALPH.length]).join("");
  const display = `${pick(4)}-${pick(4)}`;
  return { code: display.toLowerCase().replace("-", ""), display };
}

const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();

let shareId: string;
let codeDisplay: string;

if (reuse) {
  const { data: existing } = await sb.from("doctor_shares")
    .select("id, code_display")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (!existing) fail("--reuse: no active share found for user.");
  shareId = existing.id;
  codeDisplay = existing.code_display;
  if (!dryRun) {
    await sb.from("doctor_shares")
      .update({ share_active_until: expiresAt, expires_at: expiresAt, share_revoked_at: null, revoked_at: null, is_active: true })
      .eq("id", shareId);
  }
} else {
  const { code, display } = genCode();
  codeDisplay = display;
  if (dryRun) {
    shareId = "<dry-run-no-insert>";
  } else {
    const { data, error } = await sb.from("doctor_shares")
      .insert({
        user_id: userId,
        code,
        code_display: display,
        is_active: true,
        share_active_until: expiresAt,
        expires_at: expiresAt,
        default_range: "3m",
      })
      .select("id").single();
    if (error || !data) fail(`Insert share failed: ${error?.message}`);
    shareId = data!.id;
  }
}

if (!dryRun) {
  await sb.from("doctor_share_settings").upsert({
    share_id: shareId,
    include_ai_analysis: includeAi,
    allow_ai_generate: allowGen,
    share_day_factors: shareDayFactors,
    range_preset: "3m",
  }, { onConflict: "share_id" });
}

console.log(JSON.stringify({
  dryRun,
  code: codeDisplay,
  shareId,
  userId,
  expiresAtISO: expiresAt,
  settings: {
    include_ai_analysis: includeAi,
    allow_ai_generate: allowGen,
    share_day_factors: shareDayFactors,
  },
  note: dryRun
    ? "DRY-RUN — nothing was written to the database."
    : "DEV/QA ONLY. Code expires automatically. Do not commit codes.",
}, null, 2));
