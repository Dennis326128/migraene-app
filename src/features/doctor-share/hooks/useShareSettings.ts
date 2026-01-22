/**
 * Doctor Share Settings Hooks
 * React Query hooks für Share-Einstellungen
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getShareSettings,
  upsertShareSettings,
  createShareSettings,
  linkReportToShare,
  type DoctorShareSettings,
  type UpdateShareSettingsInput,
  type CreateShareSettingsInput,
} from "../api/doctorShareSettings.api";

const QUERY_KEY = ['doctor-share-settings'];

/**
 * Holt die Settings für einen Share
 */
export function useShareSettings(shareId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, shareId],
    queryFn: () => shareId ? getShareSettings(shareId) : null,
    enabled: !!shareId,
  });
}

/**
 * Erstellt oder aktualisiert Settings
 */
export function useUpsertShareSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ shareId, settings }: { shareId: string; settings: UpdateShareSettingsInput }) =>
      upsertShareSettings(shareId, settings),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, data.share_id] });
    },
  });
}

/**
 * Erstellt neue Settings für einen Share
 */
export function useCreateShareSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (input: CreateShareSettingsInput) => createShareSettings(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, data.share_id] });
    },
  });
}

/**
 * Verlinkt einen Report mit dem Share
 */
export function useLinkReportToShare() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ shareId, reportId }: { shareId: string; reportId: string }) =>
      linkReportToShare(shareId, reportId),
    onSuccess: (_, { shareId }) => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, shareId] });
    },
  });
}

// Re-export types
export type { DoctorShareSettings, UpdateShareSettingsInput, CreateShareSettingsInput };
