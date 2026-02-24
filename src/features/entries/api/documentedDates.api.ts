/**
 * Fetch the first documented entry date for the current user.
 * Returns YYYY-MM-DD string or null.
 */
import { supabase } from "@/lib/supabaseClient";

export async function fetchFirstEntryDate(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Get earliest entry by selected_date
  const { data, error } = await supabase
    .from("pain_entries")
    .select("selected_date, timestamp_created")
    .eq("user_id", user.id)
    .order("selected_date", { ascending: true, nullsFirst: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const row = data[0];
  return row.selected_date || row.timestamp_created?.split('T')[0] || null;
}
