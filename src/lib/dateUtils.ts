/**
 * Relative date labels for medication views.
 * Uses Berlin timezone to determine "today" reliably.
 */
import { berlinDateFromUTC } from "@/lib/tz";
import { differenceInCalendarDays, format, parse } from "date-fns";
import { de } from "date-fns/locale";

/**
 * Converts a YYYY-MM-DD date string to a relative label:
 * - "Heute" if it matches today (Berlin time)
 * - "Gestern" if it matches yesterday
 * - Otherwise: "Mi., 25.02." (short weekday + date)
 *
 * Uses berlinDateFromUTC() as single source of truth for "now",
 * ensuring correctness regardless of browser timezone.
 */
export function formatRelativeDateLabel(dateStr: string): string {
  if (!dateStr) return "";

  // Parse input as a pure calendar date (no timezone shift)
  const inputDate = parse(dateStr, "yyyy-MM-dd", new Date());
  if (isNaN(inputDate.getTime())) return dateStr; // fallback: return raw

  // Get today in Berlin timezone as a calendar date
  const berlinNow = berlinDateFromUTC();
  const todayDate = new Date(
    berlinNow.getFullYear(),
    berlinNow.getMonth(),
    berlinNow.getDate()
  );

  const diff = differenceInCalendarDays(todayDate, inputDate);

  if (diff === 0) return "Heute";
  if (diff === 1) return "Gestern";
  if (diff === -1) return "Morgen";

  // Format: "Mi., 25.02."
  return format(inputDate, "EEE, dd.MM.", { locale: de });
}
