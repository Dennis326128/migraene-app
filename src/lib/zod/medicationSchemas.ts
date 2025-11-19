import { z } from "zod";

/**
 * Validation schemas for medication management
 */

// Medication name validation
export const medicationNameSchema = z.string()
  .trim()
  .min(1, "Medikamentenname ist erforderlich")
  .max(100, "Medikamentenname darf maximal 100 Zeichen lang sein")
  .regex(
    /^[a-zA-ZäöüÄÖÜß0-9\s\-/().]+$/,
    "Medikamentenname enthält ungültige Zeichen. Nur Buchstaben, Zahlen und -/() sind erlaubt."
  );

// Medication dosage validation
export const dosageSchema = z.string()
  .trim()
  .max(50, "Dosierung darf maximal 50 Zeichen lang sein")
  .optional()
  .nullable();

// Medication effectiveness rating (0-10)
export const effectivenessSchema = z.number()
  .min(0, "Wirksamkeit muss mindestens 0 sein")
  .max(10, "Wirksamkeit darf maximal 10 sein")
  .optional()
  .nullable();

// Medication notes
export const medicationNotesSchema = z.string()
  .max(500, "Notizen dürfen maximal 500 Zeichen lang sein")
  .optional()
  .nullable();

// Complete medication form schema
export const medicationFormSchema = z.object({
  name: medicationNameSchema,
  dosage: dosageSchema,
  effectiveness: effectivenessSchema,
  notes: medicationNotesSchema,
});

// Medication limit schema
export const medicationLimitSchema = z.object({
  medication_name: medicationNameSchema,
  limit_count: z.number()
    .int("Limit muss eine ganze Zahl sein")
    .min(1, "Limit muss mindestens 1 sein")
    .max(50, "Limit darf maximal 50 sein"),
  period_type: z.enum(["daily", "weekly", "monthly"], {
    errorMap: () => ({ message: "Ungültiger Zeitraum" })
  }),
  is_active: z.boolean().optional().default(true),
});

export type MedicationFormData = z.infer<typeof medicationFormSchema>;
export type MedicationLimitData = z.infer<typeof medicationLimitSchema>;
