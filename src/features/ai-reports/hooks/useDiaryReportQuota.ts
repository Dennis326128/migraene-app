/**
 * Hook to fetch diary report AI quota status
 * Used to display quota info and disable the Premium AI toggle when limit is reached
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

const FEATURE_NAME = "diary_report";
const FREE_DIARY_REPORT_MONTHLY = 5;

interface DiaryReportQuota {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  aiEnabled: boolean;
}

async function fetchDiaryReportQuota(): Promise<DiaryReportQuota> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { used: 0, limit: FREE_DIARY_REPORT_MONTHLY, remaining: FREE_DIARY_REPORT_MONTHLY, isUnlimited: false, aiEnabled: false };
  }

  // Fetch user profile for ai_enabled and ai_unlimited
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("ai_enabled, ai_unlimited")
    .eq("user_id", user.id)
    .maybeSingle();

  const aiEnabled = profile?.ai_enabled ?? false;
  const isUnlimited = profile?.ai_unlimited === true;

  // Fetch current month usage
  const currentPeriod = new Date().toISOString().slice(0, 7) + "-01";
  
  const { data: usageData } = await supabase
    .from("user_ai_usage")
    .select("request_count")
    .eq("user_id", user.id)
    .eq("feature", FEATURE_NAME)
    .gte("period_start", currentPeriod)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const used = usageData?.request_count ?? 0;
  const limit = FREE_DIARY_REPORT_MONTHLY;
  const remaining = isUnlimited ? 999 : Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    isUnlimited,
    aiEnabled,
  };
}

export function useDiaryReportQuota() {
  return useQuery({
    queryKey: ["diary_report_quota"],
    queryFn: fetchDiaryReportQuota,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}
