import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUserSettings, upsertUserSettings, type UserSettings } from "../api/settings.api";

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