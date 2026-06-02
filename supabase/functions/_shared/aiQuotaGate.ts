/**
 * AI Quota & Cooldown Gate for `pattern_analysis`.
 *
 * Source of Truth: `user_ai_usage` (feature='pattern_analysis', monthly period_start).
 * Service-role required (table has no client INSERT/UPDATE policies).
 *
 * Rules:
 *   - Free limit: 3 successful analyses per calendar month (Europe/Berlin tz-agnostic, calendar month UTC ok).
 *   - 5-minute cooldown between analyses (server SoT).
 *   - `user_profiles.ai_unlimited=true` bypasses BOTH quota and cooldown.
 *   - Quota is incremented ONLY after a successful + validated analysis (call commitQuotaUsage).
 */

type AdminClient = {
  from: (table: string) => any;
};

export const FREE_PATTERN_ANALYSIS_MONTHLY = 5;
export const COOLDOWN_SECONDS = 5 * 60;

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  cooldownRemaining: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  /** Reason for block; undefined if allowed. */
  blockedReason?: 'QUOTA_EXCEEDED' | 'COOLDOWN_ACTIVE' | 'AI_DISABLED';
  status?: number;
  message?: string;
  quota: QuotaInfo;
  /** Snapshot for commit (period start used for upsert). */
  snapshot: {
    periodStart: string;
    currentUsage: number;
    isUnlimited: boolean;
  };
}

function currentPeriodStart(): string {
  // Calendar month, UTC normalized — matches user_ai_usage.period_start default
  return new Date().toISOString().slice(0, 7) + '-01';
}

export async function checkPatternAnalysisQuota(
  admin: AdminClient,
  userId: string,
  opts: { enforceCooldown?: boolean } = { enforceCooldown: true },
): Promise<QuotaCheckResult> {
  // Fetch profile
  const { data: profile } = await admin
    .from('user_profiles')
    .select('ai_enabled, ai_unlimited')
    .eq('user_id', userId)
    .maybeSingle();

  const isUnlimited = profile?.ai_unlimited === true;
  const aiEnabled = profile?.ai_enabled !== false; // default true if missing

  const periodStart = currentPeriodStart();

  const { data: usageRow } = await admin
    .from('user_ai_usage')
    .select('request_count, last_used_at')
    .eq('user_id', userId)
    .eq('feature', 'pattern_analysis')
    .gte('period_start', periodStart)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentUsage = usageRow?.request_count ?? 0;
  const lastUsedAt = usageRow?.last_used_at ? new Date(usageRow.last_used_at) : null;

  let cooldownRemaining = 0;
  if (lastUsedAt && !isUnlimited && opts.enforceCooldown) {
    const seconds = (Date.now() - lastUsedAt.getTime()) / 1000;
    cooldownRemaining = Math.max(0, Math.ceil(COOLDOWN_SECONDS - seconds));
  }

  const quota: QuotaInfo = {
    used: currentUsage,
    limit: FREE_PATTERN_ANALYSIS_MONTHLY,
    remaining: isUnlimited ? 999 : Math.max(0, FREE_PATTERN_ANALYSIS_MONTHLY - currentUsage),
    isUnlimited,
    cooldownRemaining,
  };

  const snapshot = { periodStart, currentUsage, isUnlimited };

  if (!aiEnabled) {
    return {
      allowed: false,
      blockedReason: 'AI_DISABLED',
      status: 403,
      message: 'KI-Analyse ist in den Einstellungen deaktiviert.',
      quota,
      snapshot,
    };
  }

  if (!isUnlimited && opts.enforceCooldown && cooldownRemaining > 0) {
    return {
      allowed: false,
      blockedReason: 'COOLDOWN_ACTIVE',
      status: 429,
      message: 'Bitte kurz warten, bevor du erneut analysierst.',
      quota,
      snapshot,
    };
  }

  if (!isUnlimited && currentUsage >= FREE_PATTERN_ANALYSIS_MONTHLY) {
    return {
      allowed: false,
      blockedReason: 'QUOTA_EXCEEDED',
      status: 409,
      message: 'Monatliches Analyselimit erreicht. Nächsten Monat stehen dir wieder Analysen zur Verfügung.',
      quota,
      snapshot,
    };
  }

  return { allowed: true, quota, snapshot };
}

/**
 * Increment usage counter. Call ONLY after a successful + validated analysis.
 * Skips if isUnlimited.
 */
export async function commitPatternAnalysisUsage(
  admin: AdminClient,
  userId: string,
  snapshot: QuotaCheckResult['snapshot'],
): Promise<void> {
  if (snapshot.isUnlimited) return;
  const now = new Date().toISOString();
  const { error } = await admin
    .from('user_ai_usage')
    .upsert(
      {
        user_id: userId,
        feature: 'pattern_analysis',
        period_start: snapshot.periodStart,
        request_count: snapshot.currentUsage + 1,
        last_used_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id,feature,period_start', ignoreDuplicates: false },
    );
  if (error) {
    console.error('[aiQuotaGate] commit failed:', error);
  }
}

export function quotaErrorBody(check: QuotaCheckResult): Record<string, unknown> {
  return {
    error: check.message,
    code: check.blockedReason,
    errorCode: check.blockedReason, // Backwards-compat
    quota: check.quota,
    cooldownRemaining: check.quota.cooldownRemaining,
  };
}
