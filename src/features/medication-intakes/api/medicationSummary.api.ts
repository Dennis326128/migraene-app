/**
 * Medication Summary API
 * Aggregated overview: last intake, 7d/30d counts per medication.
 * Uses taken_date/taken_at as SSOT (no join to pain_entries).
 */

import { supabase } from "@/integrations/supabase/client";
import { yesterdayStr } from "@/lib/dateRange/rangeResolver";
import { subDays, format } from "date-fns";

export interface MedicationSummary {
  medication_name: string;
  last_intake_at: string | null;
  count_7d: number;
  count_30d: number;
}

/**
 * Compute effectiveToday-based ranges for 7d and 30d.
 */
export function getSummaryRanges() {
  const effectiveToday = yesterdayStr();
  const effective = new Date(effectiveToday + "T00:00:00");
  const from7d = format(subDays(effective, 6), "yyyy-MM-dd");
  const from30d = format(subDays(effective, 29), "yyyy-MM-dd");
  return { effectiveToday, from7d, from30d };
}

/**
 * Fetch aggregated medication summaries for all medications the user has taken.
 * Single efficient query approach: fetch all intakes in 30d window, aggregate client-side.
 */
export async function fetchMedicationSummaries(): Promise<MedicationSummary[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { effectiveToday, from7d, from30d } = getSummaryRanges();

  // 1. Get all intakes in the 30d window (covers both 7d and 30d)
  const { data: intakes, error } = await supabase
    .from("medication_intakes")
    .select("medication_name, taken_at, taken_date")
    .eq("user_id", user.id)
    .gte("taken_date", from30d)
    .lte("taken_date", effectiveToday)
    .order("taken_at", { ascending: false });

  if (error) throw error;

  // 2. Also get last intake globally (for meds that might not have 30d intakes)
  // We use max(taken_at) from the 30d data; for truly global "last", we'd need another query.
  // But since the statistics view is range-bound, 30d data is sufficient.

  // 3. Aggregate client-side
  const medMap = new Map<string, {
    last_intake_at: string | null;
    count_7d: number;
    count_30d: number;
  }>();

  for (const intake of (intakes || [])) {
    const name = intake.medication_name;
    if (!medMap.has(name)) {
      medMap.set(name, { last_intake_at: null, count_7d: 0, count_30d: 0 });
    }
    const entry = medMap.get(name)!;

    // Last intake (first in descending order)
    if (!entry.last_intake_at) {
      entry.last_intake_at = intake.taken_at;
    }

    // 30d count
    entry.count_30d++;

    // 7d count
    if (intake.taken_date >= from7d) {
      entry.count_7d++;
    }
  }

  return Array.from(medMap.entries())
    .map(([medication_name, stats]) => ({ medication_name, ...stats }))
    .sort((a, b) => b.count_30d - a.count_30d);
}
