import { supabase } from "@/lib/supabaseClient";
import { logAndSaveWeatherAt } from "@/utils/weatherLogger";
import type { PainEntry } from "@/types/painApp";

function toAtISO(entry: Pick<PainEntry, "selected_date" | "selected_time" | "timestamp_created">): string {
  if (entry.selected_date && entry.selected_time) {
    // lokale Eingabe → in ISO (UTC) wandeln
    return new Date(`${entry.selected_date}T${entry.selected_time}:00`).toISOString();
  }
  return new Date(entry.timestamp_created).toISOString();
}

/** Backfill für Einträge ohne weather_id innerhalb der letzten `days` Tage. */
export async function backfillWeatherForRecentEntries(days = 30): Promise<{ total: number; ok: number; fail: number; }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { total: 0, ok: 0, fail: 0 };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("pain_entries")
    .select("id, timestamp_created, selected_date, selected_time, weather_id")
    .eq("user_id", user.id)
    .is("weather_id", null)
    .gte("timestamp_created", since.toISOString())
    .order("timestamp_created", { ascending: true });

  if (error || !data?.length) return { total: data?.length || 0, ok: 0, fail: 0 };

  let ok = 0, fail = 0;
  for (const e of data) {
    try {
      const atISO = toAtISO(e as any);
      const wid = await logAndSaveWeatherAt(atISO);
      if (wid) {
        const { error: upErr } = await supabase.from("pain_entries").update({ weather_id: wid }).eq("id", e.id);
        if (upErr) throw upErr;
        ok++;
      } else {
        fail++;
      }
      // kleine Pause, um Rate-Limits zu vermeiden
      await new Promise(r => setTimeout(r, 150));
    } catch {
      fail++;
    }
  }
  return { total: data.length, ok, fail };
}