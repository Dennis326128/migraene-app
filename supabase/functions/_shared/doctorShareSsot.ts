/**
 * doctorShareSsot.ts
 *
 * Single Source of Truth helpers for the Doctor-Share website:
 *   - Loads the latest stored pattern_analysis from `ai_reports`
 *   - Computes a deterministic data_state_signature across all relevant sources
 *   - Builds privacy-safe Tagesfaktoren (structured fields ONLY, no free text)
 *
 * Rules:
 *   - Service role required; ALWAYS filtered by ownerUserId.
 *   - NEVER returns free-text notes, transcripts, audio URLs, or
 *     "Was war heute besonders?" raw input.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { checkPatternAnalysisQuota } from "./aiQuotaGate.ts";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type AiConsentState = "granted" | "missing" | "revoked";
export type AiEnabledState = "enabled" | "disabled_by_patient" | "disabled_globally";

export interface SharePolicy {
  allowAiGenerate: boolean;
  shareDayFactors: boolean;
  aiConsentState: AiConsentState;
  aiEnabledState: AiEnabledState;
}

export interface QuotaState {
  remaining: number;
  limit: number;
  resetAtISO: string | null;
  isUnlimited: boolean;
}

export interface LatestAiReport {
  id: string;
  summaryMd: string;
  createdAtISO: string;
  periodFromISO: string;
  periodToISO: string;
  model: string;
  source: "patient" | "doctor";
  insightsHash: string;
  validationStatus: "ok" | "fallback";
}

export interface DayFactorEntry {
  dateISO: string;
  mood?: number;
  stress?: number;
  sleep?: number;
  sleepQuality?: number;
  energy?: number;
  fatigueContextTags?: string[];
  triggers?: string[];
  hadSpecialEvent?: boolean;
}

export interface DayFactorsPayload {
  daily: DayFactorEntry[];
  aggregates: {
    avgMood: number | null;
    avgStress: number | null;
    avgSleep: number | null;
    avgEnergy: number | null;
    topTags: Array<{ tag: string; count: number }>;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Hashing
// ─────────────────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(hash);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `sha256:${hex}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Data state signature
// ─────────────────────────────────────────────────────────────────────────

export interface DataStateResult {
  signature: string;
  latestRelevantDataAt: string | null;
}

async function maxUpdatedAt(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  filters: (q: any) => any,
): Promise<string | null> {
  try {
    const { data, error } = await filters(
      supabase.from(table).select("updated_at").eq("user_id", userId),
    )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data?.updated_at ?? null;
  } catch {
    return null;
  }
}

export async function computeDataStateSignature(
  supabase: SupabaseClient,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<DataStateResult> {
  const fromIso = `${fromDate}T00:00:00Z`;
  const toIso = `${toDate}T23:59:59Z`;

  const parts: Record<string, string | number | null> = {};

  // pain_entries
  parts.pain = await maxUpdatedAt(supabase, "pain_entries", userId, (q) =>
    q.gte("selected_date", fromDate).lte("selected_date", toDate),
  );
  // medication_intakes
  parts.med = await maxUpdatedAt(supabase, "medication_intakes", userId, (q) =>
    q.gte("taken_date", fromDate).lte("taken_date", toDate),
  );
  // voice_events (medical relevance items)
  parts.voice_events = await maxUpdatedAt(supabase, "voice_events", userId, (q) =>
    q.gte("event_timestamp", fromIso).lte("event_timestamp", toIso),
  );
  // voice_notes (Tagesfaktoren)
  parts.day_factors = await maxUpdatedAt(supabase, "voice_notes", userId, (q) =>
    q
      .eq("context_type", "tageszustand")
      .is("deleted_at", null)
      .gte("occurred_at", fromIso)
      .lte("occurred_at", toIso),
  );

  // Counts (so additions/deletions also flip the signature even when
  // updated_at is unchanged, e.g. row deletion).
  for (const [table, filterFn] of [
    ["pain_entries", (q: any) => q.gte("selected_date", fromDate).lte("selected_date", toDate)],
    ["medication_intakes", (q: any) => q.gte("taken_date", fromDate).lte("taken_date", toDate)],
  ] as const) {
    try {
      const { count } = await filterFn(
        supabase.from(table).select("id", { head: true, count: "exact" }).eq("user_id", userId),
      );
      parts[`${table}_count`] = count ?? 0;
    } catch {
      parts[`${table}_count`] = null;
    }
  }

  // weather_logs (best-effort — table may not be user-scoped)
  try {
    const { data } = await supabase
      .from("weather_logs")
      .select("updated_at")
      .eq("user_id", userId)
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    parts.weather = data?.updated_at ?? null;
  } catch {
    parts.weather = null;
  }

  // Latest across all
  const tsCandidates = [parts.pain, parts.med, parts.voice_events, parts.day_factors, parts.weather]
    .filter((v): v is string => typeof v === "string");
  const latestRelevantDataAt = tsCandidates.length
    ? tsCandidates.sort().slice(-1)[0]
    : null;

  const canonical = JSON.stringify({
    range: `${fromDate}/${toDate}`,
    parts,
  });
  const signature = await sha256Hex(canonical);

  return { signature, latestRelevantDataAt };
}

// ─────────────────────────────────────────────────────────────────────────
// summaryMd builder (from response_json)
// ─────────────────────────────────────────────────────────────────────────

export function buildSummaryMd(responseJson: unknown): { md: string; insightsHash: string } {
  // Deterministic Markdown projection of the stored analysis JSON.
  // We keep this defensive — the schema has evolved over time.
  const r = (responseJson ?? {}) as Record<string, any>;
  const lines: string[] = [];

  const headline = r.headline ?? r.title ?? "Musteranalyse";
  lines.push(`## ${String(headline)}`);
  lines.push("");

  if (typeof r.summary === "string" && r.summary.trim()) {
    lines.push(r.summary.trim());
    lines.push("");
  }

  const insights: any[] = Array.isArray(r.insights)
    ? r.insights
    : Array.isArray(r.findings)
    ? r.findings
    : Array.isArray(r.patterns)
    ? r.patterns
    : [];

  if (insights.length > 0) {
    lines.push("### Beobachtete Muster");
    for (const ins of insights.slice(0, 12)) {
      const title = ins?.title ?? ins?.headline ?? ins?.label ?? "Beobachtung";
      const desc = ins?.description ?? ins?.text ?? ins?.summary ?? "";
      const ev = ins?.evidenceStrength ?? ins?.evidence ?? null;
      const evTag = ev ? ` _(Evidenz: ${ev})_` : "";
      lines.push(`- **${String(title).trim()}**${evTag}${desc ? ` — ${String(desc).trim()}` : ""}`);
    }
    lines.push("");
  }

  const correlations: any[] = Array.isArray(r.correlations) ? r.correlations : [];
  if (correlations.length > 0) {
    lines.push("### Korrelationen");
    for (const c of correlations.slice(0, 10)) {
      const a = c?.factorA ?? c?.a ?? "Faktor A";
      const b = c?.factorB ?? c?.b ?? "Faktor B";
      const note = c?.note ?? c?.description ?? "";
      lines.push(`- ${a} ↔ ${b}${note ? ` — ${note}` : ""}`);
    }
    lines.push("");
  }

  const recs: any[] = Array.isArray(r.recommendations) ? r.recommendations : [];
  if (recs.length > 0) {
    lines.push("### Empfehlungen zur Besprechung mit der Ärztin/dem Arzt");
    for (const rec of recs.slice(0, 8)) {
      lines.push(`- ${typeof rec === "string" ? rec : rec?.text ?? JSON.stringify(rec)}`);
    }
    lines.push("");
  }

  if (lines.length <= 2) {
    lines.push("_Diese Analyse enthält keine strukturierten Beobachtungen._");
  }

  const md = lines.join("\n").trim();
  // insightsHash is stable for identical structured content.
  // We hash the canonical input rather than the rendered markdown.
  const hashInput = JSON.stringify({
    insights: insights.map((i) => ({ t: i?.title, d: i?.description, e: i?.evidenceStrength })),
    correlations: correlations.map((c) => ({ a: c?.factorA ?? c?.a, b: c?.factorB ?? c?.b })),
    recs: recs.map((x) => (typeof x === "string" ? x : x?.text)),
  });

  return { md, insightsHash: "" /* filled by caller via sha256Hex */, _hashInput: hashInput } as any;
}

// ─────────────────────────────────────────────────────────────────────────
// Latest stored ai_reports
// ─────────────────────────────────────────────────────────────────────────

export interface LoadedLatestReport {
  report: LatestAiReport;
  storedSignature: string | null;
}

export async function loadLatestPatternAnalysis(
  supabase: SupabaseClient,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<LoadedLatestReport | null> {
  // Prefer reports whose stored period covers the requested window.
  const { data: rows, error } = await supabase
    .from("ai_reports")
    .select("id,response_json,model,source,from_date,to_date,created_at,data_state_signature")
    .eq("user_id", userId)
    .eq("report_type", "pattern_analysis")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !rows || rows.length === 0) return null;

  const exact = rows.find((r) => r.from_date === fromDate && r.to_date === toDate);
  const overlap = rows.find(
    (r) => r.from_date && r.to_date && r.from_date <= fromDate && r.to_date >= toDate,
  );
  const chosen = exact ?? overlap ?? rows[0];

  const built = buildSummaryMd(chosen.response_json) as unknown as {
    md: string;
    _hashInput: string;
  };
  const insightsHash = await sha256Hex(built._hashInput);

  const validation = (chosen.response_json as any)?.validation;
  const validationStatus: "ok" | "fallback" =
    validation === "fallback" || (chosen.response_json as any)?.fallback === true
      ? "fallback"
      : "ok";

  const sourceMapped: "patient" | "doctor" =
    typeof chosen.source === "string" && chosen.source.includes("doctor") ? "doctor" : "patient";

  return {
    report: {
      id: chosen.id,
      summaryMd: built.md,
      createdAtISO: chosen.created_at,
      periodFromISO: chosen.from_date ?? fromDate,
      periodToISO: chosen.to_date ?? toDate,
      model: chosen.model ?? "unknown",
      source: sourceMapped,
      insightsHash,
      validationStatus,
    },
    storedSignature: chosen.data_state_signature ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Tagesfaktoren (privacy-safe)
// ─────────────────────────────────────────────────────────────────────────

const ALLOWED_FATIGUE_TAGS = new Set<string>([
  "pem", "post_exertional_malaise",
  "brain_fog", "kognition",
  "exhausted", "erschoepft",
  "wired_tired", "wired_but_tired",
  "crash", "low_energy",
  "good_day", "stable",
]);

function sanitizeStringArray(value: unknown, allowList?: Set<string>): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim().toLowerCase().slice(0, 64);
    if (!trimmed) continue;
    if (allowList && !allowList.has(trimmed)) continue;
    out.push(trimmed);
  }
  return out.length ? out : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function loadDayFactors(
  supabase: SupabaseClient,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<DayFactorsPayload> {
  const fromIso = `${fromDate}T00:00:00Z`;
  const toIso = `${toDate}T23:59:59Z`;

  const { data } = await supabase
    .from("voice_notes")
    .select("occurred_at,metadata")
    .eq("user_id", userId)
    .eq("context_type", "tageszustand")
    .is("deleted_at", null)
    .gte("occurred_at", fromIso)
    .lte("occurred_at", toIso)
    .order("occurred_at", { ascending: true })
    .limit(500);

  const rows = (data ?? []) as Array<{ occurred_at: string; metadata: Record<string, unknown> | null }>;

  const daily: DayFactorEntry[] = [];
  const tagCounts = new Map<string, number>();
  let moodSum = 0, moodN = 0;
  let stressSum = 0, stressN = 0;
  let sleepSum = 0, sleepN = 0;
  let energySum = 0, energyN = 0;

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const dateISO = row.occurred_at.slice(0, 10);

    const mood = num(meta.mood);
    const stress = num(meta.stress);
    const sleep = num(meta.sleep);
    const sleepQuality = num((meta as any).sleepQuality ?? meta.sleep_quality);
    const energy = num(meta.energy);
    const fatigueTags = sanitizeStringArray(
      (meta as any).fatigueContextTags ?? (meta as any).fatigue_context_tags,
      ALLOWED_FATIGUE_TAGS,
    );
    const triggers = sanitizeStringArray((meta as any).triggers);
    const hadSpecialEvent = typeof (meta as any).hadSpecialEvent === "boolean"
      ? (meta as any).hadSpecialEvent
      : Boolean((meta as any).special_event_present);

    const entry: DayFactorEntry = { dateISO };
    if (mood !== undefined) { entry.mood = mood; moodSum += mood; moodN++; }
    if (stress !== undefined) { entry.stress = stress; stressSum += stress; stressN++; }
    if (sleep !== undefined) { entry.sleep = sleep; sleepSum += sleep; sleepN++; }
    if (sleepQuality !== undefined) entry.sleepQuality = sleepQuality;
    if (energy !== undefined) { entry.energy = energy; energySum += energy; energyN++; }
    if (fatigueTags) entry.fatigueContextTags = fatigueTags;
    if (triggers) entry.triggers = triggers;
    if (hadSpecialEvent) entry.hadSpecialEvent = true;

    for (const t of fatigueTags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    for (const t of triggers ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);

    daily.push(entry);
  }

  const topTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    daily,
    aggregates: {
      avgMood: moodN ? round1(moodSum / moodN) : null,
      avgStress: stressN ? round1(stressSum / stressN) : null,
      avgSleep: sleepN ? round1(sleepSum / sleepN) : null,
      avgEnergy: energyN ? round1(energySum / energyN) : null,
      topTags,
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────
// Consent + ai_enabled state
// ─────────────────────────────────────────────────────────────────────────

export async function resolveAiConsentState(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiConsentState> {
  const { data } = await supabase
    .from("user_consents")
    .select("ai_processing_consent, consent_withdrawn_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return "missing";
  if (data.consent_withdrawn_at) return "revoked";
  return data.ai_processing_consent === true ? "granted" : "missing";
}

export async function resolveAiEnabledState(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiEnabledState> {
  if (Deno.env.get("AI_GLOBAL_DISABLED") === "true") return "disabled_globally";
  const { data } = await supabase
    .from("user_profiles")
    .select("ai_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (data && data.ai_enabled === false) return "disabled_by_patient";
  return "enabled";
}

// ─────────────────────────────────────────────────────────────────────────
// Quota state (read-only, no increment)
// ─────────────────────────────────────────────────────────────────────────

export async function loadQuotaState(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuotaState> {
  const check = await checkPatternAnalysisQuota(supabase, userId, { enforceCooldown: false });
  // Reset = first day of next calendar month, UTC.
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    remaining: check.quota.remaining,
    limit: check.quota.limit,
    resetAtISO: check.quota.isUnlimited ? null : reset.toISOString(),
    isUnlimited: check.quota.isUnlimited,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// isStale
// ─────────────────────────────────────────────────────────────────────────

const STALE_AFTER_DAYS = 14;

export function computeIsStale(
  latest: LatestAiReport | null,
  currentSignature: string,
  storedSignature: string | null,
): boolean {
  if (!latest) return true;
  if (!storedSignature || storedSignature !== currentSignature) return true;
  const ageMs = Date.now() - new Date(latest.createdAtISO).getTime();
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
