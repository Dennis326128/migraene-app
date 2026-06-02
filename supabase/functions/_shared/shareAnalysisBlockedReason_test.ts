/**
 * Smoke test: every ShareAnalysisGateReason returned by
 * evaluateShareAnalysisGate has a corresponding aiAnalysis.blockedReason
 * string consumed by the Doctor-Share website. Prevents drift between
 * gate reasons and UI mapping in get-shared-report-data.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateShareAnalysisGate } from "./shareAnalysisGate.ts";

const VALID_UI_REASONS = new Set([
  "share_inactive",
  "share_expired",
  "ai_analysis_not_included",
  "ai_generation_not_allowed",
  "cooldown_active",
  "ai_disabled_owner",
  "ai_consent_missing",
  "quota_exceeded",
]);

Deno.test("gate reason: share_inactive -> mappable", () => {
  const r = evaluateShareAnalysisGate({
    share: { active: false },
    settings: { include_ai_analysis: true, allow_ai_generate: true },
  });
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "share_inactive");
  assert(VALID_UI_REASONS.has(r.reason));
});

Deno.test("gate reason: ai_generation_not_allowed -> mappable", () => {
  const r = evaluateShareAnalysisGate({
    share: { active: true },
    settings: { include_ai_analysis: true, allow_ai_generate: false },
  });
  assertEquals(r.reason, "ai_generation_not_allowed");
  assert(VALID_UI_REASONS.has(r.reason));
});

Deno.test("gate reason: cooldown_active -> mappable with waitMinutes", () => {
  const r = evaluateShareAnalysisGate({
    share: { active: true },
    settings: { include_ai_analysis: true, allow_ai_generate: true },
    lastAnalysisAtISO: new Date(Date.now() - 60_000).toISOString(),
    nowMs: Date.now(),
  });
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "cooldown_active");
  assert(typeof r.waitMinutes === "number" && r.waitMinutes! > 0);
  assert(VALID_UI_REASONS.has(r.reason));
});

Deno.test("gate reason: allowed -> no UI block", () => {
  const r = evaluateShareAnalysisGate({
    share: { active: true },
    settings: { include_ai_analysis: true, allow_ai_generate: true },
    lastAnalysisAtISO: null,
  });
  assertEquals(r.allowed, true);
  assertEquals(r.reason, "allowed");
});
