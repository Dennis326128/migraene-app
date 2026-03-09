/**
 * Medication Summary API
 * Aggregated overview: last intake (global), 7d/30d counts per medication.
 * Uses taken_date/taken_at as SSOT (no join to pain_entries).
 */

import { supabase } from "@/integrations/supabase/client";
import { yesterdayStr } from "@/lib/dateRange/rangeResolver";
import { subDays, format } from "date-fns";

export interface MedicationSummary {
  medication_name: string;
  /** Global last intake (max taken_at across ALL time) */
  last_intake_at: string | null;
  count_7d: number;
  count_30d: number;
}

/**
 * Compute effectiveToday-based ranges for 7d and 30d.
 */
export function getSummaryRanges() {
  const effectiveToday = yesterdayStr();
  // Use noon to avoid DST edge cases when subtracting days
  const effective = new Date(effectiveToday + "T12:00:00");
  const from7d = format(subDays(effective, 6), "yyyy-MM-dd");
  const from30d = format(subDays(effective, 29), "yyyy-MM-dd");
  return { effectiveToday, from7d, from30d };
}

/**
 * Fetch aggregated medication summaries for all medications the user has taken.
 * Two queries: (1) 30d window for counts, (2) global last intake per medication.
 */
export async function fetchMedicationSummaries(): Promise<MedicationSummary[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { effectiveToday, from7d, from30d } = getSummaryRanges();

  // Run both queries in parallel
  // IMPORTANT: We fetch ALL intakes (no taken_date filter) because some rows have
  // NULL taken_date due to a sync bug. We filter client-side using taken_date ?? taken_at.
  const [allIntakesResult, globalLastResult] = await Promise.all([
    supabase
      .from("medication_intakes")
      .select("medication_name, taken_at, taken_date")
      .eq("user_id", user.id)
      .order("taken_at", { ascending: false })
      .limit(2000),

    // 2. Global last intake per medication (most recent per med)
    supabase
      .from("medication_intakes")
      .select("medication_name, taken_at")
      .eq("user_id", user.id)
      .order("taken_at", { ascending: false })
      .limit(500),
  ]);

  if (allIntakesResult.error) throw allIntakesResult.error;
  if (globalLastResult.error) throw globalLastResult.error;

  // Build global last map from query 2
  const globalLastMap = new Map<string, string>();
  for (const row of (globalLastResult.data || [])) {
    if (!globalLastMap.has(row.medication_name)) {
      globalLastMap.set(row.medication_name, row.taken_at!);
    }
  }

  // Aggregate counts — use taken_date with fallback to taken_at date portion
  const medMap = new Map<string, { count_7d: number; count_30d: number }>();

  for (const intake of (allIntakesResult.data || [])) {
    // SSOT: effective date = taken_date ?? date portion of taken_at
    const effectiveDate = intake.taken_date
      || (intake.taken_at ? intake.taken_at.substring(0, 10) : null);

    if (!effectiveDate) continue;

    // Filter to 30d window
    if (effectiveDate < from30d || effectiveDate > effectiveToday) continue;

    const name = intake.medication_name;
    if (!medMap.has(name)) {
      medMap.set(name, { count_7d: 0, count_30d: 0 });
    }
    const entry = medMap.get(name)!;
    entry.count_30d++;
    if (effectiveDate >= from7d) {
      entry.count_7d++;
    }
  }

  // Merge: include meds from global that may not be in 30d window
  for (const name of globalLastMap.keys()) {
    if (!medMap.has(name)) {
      medMap.set(name, { count_7d: 0, count_30d: 0 });
    }
  }

  return Array.from(medMap.entries())
    .map(([medication_name, stats]) => ({
      medication_name,
      last_intake_at: globalLastMap.get(medication_name) || null,
      ...stats,
    }))
    .sort((a, b) => {
      if (b.count_30d !== a.count_30d) return b.count_30d - a.count_30d;
      if (a.last_intake_at && b.last_intake_at) return b.last_intake_at.localeCompare(a.last_intake_at);
      return a.last_intake_at ? -1 : 1;
    });
}
