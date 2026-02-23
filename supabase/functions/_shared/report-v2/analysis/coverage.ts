/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Coverage Analysis V2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Computes data coverage ratios per module and emits warnings.
 * Every analysis must carry its coverage basis.
 *
 * Pure function. No DB, no I/O, no side effects.
 */

import type {
  AnalysisCoverage,
  CoverageModule,
  CoverageWarning,
} from "./types.ts";
import {
  LOW_DIARY_COVERAGE_THRESHOLD,
  LOW_WEATHER_COVERAGE_THRESHOLD,
} from "./definitions.ts";

// ─── Input ───────────────────────────────────────────────────────────────

export interface CoverageInput {
  daysInRange: number;
  documentedDays: number;
  /** Number of days with weather data available. null = module not available. */
  weatherDaysAvailable?: number | null;
  /** Number of days with ME/CFS documentation. null = module not available. */
  mecfsDaysDocumented?: number | null;
  /** Prophylaxis injection events count. null = module not available. */
  prophylaxisInjectionEvents?: number | null;
  prophylaxisCyclesInRange?: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildModule(available: number, total: number): CoverageModule {
  return {
    available,
    total,
    ratio: total > 0 ? Math.round((available / total) * 1000) / 1000 : 0,
  };
}

// ─── Compute ─────────────────────────────────────────────────────────────

export function computeCoverage(input: CoverageInput): AnalysisCoverage {
  const { daysInRange, documentedDays } = input;

  const diary = buildModule(documentedDays, daysInRange);
  const warnings: CoverageWarning[] = [];

  // Diary coverage warning
  if (diary.ratio < LOW_DIARY_COVERAGE_THRESHOLD && daysInRange > 0) {
    warnings.push({
      module: "diary",
      message: `Nur ${documentedDays} von ${daysInRange} Tagen dokumentiert (${Math.round(diary.ratio * 100)}%). Aussagekraft eingeschränkt.`,
      ratio: diary.ratio,
    });
  }

  // Weather
  let weather: CoverageModule | null = null;
  if (input.weatherDaysAvailable != null) {
    weather = buildModule(input.weatherDaysAvailable, daysInRange);
    if (weather.ratio < LOW_WEATHER_COVERAGE_THRESHOLD && daysInRange > 0) {
      warnings.push({
        module: "weather",
        message: `Wetterdaten nur für ${input.weatherDaysAvailable} von ${daysInRange} Tagen verfügbar. Wetteranalyse eingeschränkt.`,
        ratio: weather.ratio,
      });
    }
  }

  // ME/CFS
  let mecfs: CoverageModule | null = null;
  if (input.mecfsDaysDocumented != null) {
    mecfs = buildModule(input.mecfsDaysDocumented, daysInRange);
  }

  // Prophylaxis (Phase 3 placeholder)
  let prophylaxis: AnalysisCoverage["prophylaxis"] = null;
  if (
    input.prophylaxisInjectionEvents != null ||
    input.prophylaxisCyclesInRange != null
  ) {
    prophylaxis = {
      injectionEventsCount: input.prophylaxisInjectionEvents ?? 0,
      cyclesInRange: input.prophylaxisCyclesInRange ?? 0,
      preWindowCoverage: null,
      postWindowCoverage: null,
    };
  }

  return { diary, weather, mecfs, prophylaxis, warnings };
}
