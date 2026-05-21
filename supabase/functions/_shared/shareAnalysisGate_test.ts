import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateShareAnalysisGate } from "./shareAnalysisGate.ts";

const baseShare = { active: true, expiresAtISO: null };
const baseSettings = { include_ai_analysis: true, allow_ai_generate: true };

Deno.test("share_inactive when share missing/inactive", () => {
  assertEquals(
    evaluateShareAnalysisGate({ share: null, settings: baseSettings }).reason,
    "share_inactive",
  );
  assertEquals(
    evaluateShareAnalysisGate({ share: { active: false }, settings: baseSettings }).reason,
    "share_inactive",
  );
});

Deno.test("share_expired when expiresAt in past", () => {
  const gate = evaluateShareAnalysisGate({
    share: { active: true, expiresAtISO: new Date(Date.now() - 60_000).toISOString() },
    settings: baseSettings,
  });
  assertEquals(gate.reason, "share_expired");
});

Deno.test("ai_analysis_not_included when include_ai_analysis false", () => {
  const gate = evaluateShareAnalysisGate({
    share: baseShare,
    settings: { include_ai_analysis: false, allow_ai_generate: true },
  });
  assertEquals(gate.reason, "ai_analysis_not_included");
});

Deno.test("ai_generation_not_allowed when allow_ai_generate missing/false", () => {
  assertEquals(
    evaluateShareAnalysisGate({
      share: baseShare,
      settings: { include_ai_analysis: true },
    }).reason,
    "ai_generation_not_allowed",
  );
  assertEquals(
    evaluateShareAnalysisGate({
      share: baseShare,
      settings: { include_ai_analysis: true, allow_ai_generate: false },
    }).reason,
    "ai_generation_not_allowed",
  );
});

Deno.test("cooldown_active when last analysis < 15 min ago", () => {
  const now = Date.now();
  const gate = evaluateShareAnalysisGate({
    share: baseShare,
    settings: baseSettings,
    lastAnalysisAtISO: new Date(now - 5 * 60_000).toISOString(),
    nowMs: now,
  });
  assertEquals(gate.reason, "cooldown_active");
  assertEquals(gate.allowed, false);
  assertEquals(typeof gate.waitMinutes, "number");
});

Deno.test("allowed when cooldown elapsed", () => {
  const now = Date.now();
  const gate = evaluateShareAnalysisGate({
    share: baseShare,
    settings: baseSettings,
    lastAnalysisAtISO: new Date(now - 20 * 60_000).toISOString(),
    nowMs: now,
  });
  assertEquals(gate.reason, "allowed");
  assertEquals(gate.allowed, true);
});

Deno.test("allowed when no prior analysis", () => {
  const gate = evaluateShareAnalysisGate({
    share: baseShare,
    settings: baseSettings,
    lastAnalysisAtISO: null,
  });
  assertEquals(gate.reason, "allowed");
});
