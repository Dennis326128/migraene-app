import { z } from "zod";
import { isValid, parse, isFuture, isPast, startOfDay } from "date-fns";

/**
 * Validation schemas for reminders
 */

// Date validation for reminders
export const reminderDateSchema = z.string()
  .min(1, "Datum ist erforderlich")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat (YYYY-MM-DD)")
  .refine(
    (dateStr) => {
      try {
        const date = parse(dateStr, 'yyyy-MM-dd', new Date());
        return isValid(date);
      } catch {
        return false;
      }
    },
    { message: "Ungültiges Datum" }
  )
  .refine(
    (dateStr) => {
      const date = parse(dateStr, 'yyyy-MM-dd', new Date());
      const today = startOfDay(new Date());
      // Allow dates from today up to 1 year in future
      const oneYearAhead = new Date(today);
      oneYearAhead.setFullYear(today.getFullYear() + 1);
      return !isPast(date) || date.getTime() === today.getTime();
    },
    { message: "Datum darf nicht in der Vergangenheit liegen" }
  );

// Time validation for reminders
export const reminderTimeSchema = z.string()
  .min(1, "Uhrzeit ist erforderlich")
  .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Ungültiges Zeitformat (HH:MM)");

// Reminder title validation
export const reminderTitleSchema = z.string()
  .trim()
  .min(1, "Titel ist erforderlich")
  .max(100, "Titel darf maximal 100 Zeichen lang sein");

// Reminder notes validation
export const reminderNotesSchema = z.string()
  .max(500, "Notizen dürfen maximal 500 Zeichen lang sein")
  .optional()
  .nullable();

// Reminder type validation
export const reminderTypeSchema = z.enum(['medication', 'appointment'], {
  errorMap: () => ({ message: "Ungültiger Erinnerungstyp" })
});

// Reminder repeat validation
export const reminderRepeatSchema = z.enum(['none', 'daily', 'weekly', 'monthly'], {
  errorMap: () => ({ message: "Ungültiger Wiederholungstyp" })
});

// Complete reminder form schema
export const reminderFormSchema = z.object({
  type: reminderTypeSchema,
  title: reminderTitleSchema,
  date: reminderDateSchema,
  time: reminderTimeSchema,
  repeat: reminderRepeatSchema,
  notes: reminderNotesSchema,
  notification_enabled: z.boolean().default(true),
  status: z.enum(['pending', 'done', 'missed', 'cancelled']).optional().default('pending'),
});

export type ReminderFormData = z.infer<typeof reminderFormSchema>;
