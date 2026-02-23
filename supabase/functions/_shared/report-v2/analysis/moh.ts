/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOH (Medication Overuse Headache) Risk Analysis V2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deterministic, threshold-based. Normalizes to 30-day window.
 * Orientation only — not a diagnosis.
 *
 * Pure function. No DB, no I/O, no side effects.
 */

import type { CoreMetricsV2, MOHAnalysisV2, MOHRiskLevel, ConfidenceLevel } from "./types.ts";
import { TRIPTAN_DAYS_THRESHOLD, ACUTE_MED_DAYS_THRESHOLD } from "./definitions.ts";

export function computeMOH(core: CoreMetricsV2): MOHAnalysisV2 {
  const { daysInRange, acuteMedDays, triptanDays, documentedDays } = core;

  // Normalization factor: project to 30-day window
  // Guard: if daysInRange is 0, use factor 1 but mark confidence low
  const factor = daysInRange > 0 ? 30 / daysInRange : 1;

  const acuteMedDaysPer30 = Math.round(acuteMedDays * factor * 10) / 10;
  const triptanDaysPer30 = Math.round(triptanDays * factor * 10) / 10;

  // Risk level
  let riskLevel: MOHRiskLevel = "none";
  if (
    triptanDaysPer30 >= TRIPTAN_DAYS_THRESHOLD ||
    acuteMedDaysPer30 >= ACUTE_MED_DAYS_THRESHOLD
  ) {
    riskLevel = "likely";
  } else if (
    triptanDaysPer30 >= TRIPTAN_DAYS_THRESHOLD * 0.8 ||
    acuteMedDaysPer30 >= ACUTE_MED_DAYS_THRESHOLD * 0.8
  ) {
    riskLevel = "possible";
  }

  // Confidence
  let confidence: ConfidenceLevel = "high";
  if (daysInRange === 0) {
    confidence = "low";
  } else if (daysInRange < 28 || documentedDays / daysInRange < 0.5) {
    confidence = "medium";
  }

  // Rationale (clinical, non-alarmist)
  let rationale: string;
  if (riskLevel === "likely") {
    rationale =
      "Orientierender Hinweis: Die Einnahmefrequenz von Akutmedikation liegt über dem klinischen Schwellenwert für einen medikamenteninduzierten Kopfschmerz (MÜK). Eine ärztliche Bewertung wird empfohlen. Keine Diagnose.";
  } else if (riskLevel === "possible") {
    rationale =
      "Orientierender Hinweis: Die Einnahmefrequenz nähert sich dem Schwellenwert für einen medikamenteninduzierten Kopfschmerz (MÜK). Beobachtung empfohlen.";
  } else {
    rationale =
      "Kein Hinweis auf erhöhtes MÜK-Risiko im dokumentierten Zeitraum.";
  }

  return {
    riskLevel,
    triggers: {
      acuteMedDaysPer30,
      triptanDaysPer30,
      thresholds: {
        acuteMedDaysPerMonth: ACUTE_MED_DAYS_THRESHOLD,
        triptanDaysPerMonth: TRIPTAN_DAYS_THRESHOLD,
      },
    },
    rationale,
    confidence,
  };
}
