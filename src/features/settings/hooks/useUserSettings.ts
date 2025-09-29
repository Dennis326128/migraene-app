import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUserSettings, upsertUserSettings, type UserSettings, getUserDefaults, upsertUserDefaults, type UserDefaults } from "../api/settings.api";

export function useUserSettings() {
  return useQuery<UserSettings | null>({
    queryKey: ["user_settings"],
    queryFn: getUserSettings,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpsertUserSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertUserSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_settings"] }),
  });
}

export function useUserDefaults() {
  return useQuery<UserDefaults | null>({
    queryKey: ["user_defaults"],
    queryFn: getUserDefaults,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpsertUserDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertUserDefaults,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_defaults"] }),
  });
}