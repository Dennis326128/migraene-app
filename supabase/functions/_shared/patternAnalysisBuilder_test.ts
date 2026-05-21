/**
 * Tests for the shared pattern-analysis V2.2 builder. Uses an injected
 * fetch mock so no real LLM is called. Validates the public envelope
 * contract that the App UI and the Website Doctor-Share consume:
 *   - schema_version: "2.1"
 *   - analysis_version: "2.2.0"
 *   - scope + meta present
 *   - postprocessed llm_expanded_findings
 *   - input-sanity gates (INSUFFICIENT_DATA, CONTEXT_TOO_LARGE)
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  runPatternAnalysisV22,
  extractAnalysisFromLLMResponse,
  validateExtractedResult,
  SCHEMA_VERSION,
  ANALYSIS_VERSION,
  MAX_CONTEXT_CHARS,
} from "./patternAnalysisBuilder.ts";

const META = {
  totalDays: 30,
  voiceEventCount: 4,
  painEntryCount: 18,
  medicationIntakeCount: 7,
  daysWithPain: 12,
  daysWithMecfs: 6,
};

function fakeLLMResponse(args: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      choices: [{
        message: {
          tool_calls: [{
            function: {
              name: "submit_voice_analysis",
              arguments: JSON.stringify(args),
            },
          }],
        },
      }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const VALID_ARGS = {
  summary: "Wichtigste Beobachtung: Medikamenten-Zurückhaltung an Schmerztagen.",
  possiblePatterns: [],
  painContextFindings: [],
  fatigueContextFindings: [],
  medicationContextFindings: [],
  recurringSequences: [],
  openQuestions: ["Wie wirkt Triptan, wenn früh eingenommen?"],
  confidenceNotes: ["Wetterabdeckung 14 Tage."],
  llm_expanded_findings: [
    {
      id: "weather.llm.1",
      category: "weather",
      title: "Druckabfall fällt mit Schmerztagen zusammen",
      evidence_level: "low",
      source_basis: "preanalysis",
      related_deterministic_finding_ids: [],
      summary: "An Tagen mit Druckabfall häufen sich Schmerzeinträge.",
      reasoning: "Aus _preAnalysis Wetter-Aggregat.",
      limitations: ["Wenige Vergleichstage."],
      patient_relevance: "low",
      doctor_relevance: "medium",
      recommended_tracking_next: ["Weiter dokumentieren"],
      doctor_discussion_points: [],
    },
  ],
};

Deno.test("builder: returns V2.2 envelope with schema_version 2.1", async () => {
  const llmFetch: typeof fetch = () => Promise.resolve(fakeLLMResponse(VALID_ARGS));
  const res = await runPatternAnalysisV22({
    serializedContext: "a".repeat(500),
    meta: META,
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    apiKey: "test",
    source: "app",
    includePrivateNotes: true,
    llmFetch,
  });
  assert(res.ok);
  if (!res.ok) return;
  const body = res.body as Record<string, any>;
  assertEquals(body.schema_version, SCHEMA_VERSION);
  assertEquals(body.analysis_version, ANALYSIS_VERSION);
  assertEquals(body.meta.analysisVersion, ANALYSIS_VERSION);
  assertEquals(body.scope.fromDate, "2026-04-01");
  assertEquals(body.scope.totalDays, 30);
  assert(Array.isArray(body.llm_expanded_findings));
  assertEquals(body.llm_expanded_findings.length, 1);
  assertEquals(body.llm_expanded_findings[0].category, "weather");
});

Deno.test("builder: doctor_share path produces same envelope shape", async () => {
  const llmFetch: typeof fetch = () => Promise.resolve(fakeLLMResponse(VALID_ARGS));
  const res = await runPatternAnalysisV22({
    serializedContext: "x".repeat(500),
    meta: META,
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    apiKey: "test",
    source: "doctor_share",
    includePrivateNotes: false,
    llmFetch,
  });
  assert(res.ok);
  if (!res.ok) return;
  const body = res.body as Record<string, any>;
  assertEquals(body.schema_version, SCHEMA_VERSION);
  assertEquals(body.analysis_version, ANALYSIS_VERSION);
  assert(typeof body.summary === "string");
});

Deno.test("builder: INSUFFICIENT_DATA when no events", async () => {
  const res = await runPatternAnalysisV22({
    serializedContext: "a".repeat(50),
    meta: { ...META, voiceEventCount: 0, painEntryCount: 0 },
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    apiKey: "test",
    source: "app",
    includePrivateNotes: true,
    llmFetch: () => Promise.reject(new Error("should not be called")),
  });
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.status, 422);
  assertEquals((res.body as any).code, "INSUFFICIENT_DATA");
});

Deno.test("builder: CONTEXT_TOO_LARGE gate", async () => {
  const res = await runPatternAnalysisV22({
    serializedContext: "a".repeat(MAX_CONTEXT_CHARS + 1),
    meta: META,
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    apiKey: "test",
    source: "app",
    includePrivateNotes: true,
    llmFetch: () => Promise.reject(new Error("should not be called")),
  });
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.status, 413);
  assertEquals((res.body as any).code, "CONTEXT_TOO_LARGE");
});

Deno.test("extractAnalysisFromLLMResponse: handles tool_calls path", () => {
  const out = extractAnalysisFromLLMResponse({
    choices: [{
      message: { tool_calls: [{ function: { arguments: JSON.stringify(VALID_ARGS) } }] },
    }],
  });
  assert(out && typeof out.summary === "string");
});

Deno.test("validateExtractedResult: rejects missing arrays", () => {
  assertEquals(validateExtractedResult({ summary: "hello world" } as any), false);
  assertEquals(
    validateExtractedResult({
      summary: "hello world",
      possiblePatterns: [], painContextFindings: [], fatigueContextFindings: [],
      medicationContextFindings: [], openQuestions: [], confidenceNotes: [],
    } as any),
    true,
  );
});

Deno.test("builder: LLM HTTP 429 maps to LLM_UNAVAILABLE", async () => {
  const llmFetch: typeof fetch = () => Promise.resolve(new Response("rate limited", { status: 429 }));
  const res = await runPatternAnalysisV22({
    serializedContext: "a".repeat(500),
    meta: META,
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    apiKey: "test",
    source: "app",
    includePrivateNotes: true,
    llmFetch,
  });
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.status, 429);
  assertEquals((res.body as any).code, "LLM_UNAVAILABLE");
});
