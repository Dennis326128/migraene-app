import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { useEvents } from "@/features/events/hooks/useEvents";

/**
 * Temporary compatibility hook that supports both pain_entries and events
 * This provides a seamless transition during migration
 */
export function useCompatibleEntries(filters?: { from: string; to: string }) {
  // Check both systems
  const { data: legacyEntries = [], isLoading: legacyLoading, error: legacyError } = useEntries(filters);
  const { data: newEvents = [], isLoading: eventsLoading, error: eventsError } = useEvents();

  return useQuery({
    queryKey: ['compatible-entries', filters],
    queryFn: async () => {
      // If we have new events, use them
      if (newEvents && newEvents.length > 0) {
        console.log('✅ Using new event system:', newEvents.length, 'events');
        return newEvents;
      }
      
      // Otherwise fall back to legacy entries
      if (legacyEntries && legacyEntries.length > 0) {
        console.log('🔄 Using legacy system:', legacyEntries.length, 'entries');
        return legacyEntries;
      }

      console.log('📭 No data in either system');
      return [];
    },
    enabled: !legacyLoading && !eventsLoading,
    initialData: []
  });
}

/**
 * Hook to check which system has data and recommend migration
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: ['system-status'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const [painEntriesResult, eventsResult] = await Promise.all([
        supabase.from("pain_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      ]);

      const painCount = painEntriesResult.count || 0;
      const eventCount = eventsResult.count || 0;

      return {
        painEntries: painCount,
        events: eventCount,
        hasLegacyData: painCount > 0,
        hasNewData: eventCount > 0,
        needsMigration: painCount > 0 && eventCount === 0,
        systemToUse: eventCount > 0 ? 'events' : 'pain_entries'
      };
    }
  });
}
