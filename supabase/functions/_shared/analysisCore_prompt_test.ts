/**
 * Tests for buildSystemPrompt — verifies that the Alltag-&-Auslöser
 * (daily factors) instructions, evidence levels, number discipline,
 * privacy guard for Doctor-Share, and "no diagnosis" rule are present.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSystemPrompt, type AnalysisMeta } from "./analysisCore.ts";

const meta: AnalysisMeta = {
  totalDays: 90,
  voiceEventCount: 40,
  painEntryCount: 25,
  medicationIntakeCount: 12,
  daysWithPain: 18,
  daysWithMecfs: 0,
};

Deno.test("prompt: includes Tagesfaktoren / Alltag & Auslöser instruction", () => {
  const p = buildSystemPrompt(meta);
  assertStringIncludes(p, "Tagesfaktoren");
  assertStringIncludes(p, "mood");
  assertStringIncludes(p, "stress");
  assertStringIncludes(p, "sleep");
  assertStringIncludes(p, "energy");
  assertStringIncludes(p, "triggers");
});

Deno.test("prompt: covers temporal correlations T0/T-1/T-2/T+1 incl. PEM", () => {
  const p = buildSystemPrompt(meta);
  // After release-fix, PEM remains referenced; T0/T-1 explicit triggers were
  // dropped together with the mandatory-section block. We assert PEM stays.
  assertStringIncludes(p, "PEM");
});

Deno.test("prompt: enforces evidence levels and number discipline", () => {
  const p = buildSystemPrompt(meta);
  assertStringIncludes(p, "EVIDENZ");
  assertStringIncludes(p, "möglicher Hinweis");
  assertStringIncludes(p, "ZAHLEN-DISZIPLIN");
  assertStringIncludes(p, "Keine erfundenen");
});

Deno.test("prompt: forbids diagnosis", () => {
  const p = buildSystemPrompt(meta);
  assertStringIncludes(p, "Keine Diagnose");
  assertStringIncludes(p, "Hypothesen");
});

Deno.test("prompt: enforces 'less is better' leitlinie", () => {
  const p = buildSystemPrompt(meta);
  assertStringIncludes(p, "WENIGER IST BESSER");
});

Deno.test("prompt: no longer demands a minimum of 8 entries", () => {
  const p = buildSystemPrompt(meta);
  assert(!/MINDESTENS\s+8/i.test(p), "prompt must not require min 8 entries");
});

Deno.test("prompt: no longer forces weather coverage card", () => {
  const p = buildSystemPrompt(meta);
  assert(
    !/Wetterdaten\s+im\s+Zeitraum\s+nicht\s+ausreichend/i.test(p),
    "prompt must not mandate a weather-coverage confidence note",
  );
  assert(
    !/Lege\s+min\.\s*1\s+Hinweis/i.test(p),
    "prompt must not force a mandatory weather finding",
  );
});



Deno.test("prompt (App): includesPrivateNotes=true → no privacy note", () => {
  const p = buildSystemPrompt(meta, { includesPrivateNotes: true });
  assert(!p.includes("PRIVATSPHÄRE"), "App prompt must not contain Doctor-Share privacy clause");
});

Deno.test("prompt (Doctor-Share): includesPrivateNotes=false → adds privacy clause", () => {
  const p = buildSystemPrompt(meta, { includesPrivateNotes: false });
  assertStringIncludes(p, "PRIVATSPHÄRE");
  assertStringIncludes(p, "KEINE privaten Freitext");
});

Deno.test("prompt: thin-data warning kicks in below 10 entries", () => {
  const thin = buildSystemPrompt({ ...meta, voiceEventCount: 2, painEntryCount: 1 });
  assertStringIncludes(thin, "Sehr wenige Daten");
});
