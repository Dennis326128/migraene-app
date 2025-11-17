import { useEntries } from "@/features/entries/hooks/useEntries";

/**
 * Hook that provides backwards compatibility wrapper for pain_entries
 * This is now simply a pass-through to useEntries as we only use pain_entries
 */
export function useCompatibleEntries(filters?: { from: string; to: string }) {
  return useEntries(filters);
}
