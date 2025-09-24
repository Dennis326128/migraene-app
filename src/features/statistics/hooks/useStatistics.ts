import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface StatisticsFilters {
  from: string;
  to: string;
  levels?: string[];
  auraTypes?: string[];
  painLocations?: string[];
}

interface MigraineStat {
  total_entries: number;
  avg_intensity: number;
  with_medication_count: number;
  most_common_time_hour: number | null;
  most_common_aura: string | null;
  most_common_location: string | null;
}

interface TimeDistribution {
  hour_of_day: number;
  entry_count: number;
}

export function useFilteredEntries(filters: StatisticsFilters) {
  return useQuery({
    queryKey: ['filtered-entries', filters],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc('rpc_entries_filtered', {
        p_user: userData.user.id,
        p_from: filters.from,
        p_to: filters.to,
        p_levels: filters.levels || null,
        p_aura_types: filters.auraTypes || null,
        p_pain_locations: filters.painLocations || null
      });

      if (error) throw error;
      return data;
    },
    enabled: !!(filters.from && filters.to)
  });
}

export function useMigraineStats(filters: Pick<StatisticsFilters, 'from' | 'to'>) {
  return useQuery({
    queryKey: ['migraine-stats', filters.from, filters.to],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc('rpc_migraine_stats', {
        p_user: userData.user.id,
        p_from: filters.from,
        p_to: filters.to
      });

      if (error) throw error;
      return (data?.[0] as MigraineStat) || null;
    },
    enabled: !!(filters.from && filters.to)
  });
}

export function useTimeDistribution(filters: Pick<StatisticsFilters, 'from' | 'to'>) {
  return useQuery({
    queryKey: ['time-distribution', filters.from, filters.to],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc('rpc_time_distribution', {
        p_user: userData.user.id,
        p_from: filters.from,
        p_to: filters.to
      });

      if (error) throw error;
      return data as TimeDistribution[];
    },
    enabled: !!(filters.from && filters.to)
  });
}