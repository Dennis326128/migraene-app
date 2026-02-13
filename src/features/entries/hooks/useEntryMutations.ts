import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createEntry, updateEntry, deleteEntry, type PainEntryPayload } from "../api/entries.api";

const INVALIDATION_KEY = "miary_med_usage_changed_at";

function markMedUsageChanged() {
  try {
    localStorage.setItem(INVALIDATION_KEY, String(Date.now()));
  } catch {
    // localStorage might be unavailable
  }
}

export function useCreateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PainEntryPayload) => createEntry(payload),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["missing-weather"] });
      markMedUsageChanged();
    },
  });
}

export function useUpdateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<PainEntryPayload> }) => updateEntry(id, patch),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["missing-weather"] });
      markMedUsageChanged();
    },
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["missing-weather"] });
      markMedUsageChanged();
    },
  });
}
