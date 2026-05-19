/**
 * analysisRateGate
 *
 * Pure decision function controlling whether a new pattern analysis may
 * be triggered, based on the *previous* report's age, the current data
 * fingerprint, and the deployed analysis-engine version.
 *
 * This sits one layer above `analysisGate.ts` (which handles consent,
 * AI-enabled, quota, cooldown). The latter is the server-side safety
 * gate; this one is the UX-side "don't spam re-analyze" gate, also
 * used by the Doctor-Share website later.
 */

export const REANALYZE_COOLDOWN_MINUTES = 15;

export type ReAnalyzeReason =
  | "no_existing_report"
  | "cooldown_passed"
  | "data_changed"
  | "version_changed"
  | "manual_override_allowed"
  | "cooldown_active";

export interface ReAnalyzeGateInput {
  lastCreatedAt?: string | null;
  lastDataSignature?: string | null;
  currentDataSignature?: string | null;
  lastAnalysisVersion?: string | null;
  currentAnalysisVersion: string;
  /** Optional override for testing. */
  cooldownMinutes?: number;
  now?: Date;
  /**
   * If true, allow re-analyze regardless of cooldown (e.g. user explicitly
   * dismissed a "wait" hint and tapped again, or admin tooling).
   */
  manualOverride?: boolean;
}

export interface ReAnalyzeGateResult {
  allowed: boolean;
  reason: ReAnalyzeReason;
  waitMinutes?: number;
  lastCreatedAt?: string;
}

export function evaluateReAnalyzeGate(input: ReAnalyzeGateInput): ReAnalyzeGateResult {
  const cooldown = input.cooldownMinutes ?? REANALYZE_COOLDOWN_MINUTES;
  const now = input.now ?? new Date();

  if (!input.lastCreatedAt) {
    return { allowed: true, reason: "no_existing_report" };
  }

  const last = Date.parse(input.lastCreatedAt);
  if (Number.isNaN(last)) {
    return { allowed: true, reason: "no_existing_report" };
  }

  if (input.manualOverride) {
    return { allowed: true, reason: "manual_override_allowed", lastCreatedAt: input.lastCreatedAt };
  }

  if (
    input.lastAnalysisVersion &&
    input.lastAnalysisVersion !== input.currentAnalysisVersion
  ) {
    return { allowed: true, reason: "version_changed", lastCreatedAt: input.lastCreatedAt };
  }

  if (
    input.lastDataSignature &&
    input.currentDataSignature &&
    input.lastDataSignature !== input.currentDataSignature
  ) {
    return { allowed: true, reason: "data_changed", lastCreatedAt: input.lastCreatedAt };
  }

  const elapsedMin = (now.getTime() - last) / 60_000;
  if (elapsedMin >= cooldown) {
    return { allowed: true, reason: "cooldown_passed", lastCreatedAt: input.lastCreatedAt };
  }

  return {
    allowed: false,
    reason: "cooldown_active",
    waitMinutes: Math.max(1, Math.ceil(cooldown - elapsedMin)),
    lastCreatedAt: input.lastCreatedAt,
  };
}
