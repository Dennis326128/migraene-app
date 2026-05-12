/**
 * analysisGate.ts
 *
 * Pure decision function for the AI pattern-analysis UI.
 * Determines what action / message the UI should present, based on
 * client-known state. Mirrors (but does not replace) the server-side
 * gate in `analyze-voice-patterns/index.ts`.
 *
 * SoT for limits: server. Client decisions are advisory and prevent
 * unnecessary edge calls only.
 */

export interface AnalysisGateInput {
  hasConsent: boolean;
  aiEnabled: boolean;
  isUnlimited: boolean;
  usageCount: number;
  limit: number;
  /** Seconds remaining in cooldown (0 if free). */
  cooldownRemaining: number;
  hasCache: boolean;
  isStale: boolean;
}

export type GateAction =
  | 'block_consent'
  | 'block_ai_disabled'
  | 'block_quota'
  | 'block_cooldown'
  | 'allow_new'
  | 'allow_refresh'
  | 'no_action_needed';

export interface AnalysisGateDecision {
  action: GateAction;
  reason: string;
  /** True if any analyse-button click is allowed at all. */
  canRunAnalysis: boolean;
}

export const FREE_PATTERN_ANALYSIS_LIMIT = 3;
export const COOLDOWN_SECONDS = 5 * 60;
export const STALE_AFTER_DAYS = 14;

export function gateDecision(input: AnalysisGateInput): AnalysisGateDecision {
  if (!input.hasConsent) {
    return {
      action: 'block_consent',
      reason: 'AI_CONSENT_REQUIRED',
      canRunAnalysis: false,
    };
  }
  if (!input.aiEnabled) {
    return {
      action: 'block_ai_disabled',
      reason: 'AI_DISABLED',
      canRunAnalysis: false,
    };
  }

  // Quota check (skipped for unlimited)
  if (!input.isUnlimited && input.usageCount >= input.limit) {
    return {
      action: 'block_quota',
      reason: 'QUOTA_EXCEEDED',
      canRunAnalysis: false,
    };
  }

  // Cooldown check (skipped for unlimited)
  if (!input.isUnlimited && input.cooldownRemaining > 0) {
    return {
      action: 'block_cooldown',
      reason: 'COOLDOWN_ACTIVE',
      canRunAnalysis: false,
    };
  }

  if (input.hasCache && input.isStale) {
    return { action: 'allow_refresh', reason: 'STALE_CACHE', canRunAnalysis: true };
  }
  if (input.hasCache && !input.isStale) {
    return { action: 'no_action_needed', reason: 'FRESH_CACHE', canRunAnalysis: true };
  }
  return { action: 'allow_new', reason: 'NO_CACHE', canRunAnalysis: true };
}

/**
 * Determine if a cached analysis is stale based on age.
 * Pure function for testability.
 */
export function isCacheStaleByAge(analyzedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!analyzedAt) return true;
  const t = Date.parse(analyzedAt);
  if (Number.isNaN(t)) return true;
  const ageDays = (now.getTime() - t) / (1000 * 60 * 60 * 24);
  return ageDays > STALE_AFTER_DAYS;
}

/**
 * Convert ISO date string (YYYY-MM-DD) to a Date representing
 * Europe/Berlin midnight (start) or 23:59:59.999 (end).
 *
 * Avoids `new Date(s + 'T00:00:00')` which is interpreted in the
 * client's local zone — incorrect for users outside DE.
 */
export function berlinDayStart(isoDate: string): Date {
  return berlinBoundary(isoDate, 0, 0, 0, 0);
}

export function berlinDayEnd(isoDate: string): Date {
  return berlinBoundary(isoDate, 23, 59, 59, 999);
}

function berlinBoundary(isoDate: string, h: number, m: number, s: number, ms: number): Date {
  // Compute Berlin offset for that date (handles DST). We probe by asking
  // Intl what the wall-clock time would be for a given UTC instant.
  const [y, mo, d] = isoDate.split('-').map(Number);
  if (!y || !mo || !d) return new Date(NaN);

  // Start with UTC midnight, then shift by Berlin offset for that instant.
  const utcGuess = Date.UTC(y, mo - 1, d, h, m, s, ms);
  const offsetMin = berlinOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - offsetMin * 60_000);
}

function berlinOffsetMinutes(at: Date): number {
  // Returns offset in minutes (positive east of UTC). E.g. Berlin CET=+60, CEST=+120.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(at);
  const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 60;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = parseInt(m[2], 10);
  const mins = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (hours * 60 + mins);
}
