import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntries } from "@/features/entries/hooks/useEntries";

/**
 * Hook that provides backwards compatibility - now only uses pain_entries system
 */
export function useCompatibleEntries(filters?: { from: string; to: string }) {
  // Use only the pain_entries system (which is now the primary system)
  const { data: legacyEntries = [], isLoading: legacyLoading, error: legacyError } = useEntries(filters);

  // Debug logging for data received
  console.log('🔍 useCompatibleEntries debug:', {
    legacyEntries: legacyEntries?.length || 0,
    legacyLoading,
    filters
  });

  return useQuery({
    queryKey: ['compatible-entries', filters],
    queryFn: () => {
      // Return pain_entries data
      if (legacyEntries && legacyEntries.length > 0) {
        console.log('🔄 Using pain_entries system:', legacyEntries.length, 'entries');
        return legacyEntries;
      }

      console.log('📭 No data found');
      return [];
    },
    enabled: !legacyLoading,
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => {
      console.log('🔍 Compatible entries selected:', data?.length || 0, 'entries');
      return data || [];
    }
  });
}

/**
 * Hook to check system status - simplified to only check pain_entries
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: ['system-status'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const painEntriesResult = await supabase
        .from("pain_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      const painCount = painEntriesResult.count || 0;

      return {
        painEntries: painCount,
        events: 0, // No longer using events
        hasLegacyData: painCount > 0,
        hasNewData: false, // No new system anymore
        needsMigration: false, // No migration needed
        systemToUse: 'pain_entries'
      };
    }
  });
}
