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
  assertStringIncludes(p, "T0");
  assertStringIncludes(p, "T-1");
  assertStringIncludes(p, "T-2");
  assertStringIncludes(p, "T+1");
  assertStringIncludes(p, "PEM");
});

Deno.test("prompt: enforces evidence levels and number discipline", () => {
  const p = buildSystemPrompt(meta);
  assertStringIncludes(p, "evidenceStrength");
  assertStringIncludes(p, "starker Hinweis");
  assertStringIncludes(p, "möglicher Zusammenhang");
  assertStringIncludes(p, "ZAHLEN-DISZIPLIN");
  assertStringIncludes(p, "Keine erfundenen");
});

Deno.test("prompt: forbids diagnosis", () => {
  const p = buildSystemPrompt(meta);
  assertStringIncludes(p, "Keine Diagnose");
  assertStringIncludes(p, "Hypothesen");
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
