/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Analysis V2 — Smoke Tests (Deno)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deterministic tests for Phase 1 foundation.
 * Run with: deno test --allow-none supabase/functions/_shared/report-v2/analysis/analysis_test.ts
 */

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { computeCoreMetrics } from "./coreMetrics.ts";
import { computeMOH } from "./moh.ts";
import { computeCoverage } from "./coverage.ts";
import { computeMecfsSummary } from "./mecfs.ts";
import { buildAnalysisV2 } from "./buildAnalysisV2.ts";
import {
  TRIPTAN_DAYS_THRESHOLD,
  ACUTE_MED_DAYS_THRESHOLD,
  ME_CFS_MIN_DAYS_FOR_INFERENCE,
} from "./definitions.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Smoke Case 1: Typical 90-day range
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("coreMetrics: 90-day range with 60 documented days", () => {
  const days = [];
  for (let i = 0; i < 60; i++) {
    days.push({
      documented: true,
      headache: i < 40,
      painMax: i < 40 ? 5 + (i % 5) : 0,
      acuteMedUsed: i < 15,
      triptanUsed: i < 12,
    });
  }
  // 30 undocumented days not in array — daysInRange covers them

  const result = computeCoreMetrics({ daysInRange: 90, countsByDay: days });

  assertEquals(result.daysInRange, 90);
  assertEquals(result.documentedDays, 60);
  assertEquals(result.undocumentedDays, 30);
  assertEquals(result.headacheDays, 40);
  assertEquals(result.acuteMedDays, 15);
  assertEquals(result.triptanDays, 12);
  assertEquals(result.migraineDays, null);
  assertExists(result.avgPainOnHeadacheDays);
  assertExists(result.medianPainOnHeadacheDays);
  assertExists(result.maxPain);
});

Deno.test("MOH: likely when triptanDays=12 in 90 days", () => {
  const core = computeCoreMetrics({
    daysInRange: 90,
    countsByDay: Array.from({ length: 60 }, (_, i) => ({
      documented: true,
      headache: i < 40,
      painMax: i < 40 ? 5 : 0,
      acuteMedUsed: i < 15,
      triptanUsed: i < 12,
    })),
  });

  const moh = computeMOH(core);

  // 12 triptan days / 90 days * 30 = 4.0 per 30 -> below threshold
  // 15 acute med days / 90 * 30 = 5.0 per 30 -> below threshold
  assertEquals(moh.riskLevel, "none");
  assertEquals(moh.confidence, "high");
});

Deno.test("MOH: likely when acuteMedDays=35 in 90 days", () => {
  const core = computeCoreMetrics({
    daysInRange: 90,
    countsByDay: Array.from({ length: 60 }, (_, i) => ({
      documented: true,
      headache: i < 40,
      painMax: i < 40 ? 5 : 0,
      acuteMedUsed: i < 35,
      triptanUsed: i < 30,
    })),
  });

  const moh = computeMOH(core);

  // 35/90*30 = 11.7 acuteMedDaysPer30 >= 10 -> likely
  assertEquals(moh.riskLevel, "likely");
});

// ═══════════════════════════════════════════════════════════════════════════
// Smoke Case 2: Zero-day range (no division errors)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("coreMetrics: daysInRange=0 => no division errors", () => {
  const result = computeCoreMetrics({ daysInRange: 0, countsByDay: [] });

  assertEquals(result.daysInRange, 0);
  assertEquals(result.documentedDays, 0);
  assertEquals(result.headacheDays, 0);
  assertEquals(result.avgPainOnHeadacheDays, null);
  assertEquals(result.migraineDays, null);
});

Deno.test("MOH: daysInRange=0 => confidence low, no crash", () => {
  const core = computeCoreMetrics({ daysInRange: 0, countsByDay: [] });
  const moh = computeMOH(core);

  assertEquals(moh.riskLevel, "none");
  assertEquals(moh.confidence, "low");
});

Deno.test("coverage: daysInRange=0 => ratio 0, no crash", () => {
  const cov = computeCoverage({ daysInRange: 0, documentedDays: 0 });

  assertEquals(cov.diary.ratio, 0);
  assertEquals(cov.warnings.length, 0); // no warning when daysInRange=0
});

// ═══════════════════════════════════════════════════════════════════════════
// Smoke Case 3: ME/CFS guardrail
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("mecfs: documentedDays=5 => TOO_FEW_DAYS guardrail", () => {
  const days = Array.from({ length: 5 }, () => ({
    documented: true,
    meCfsMax: "moderate" as const,
  }));

  const result = computeMecfsSummary({ daysInRange: 90, dayMeCfsLevels: days });

  assertEquals(result.guardrail.ok, false);
  assertEquals(result.guardrail.reason, "TOO_FEW_DAYS");
  assertEquals(result.documentedDaysMecfs, 5);
  assertEquals(result.noExtrapolation, true);
  // Undocumented should be 90 - 5 = 85
  const undoc = result.segments.find((s) => s.key === "undocumented");
  assertEquals(undoc?.days, 85);
});

Deno.test("mecfs: no data => NO_DATA guardrail", () => {
  const result = computeMecfsSummary({ daysInRange: 30, dayMeCfsLevels: [] });

  assertEquals(result.guardrail.ok, false);
  assertEquals(result.guardrail.reason, "NO_DATA");
});

Deno.test("mecfs: 25 documented days => guardrail OK", () => {
  const days = Array.from({ length: 25 }, (_, i) => ({
    documented: true,
    meCfsMax: (i < 5 ? "severe" : i < 15 ? "mild" : "none") as "severe" | "mild" | "none",
  }));

  const result = computeMecfsSummary({ daysInRange: 30, dayMeCfsLevels: days });

  assertEquals(result.guardrail.ok, true);
  assertEquals(result.documentedDaysMecfs, 25);
});

// ═══════════════════════════════════════════════════════════════════════════
// Smoke Case 4: buildAnalysisV2 orchestrator (missing modules)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("buildAnalysisV2: minimal input produces valid object", () => {
  const analysis = buildAnalysisV2({
    range: {
      startISO: "2026-01-01",
      endISO: "2026-03-31",
      timezone: "Europe/Berlin",
      totalDaysInRange: 90,
    },
    countsByDay: Array.from({ length: 30 }, (_, i) => ({
      documented: true,
      headache: i < 15,
      painMax: i < 15 ? 6 : 0,
      acuteMedUsed: i < 8,
      triptanUsed: i < 5,
    })),
    // No optional modules
  });

  assertEquals(analysis.version, "2.0.0");
  assertExists(analysis.definitions);
  assertExists(analysis.coreMetrics);
  assertExists(analysis.moh);
  assertExists(analysis.coverage);
  assertEquals(analysis.mecfs, null);
  assertEquals(analysis.weather, null);
  assertEquals(analysis.prophylaxis, null);
  assertExists(analysis.insightsForLLM);
  assert(analysis.insightsForLLM.findings.length >= 2); // at least coverage + core
  assert(analysis.insightsForLLM.doNotDo.length >= 3);
  assertEquals(analysis.coreMetrics.migraineDays, null);

  // Basis
  assertEquals(analysis.basis.range.totalDaysInRange, 90);
  assertEquals(analysis.basis.documentedDays, 30);
  assertEquals(analysis.basis.weatherDays, null);
  assertEquals(analysis.basis.mecfsDaysDocumented, null);
});

Deno.test("buildAnalysisV2: with mecfs data and guardrail", () => {
  const analysis = buildAnalysisV2({
    range: {
      startISO: "2026-01-01",
      endISO: "2026-01-30",
      timezone: "Europe/Berlin",
      totalDaysInRange: 30,
    },
    countsByDay: Array.from({ length: 20 }, () => ({
      documented: true,
      headache: true,
      painMax: 7,
      acuteMedUsed: true,
      triptanUsed: true,
    })),
    mecfsData: Array.from({ length: 10 }, () => ({
      documented: true,
      meCfsMax: "moderate" as const,
    })),
  });

  assertExists(analysis.mecfs);
  assertEquals(analysis.mecfs!.guardrail.ok, false);
  assertEquals(analysis.mecfs!.guardrail.reason, "TOO_FEW_DAYS");

  // MOH should be likely: 20 triptan days in 30 = 20 per 30
  assertEquals(analysis.moh.riskLevel, "likely");

  // Should have MOH finding
  const mohFinding = analysis.insightsForLLM.findings.find(
    (f) => f.id === "moh_risk"
  );
  assertExists(mohFinding);

  // Should have mecfs guardrail finding
  const mecfsFinding = analysis.insightsForLLM.findings.find(
    (f) => f.id === "mecfs_guardrail"
  );
  assertExists(mecfsFinding);
});
