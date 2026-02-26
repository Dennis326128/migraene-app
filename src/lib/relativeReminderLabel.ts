/**
 * Relative label for reminders/appointments.
 *
 * WHY CalendarDays instead of 24h-diff:
 * A 24h-diff would report "today" for an event at 01:00 when checked at 23:30
 * the day before, which is wrong from the user's perspective.
 * Calendar-day diff (date-to-date) matches what humans mean by "today/tomorrow".
 *
 * Uses berlinDateFromUTC() as single source of truth for "now",
 * consistent with the rest of the app (see dateUtils.ts).
 */
import { berlinDateFromUTC } from "@/lib/tz";
import { differenceInCalendarDays, differenceInMinutes } from "date-fns";

export interface RelativeReminderResult {
  /** Primary label: "Heute", "Morgen", "Übermorgen", "In 5 Tagen" */
  label: string;
  /** Sub-label for today only: "In 45 Min", "In 3 Std", "Jetzt" */
  subLabel: string | null;
  /** Calendar day diff (0=today, 1=tomorrow, -1=yesterday, etc.) */
  dayDiff: number;
  /** Whether this is a today-event (drives minute-refresh) */
  isToday: boolean;
}

/**
 * Compute relative label for a reminder's next occurrence.
 *
 * @param eventDate - The event's Date object (already parsed from date_time)
 * @param now       - Optional override for "now" (testing); defaults to Berlin time
 */
export function formatRelativeReminderLabel(
  eventDate: Date,
  now?: Date,
): RelativeReminderResult {
  const berlinNow = now ?? berlinDateFromUTC();

  // Strip time to get pure calendar dates for day-diff
  const nowDay = new Date(berlinNow.getFullYear(), berlinNow.getMonth(), berlinNow.getDate());
  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

  const dayDiff = differenceInCalendarDays(eventDay, nowDay);

  // Build primary label
  let label: string;
  if (dayDiff < 0) {
    label = "Vergangen";
  } else if (dayDiff === 0) {
    label = "Heute";
  } else if (dayDiff === 1) {
    label = "Morgen";
  } else if (dayDiff === 2) {
    label = "Übermorgen";
  } else {
    label = `In ${dayDiff} Tagen`;
  }

  // Sub-label only for today (N==0) — shows remaining time for verpass-safety
  let subLabel: string | null = null;
  if (dayDiff === 0) {
    const minutesLeft = differenceInMinutes(eventDate, berlinNow);
    if (minutesLeft <= 0) {
      subLabel = "Jetzt";
    } else if (minutesLeft < 60) {
      subLabel = `In ${minutesLeft} Min`;
    } else {
      const hoursLeft = Math.floor(minutesLeft / 60);
      const remainingMins = minutesLeft % 60;
      if (remainingMins > 0 && hoursLeft < 3) {
        subLabel = `In ${hoursLeft} Std ${remainingMins} Min`;
      } else {
        subLabel = `In ${hoursLeft} Std`;
      }
    }
  }

  return { label, subLabel, dayDiff, isToday: dayDiff === 0 };
}

/**
 * Compute ms until next local midnight (Berlin time).
 * Used by the refresh hook to trigger day-boundary updates.
 */
export function msUntilNextMidnight(now?: Date): number {
  const berlinNow = now ?? berlinDateFromUTC();
  const nextMidnight = new Date(
    berlinNow.getFullYear(),
    berlinNow.getMonth(),
    berlinNow.getDate() + 1,
    0, 0, 0, 0,
  );
  return Math.max(nextMidnight.getTime() - berlinNow.getTime(), 1000);
}
