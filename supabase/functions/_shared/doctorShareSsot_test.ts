import { assert, assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSummaryMd,
  computeIsStale,
  loadDayFactors,
  loadLatestPatternAnalysis,
  computeDataStateSignature,
  type LatestAiReport,
} from "./doctorShareSsot.ts";

// ─────────────────────────────────────────────────────────────────────────
// Mock supabase builder (chainable)
// ─────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface TableSpec {
  rows: Row[];
}

function mockSupabase(tables: Record<string, TableSpec>) {
  return {
    from(table: string) {
      const spec = tables[table] ?? { rows: [] };
      let rows = [...spec.rows];
      const builder: any = {
        _filters: [] as Array<(r: Row) => boolean>,
        select(_cols: string, opts?: { head?: boolean; count?: string }) {
          this._head = opts?.head;
          this._count = opts?.count;
          return this;
        },
        eq(col: string, val: unknown) {
          this._filters.push((r) => r[col] === val);
          return this;
        },
        gte(col: string, val: unknown) {
          this._filters.push((r) => (r[col] as any) >= (val as any));
          return this;
        },
        lte(col: string, val: unknown) {
          this._filters.push((r) => (r[col] as any) <= (val as any));
          return this;
        },
        is(col: string, val: unknown) {
          this._filters.push((r) => r[col] === val);
          return this;
        },
        in(col: string, vals: unknown[]) {
          this._filters.push((r) => vals.includes(r[col]));
          return this;
        },
        order(col: string, opts: { ascending: boolean }) {
          rows = [...rows].sort((a, b) => {
            const av = a[col] as any, bv = b[col] as any;
            if (av === bv) return 0;
            return (av > bv ? 1 : -1) * (opts.ascending ? 1 : -1);
          });
          return this;
        },
        limit(n: number) {
          this._limit = n;
          return this;
        },
        async maybeSingle() {
          const filtered = rows.filter((r) => this._filters.every((f: any) => f(r)));
          return { data: filtered[0] ?? null, error: null };
        },
        then(resolve: any) {
          const filtered = rows.filter((r) => this._filters.every((f: any) => f(r)));
          const limited = this._limit ? filtered.slice(0, this._limit) : filtered;
          if (this._head) {
            resolve({ data: null, count: filtered.length, error: null });
          } else {
            resolve({ data: limited, error: null });
          }
        },
      };
      return builder;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// summaryMd
// ─────────────────────────────────────────────────────────────────────────

Deno.test("buildSummaryMd: produces markdown headings and bullets", () => {
  const built = buildSummaryMd({
    headline: "Musteranalyse Mai",
    summary: "Es zeigt sich ein Zusammenhang zwischen Schlaf und Migräne.",
    insights: [
      { title: "Schlechter Schlaf vor Migräne", description: "An 4 von 5 Migränetagen war Schlaf=2/5.", evidenceStrength: "medium" },
    ],
    correlations: [{ factorA: "Stress", factorB: "Schmerz +1d" }],
    recommendations: ["Schlaf-Routine mit Ärztin besprechen."],
  }) as any;
  assert(built.md.includes("## Musteranalyse Mai"));
  assert(built.md.includes("### Beobachtete Muster"));
  assert(built.md.includes("**Schlechter Schlaf vor Migräne**"));
  assert(built.md.includes("Evidenz: medium"));
  assert(built.md.includes("### Korrelationen"));
  assert(built.md.includes("Stress ↔ Schmerz +1d"));
  assert(built.md.includes("Schlaf-Routine mit Ärztin besprechen."));
});

Deno.test("buildSummaryMd: handles empty json with placeholder", () => {
  const built = buildSummaryMd({}) as any;
  assert(built.md.includes("keine strukturierten Beobachtungen"));
});

// ─────────────────────────────────────────────────────────────────────────
// isStale
// ─────────────────────────────────────────────────────────────────────────

function fakeReport(daysOld: number): LatestAiReport {
  return {
    id: "x",
    summaryMd: "",
    createdAtISO: new Date(Date.now() - daysOld * 86_400_000).toISOString(),
    periodFromISO: "2026-01-01",
    periodToISO: "2026-01-31",
    model: "m",
    source: "patient",
    insightsHash: "sha256:0",
    validationStatus: "ok",
  };
}

Deno.test("computeIsStale: null report → stale", () => {
  assertStrictEquals(computeIsStale(null, "sig", null), true);
});

Deno.test("computeIsStale: signature mismatch → stale", () => {
  assertStrictEquals(computeIsStale(fakeReport(1), "current-sig", "old-sig"), true);
});

Deno.test("computeIsStale: signature match + fresh → fresh", () => {
  assertStrictEquals(computeIsStale(fakeReport(1), "sig", "sig"), false);
});

Deno.test("computeIsStale: > 14 days → stale", () => {
  assertStrictEquals(computeIsStale(fakeReport(15), "sig", "sig"), true);
});

// ─────────────────────────────────────────────────────────────────────────
// Tagesfaktoren whitelist
// ─────────────────────────────────────────────────────────────────────────

Deno.test("loadDayFactors: never leaks free-text notes or transcripts", async () => {
  const tables: Record<string, TableSpec> = {
    voice_notes: {
      rows: [
        {
          user_id: "u1",
          context_type: "tageszustand",
          deleted_at: null,
          occurred_at: "2026-05-10T08:00:00Z",
          metadata: {
            mood: 3,
            stress: 4,
            sleep: 2,
            energy: 1,
            fatigueContextTags: ["pem", "BRAIN_FOG", "INVALID_TAG"],
            triggers: ["wetterumschwung", "stress"],
            notes: "Heute war sehr schwierig wegen privater Sache",
            rawTranscript: "Ich habe heute…",
            audioUrl: "https://leak/audio.mp3",
            specialEvent: "Geburtstag der Schwiegermutter",
          },
        },
      ],
    },
  };
  const sb = mockSupabase(tables) as any;
  const result = await loadDayFactors(sb, "u1", "2026-05-01", "2026-05-31");
  const json = JSON.stringify(result);
  // No leakage of free-text:
  assert(!json.includes("schwierig"), "private note must not leak");
  assert(!json.includes("Transcript") && !json.includes("rawTranscript"), "transcript must not leak");
  assert(!json.includes("audio"), "audio URL must not leak");
  assert(!json.includes("Schwiegermutter"), "special-event free text must not leak");
  // Whitelisted tags survive (lowercased), invalid tag dropped:
  assertEquals(result.daily[0].fatigueContextTags, ["pem", "brain_fog"]);
  assertEquals(result.daily[0].mood, 3);
  assertEquals(result.aggregates.avgStress, 4);
});

// ─────────────────────────────────────────────────────────────────────────
// loadLatestPatternAnalysis
// ─────────────────────────────────────────────────────────────────────────

Deno.test("loadLatestPatternAnalysis: returns most recent stored report", async () => {
  const tables: Record<string, TableSpec> = {
    ai_reports: {
      rows: [
        {
          id: "r1", user_id: "u1", report_type: "pattern_analysis",
          source: "patient", model: "google/gemini-2.5-flash",
          from_date: "2026-04-01", to_date: "2026-04-30",
          created_at: "2026-04-30T10:00:00Z",
          data_state_signature: "sha256:old",
          response_json: { headline: "April", insights: [{ title: "x" }] },
        },
        {
          id: "r2", user_id: "u1", report_type: "pattern_analysis",
          source: "doctor_share", model: "google/gemini-2.5-flash",
          from_date: "2026-05-01", to_date: "2026-05-31",
          created_at: "2026-05-12T10:00:00Z",
          data_state_signature: "sha256:new",
          response_json: { headline: "Mai" },
        },
      ],
    },
  };
  const sb = mockSupabase(tables) as any;
  const loaded = await loadLatestPatternAnalysis(sb, "u1", "2026-05-01", "2026-05-31");
  assert(loaded);
  assertEquals(loaded!.report.id, "r2");
  assertEquals(loaded!.report.source, "doctor");
  assertEquals(loaded!.storedSignature, "sha256:new");
  assert(loaded!.report.summaryMd.includes("## Mai"));
});

// ─────────────────────────────────────────────────────────────────────────
// computeDataStateSignature determinism
// ─────────────────────────────────────────────────────────────────────────

Deno.test("computeDataStateSignature: deterministic + changes when updated_at changes", async () => {
  const baseTables = (painUpdated: string): Record<string, TableSpec> => ({
    pain_entries: {
      rows: [{ user_id: "u1", selected_date: "2026-05-10", updated_at: painUpdated, id: 1 }],
    },
    medication_intakes: { rows: [] },
    voice_events: { rows: [] },
    voice_notes: { rows: [] },
    weather_logs: { rows: [] },
  });

  const a1 = await computeDataStateSignature(
    mockSupabase(baseTables("2026-05-10T10:00:00Z")) as any,
    "u1", "2026-05-01", "2026-05-31",
  );
  const a2 = await computeDataStateSignature(
    mockSupabase(baseTables("2026-05-10T10:00:00Z")) as any,
    "u1", "2026-05-01", "2026-05-31",
  );
  const a3 = await computeDataStateSignature(
    mockSupabase(baseTables("2026-05-11T10:00:00Z")) as any,
    "u1", "2026-05-01", "2026-05-31",
  );
  assertEquals(a1.signature, a2.signature);
  assert(a1.signature !== a3.signature, "signature must change when updated_at changes");
  assertEquals(a1.latestRelevantDataAt, "2026-05-10T10:00:00Z");
});
