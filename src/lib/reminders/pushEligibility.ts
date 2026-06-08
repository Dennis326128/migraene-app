/**
 * Push-Eligibility Helper
 * -----------------------
 * Single Source of Truth für die Frage:
 * "Wäre dieser Reminder geeignet, später als lokale Push-Benachrichtigung
 * (z. B. via Capacitor Local Notifications) geplant zu werden?"
 *
 * WICHTIG: Diese Funktion plant KEINE Pushes und löst KEINE Notifications aus.
 * Sie kapselt nur die Regeln, damit ein späterer Push-Scheduler (Capacitor)
 * ohne doppelte Logik / doppelte UI darauf aufbauen kann.
 *
 * Verwendung später (Pseudocode):
 *   reminders
 *     .filter(isReminderPushEligible)
 *     .forEach(scheduleLocalNotification);
 */

import type { Reminder, ReminderRepeat, ReminderStatus } from "@/types/reminder.types";

/** Status-Werte, die einen Reminder als "aktiv/offen" gelten lassen. */
const OPEN_STATUSES: ReminderStatus[] = ["pending", "processing", "scheduled" as ReminderStatus];

/** Aktuell unterstützte Wiederholungstypen für Push-Scheduling. */
const SCHEDULABLE_REPEATS: ReminderRepeat[] = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "weekdays",
];

export interface PushEligibilityResult {
  eligible: boolean;
  /** Lesbarer Grund, falls nicht eligible. Nützlich für Debug/QA. */
  reason?:
    | "notifications_off"
    | "status_closed"
    | "invalid_datetime"
    | "unsupported_repeat"
    | "past_oneoff";
}

/**
 * Detaillierte Variante mit Begründung.
 */
export function evaluateReminderPushEligibility(
  reminder: Pick<
    Reminder,
    "notification_enabled" | "status" | "date_time" | "repeat"
  >,
  now: Date = new Date()
): PushEligibilityResult {
  // 1. Master-Toggle: Nutzer hat die Erinnerung aus.
  if (!reminder.notification_enabled) {
    return { eligible: false, reason: "notifications_off" };
  }

  // 2. Status muss "offen" sein. Erledigt/abgebrochen/verpasst → kein Push.
  if (!OPEN_STATUSES.includes(reminder.status)) {
    return { eligible: false, reason: "status_closed" };
  }

  // 3. Gültiges date_time.
  const ts = reminder.date_time ? Date.parse(reminder.date_time) : NaN;
  if (!Number.isFinite(ts)) {
    return { eligible: false, reason: "invalid_datetime" };
  }

  // 4. Wiederholung muss auswertbar sein.
  const repeat: ReminderRepeat = reminder.repeat ?? "none";
  if (!SCHEDULABLE_REPEATS.includes(repeat)) {
    return { eligible: false, reason: "unsupported_repeat" };
  }

  // 5. Einmalige Reminder in der Vergangenheit → kein Push mehr.
  if (repeat === "none" && ts < now.getTime()) {
    return { eligible: false, reason: "past_oneoff" };
  }

  return { eligible: true };
}

/**
 * Boolean-Kurzform. Zukünftiger Capacitor-Push-Scheduler kann z. B.:
 *   reminders.filter(isReminderPushEligible).forEach(scheduleLocalNotification)
 */
export function isReminderPushEligible(
  reminder: Pick<
    Reminder,
    "notification_enabled" | "status" | "date_time" | "repeat"
  >,
  now: Date = new Date()
): boolean {
  return evaluateReminderPushEligibility(reminder, now).eligible;
}
