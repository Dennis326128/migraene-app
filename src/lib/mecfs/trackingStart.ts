/**
 * ME/CFS Tracking Start Date — Hybrid A+B approach.
 * 
 * A) Read persisted `mecfs_tracking_started_at` from user_profiles (O(1)).
 * B) Fallback: derive from entries (earliest date with me_cfs_severity_score present).
 *    Then persist it for future O(1) reads.
 */
import { supabase } from "@/lib/supabaseClient";
import type { PainEntry } from "@/types/painApp";

let cachedStartDate: string | null | undefined = undefined;

/** Reset cache (e.g. on logout) */
export function resetMeCfsTrackingCache() {
  cachedStartDate = undefined;
}

/**
 * Get the ME/CFS tracking start date for the current user.
 * Returns ISO date string (YYYY-MM-DD) or null if not yet tracked.
 */
export async function getMeCfsTrackingStartDate(): Promise<string | null> {
  if (cachedStartDate !== undefined) return cachedStartDate;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from('user_profiles')
      .select('mecfs_tracking_started_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data?.mecfs_tracking_started_at) {
      cachedStartDate = data.mecfs_tracking_started_at;
      return cachedStartDate;
    }
  } catch (err) {
    console.warn('[ME/CFS] Failed to read tracking start date:', err);
  }

  cachedStartDate = null;
  return null;
}

/**
 * Set the ME/CFS tracking start date if not already set.
 * Called when an entry with me_cfs_severity_score is saved.
 */
export async function ensureMeCfsTrackingStartDate(entryDate: string): Promise<void> {
  try {
    // If already cached and set, skip
    if (cachedStartDate) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check DB (might have been set by another session)
    const { data } = await supabase
      .from('user_profiles')
      .select('mecfs_tracking_started_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data?.mecfs_tracking_started_at) {
      cachedStartDate = data.mecfs_tracking_started_at;
      return;
    }

    // Set it now
    const { error } = await supabase
      .from('user_profiles')
      .update({ mecfs_tracking_started_at: entryDate })
      .eq('user_id', user.id);

    if (!error) {
      cachedStartDate = entryDate;
      console.log(`[ME/CFS] Tracking start date set to ${entryDate}`);
    }
  } catch (err) {
    console.warn('[ME/CFS] Failed to set tracking start date:', err);
  }
}

/**
 * Derive ME/CFS start date from entries (Option B fallback).
 * Returns the earliest date where me_cfs_severity_score is explicitly present.
 */
export function deriveMeCfsStartFromEntries(entries: PainEntry[]): string | null {
  let earliest: string | null = null;
  for (const e of entries) {
    // Only count entries that explicitly have the field (not undefined)
    if ((e as any).me_cfs_severity_score === undefined) continue;
    const date = e.selected_date || e.timestamp_created?.split('T')[0];
    if (!date) continue;
    if (!earliest || date < earliest) {
      earliest = date;
    }
  }
  return earliest;
}

/**
 * Filter entries to only include those on or after ME/CFS tracking start.
 * If no start date is available, tries to derive it from entries.
 */
export function filterEntriesForMeCfs(
  entries: PainEntry[],
  mecfsStartDate: string | null
): PainEntry[] {
  // If we have a persisted start date, filter by it
  if (mecfsStartDate) {
    return entries.filter(e => {
      const date = e.selected_date || e.timestamp_created?.split('T')[0];
      return date && date >= mecfsStartDate;
    });
  }

  // Fallback: derive from entries themselves
  const derived = deriveMeCfsStartFromEntries(entries);
  if (derived) {
    return entries.filter(e => {
      const date = e.selected_date || e.timestamp_created?.split('T')[0];
      return date && date >= derived;
    });
  }

  // No tracking data at all — return all entries (new users)
  return entries;
}
