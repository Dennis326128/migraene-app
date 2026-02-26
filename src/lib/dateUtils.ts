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
  if (!dateStr) return "—";

  // Parse input as a pure calendar date (no timezone shift)
  const inputDate = parse(dateStr, "yyyy-MM-dd", new Date());
  if (isNaN(inputDate.getTime())) {
    if (import.meta.env.DEV) console.warn(`[dateUtils] Invalid date: "${dateStr}"`);
    return "—";
  }

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

  // Include year if different from current year
  const currentYear = todayDate.getFullYear();
  const inputYear = inputDate.getFullYear();
  if (inputYear !== currentYear) {
    return format(inputDate, "EEE, dd.MM.yyyy", { locale: de });
  }

  // Format: "Mi., 25.02."
  return format(inputDate, "EEE, dd.MM.", { locale: de });
}

/**
 * Combines relative date label with time: "Heute, 07:26" | "Gestern, 14:30" | "Mi., 25.02., 07:26"
 * @param dateStr YYYY-MM-DD
 * @param timeStr HH:mm or HH:mm:ss
 */
export function formatRelativeDateTimeLabel(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return "—";

  const dateLabel = formatRelativeDateLabel(dateStr);
  if (dateLabel === "—") return "—";

  if (!timeStr) return dateLabel;

  // Normalize time to HH:mm
  const timeParts = timeStr.split(":");
  const formattedTime = `${timeParts[0]}:${timeParts[1]}`;

  return `${dateLabel}, ${formattedTime}`;
}
