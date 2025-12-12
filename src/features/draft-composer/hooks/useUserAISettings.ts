/**
 * User AI Settings Hook
 * Fetches and manages AI-related settings from user_profiles
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { DraftEngineType } from "../engine/draftEngineFactory";

interface UserAISettings {
  aiEnabled: boolean;
  aiDraftEngine: DraftEngineType;
}

async function getUserAISettings(): Promise<UserAISettings> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { aiEnabled: false, aiDraftEngine: 'heuristic' };
  }

  const { data } = await supabase
    .from("user_profiles")
    .select("ai_enabled, ai_draft_engine")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    aiEnabled: data?.ai_enabled ?? false,
    aiDraftEngine: (data?.ai_draft_engine as DraftEngineType) ?? 'heuristic'
  };
}

async function updateUserAISettings(settings: Partial<UserAISettings>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");

  const updateData: Record<string, unknown> = {};
  if (settings.aiEnabled !== undefined) {
    updateData.ai_enabled = settings.aiEnabled;
  }
  if (settings.aiDraftEngine !== undefined) {
    updateData.ai_draft_engine = settings.aiDraftEngine;
  }

  const { error } = await supabase
    .from("user_profiles")
    .update(updateData)
    .eq("user_id", user.id);

  if (error) throw error;
}

export function useUserAISettings() {
  return useQuery({
    queryKey: ["user_ai_settings"],
    queryFn: getUserAISettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateUserAISettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateUserAISettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_ai_settings"] });
      queryClient.invalidateQueries({ queryKey: ["user_defaults"] });
    },
  });
}
