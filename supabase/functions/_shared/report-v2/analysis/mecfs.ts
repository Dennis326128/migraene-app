/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ME/CFS Summary V2 — with Guardrails
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Per-day MAX severity (none < mild < moderate < severe).
 * Undocumented days are a separate segment.
 * NEVER extrapolates when documented days < threshold.
 *
 * Pure function. No DB, no I/O, no side effects.
 */

import type {
  MeCfsSummaryV2,
  MeCfsSegment,
  MeCfsGuardrail,
} from "./types.ts";
import { ME_CFS_MIN_DAYS_FOR_INFERENCE } from "./definitions.ts";

// ─── Input ───────────────────────────────────────────────────────────────

export interface MeCfsInput {
  daysInRange: number;
  /**
   * Per-day ME/CFS max severity. Only days that have ME/CFS documentation.
   * key = severity level already computed (none/mild/moderate/severe).
   * null entries = day exists but ME/CFS not documented.
   */
  dayMeCfsLevels: ReadonlyArray<{
    documented: boolean;
    meCfsMax: "none" | "mild" | "moderate" | "severe" | null;
  }>;
}

// ─── Compute ─────────────────────────────────────────────────────────────

export function computeMecfsSummary(input: MeCfsInput): MeCfsSummaryV2 {
  const { daysInRange, dayMeCfsLevels } = input;

  const counts: Record<MeCfsSegment["key"], number> = {
    none: 0,
    mild: 0,
    moderate: 0,
    severe: 0,
    undocumented: 0,
  };

  let documentedDaysMecfs = 0;

  for (const day of dayMeCfsLevels) {
    if (day.meCfsMax != null) {
      counts[day.meCfsMax]++;
      documentedDaysMecfs++;
    } else {
      counts.undocumented++;
    }
  }

  // Account for days not in dayMeCfsLevels at all
  const daysAccountedFor = dayMeCfsLevels.length;
  if (daysAccountedFor < daysInRange) {
    counts.undocumented += daysInRange - daysAccountedFor;
  }

  const segments: MeCfsSegment[] = [
    { key: "none", days: counts.none },
    { key: "mild", days: counts.mild },
    { key: "moderate", days: counts.moderate },
    { key: "severe", days: counts.severe },
    { key: "undocumented", days: counts.undocumented },
  ];

  // Guardrail
  let guardrail: MeCfsGuardrail;
  if (documentedDaysMecfs === 0) {
    guardrail = { ok: false, reason: "NO_DATA" };
  } else if (documentedDaysMecfs < ME_CFS_MIN_DAYS_FOR_INFERENCE) {
    guardrail = { ok: false, reason: "TOO_FEW_DAYS" };
  } else {
    guardrail = { ok: true };
  }

  return {
    segments,
    documentedDaysMecfs,
    totalDaysInRange: daysInRange,
    guardrail,
    noExtrapolation: true,
  };
}
