/**
 * useAnalysisGateState — loads consent + AI flags + quota usage to drive UI.
 *
 * Pure read-only client probe. Mirrors server checks but is advisory:
 * the edge function is the source of truth and rejects out-of-policy
 * calls itself.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  COOLDOWN_SECONDS,
  FREE_PATTERN_ANALYSIS_LIMIT,
} from '@/lib/voice/analysisGate';

export interface AnalysisGateState {
  loading: boolean;
  hasConsent: boolean;
  aiEnabled: boolean;
  isUnlimited: boolean;
  usageCount: number;
  limit: number;
  cooldownRemaining: number;
  lastUsedAt: string | null;
  error: string | null;
}

const INITIAL: AnalysisGateState = {
  loading: true,
  hasConsent: false,
  aiEnabled: true,
  isUnlimited: false,
  usageCount: 0,
  limit: FREE_PATTERN_ANALYSIS_LIMIT,
  cooldownRemaining: 0,
  lastUsedAt: null,
  error: null,
};

export function useAnalysisGateState(refreshKey: number = 0): AnalysisGateState {
  const [state, setState] = useState<AnalysisGateState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setState({ ...INITIAL, loading: false, error: 'NOT_AUTHENTICATED' });
          return;
        }

        const [consentR, profileR, usageR] = await Promise.all([
          supabase.rpc('has_ai_consent', { p_user_id: user.id }),
          supabase.from('user_profiles')
            .select('ai_enabled, ai_unlimited')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase.rpc('get_pattern_analysis_usage', { p_user_id: user.id }),
        ]);

        const hasConsent = consentR.data === true;
        const aiEnabled = profileR.data?.ai_enabled !== false;
        const isUnlimited = profileR.data?.ai_unlimited === true;

        const row = Array.isArray(usageR.data) ? usageR.data[0] : null;
        const usageCount = row?.request_count ?? 0;
        const lastUsedAt = row?.last_used_at ?? null;

        let cooldownRemaining = 0;
        if (lastUsedAt && !isUnlimited) {
          const seconds = (Date.now() - new Date(lastUsedAt).getTime()) / 1000;
          cooldownRemaining = Math.max(0, Math.ceil(COOLDOWN_SECONDS - seconds));
        }

        if (!cancelled) {
          setState({
            loading: false,
            hasConsent,
            aiEnabled,
            isUnlimited,
            usageCount,
            limit: FREE_PATTERN_ANALYSIS_LIMIT,
            cooldownRemaining,
            lastUsedAt,
            error: null,
          });
        }
      } catch (err) {
        console.warn('[useAnalysisGateState] load failed:', err);
        if (!cancelled) setState({ ...INITIAL, loading: false, error: 'LOAD_FAILED' });
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Live cooldown countdown
  useEffect(() => {
    if (state.cooldownRemaining <= 0 || state.isUnlimited) return;
    const id = setInterval(() => {
      setState(prev => {
        if (prev.cooldownRemaining <= 0) return prev;
        const next = prev.cooldownRemaining - 1;
        return { ...prev, cooldownRemaining: Math.max(0, next) };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.cooldownRemaining, state.isUnlimited]);

  return state;
}
