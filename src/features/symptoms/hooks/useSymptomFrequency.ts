import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { subDays } from "date-fns";

/**
 * Returns symptom frequency counts for the last 90 days.
 * Maps symptom catalog name → count of entries that had that symptom.
 */
export function useSymptomFrequency() {
  return useQuery({
    queryKey: ["symptom_frequency_90d"],
    queryFn: async (): Promise<Map<string, number>> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Map();

      const from = subDays(new Date(), 90).toISOString().slice(0, 10);

      // Get entry IDs from last 90 days
      const { data: entries, error: eErr } = await supabase
        .from("pain_entries")
        .select("id")
        .eq("user_id", user.id)
        .gte("selected_date", from);

      if (eErr || !entries?.length) return new Map();

      const entryIds = entries.map(e => e.id);

      // Get all entry_symptoms for those entries
      const { data: es, error: esErr } = await supabase
        .from("entry_symptoms")
        .select("symptom_id")
        .in("entry_id", entryIds);

      if (esErr || !es?.length) return new Map();

      // Get symptom catalog for name lookup
      const { data: catalog } = await supabase
        .from("symptom_catalog")
        .select("id, name")
        .eq("is_active", true);

      const idToName = new Map((catalog || []).map(c => [c.id, c.name]));

      // Count per symptom name
      const freq = new Map<string, number>();
      for (const row of es) {
        const name = idToName.get(row.symptom_id);
        if (name) {
          freq.set(name, (freq.get(name) || 0) + 1);
        }
      }
      return freq;
    },
    staleTime: 5 * 60 * 1000,
  });
}
