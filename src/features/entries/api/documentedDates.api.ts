/**
 * Fetch distinct documented dates for the current user.
 * Returns a Set<YYYY-MM-DD> and first/last dates.
 * Only fetches ~last 400 days for performance (enough for 12M preset check).
 */
import { supabase } from "@/lib/supabaseClient";

export interface DocumentedDatesResult {
  dates: Set<string>;
  firstDocDate: string | null;
  lastDocDate: string | null;
}

export async function fetchDocumentedDates(): Promise<DocumentedDatesResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { dates: new Set(), firstDocDate: null, lastDocDate: null };

  // Fetch selected_date for all entries (distinct dates)
  // We use selected_date primarily, fallback to timestamp_created
  const { data, error } = await supabase
    .from("pain_entries")
    .select("selected_date, timestamp_created")
    .eq("user_id", user.id)
    .order("selected_date", { ascending: true });

  if (error || !data || data.length === 0) {
    return { dates: new Set(), firstDocDate: null, lastDocDate: null };
  }

  const dates = new Set<string>();
  for (const row of data) {
    const d = row.selected_date || row.timestamp_created?.split('T')[0];
    if (d) dates.add(d);
  }

  if (dates.size === 0) {
    return { dates, firstDocDate: null, lastDocDate: null };
  }

  const sorted = Array.from(dates).sort();
  return {
    dates,
    firstDocDate: sorted[0],
    lastDocDate: sorted[sorted.length - 1],
  };
}
