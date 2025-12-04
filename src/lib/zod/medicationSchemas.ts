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

// Intolerance notes validation
export const intoleranceNotesSchema = z.string()
  .max(300, "Unverträglichkeits-Notiz darf maximal 300 Zeichen lang sein")
  .optional()
  .nullable();

// Medication art (type of usage)
export const medicationArtSchema = z.enum(["bedarf", "regelmaessig", "prophylaxe", "akut"], {
  errorMap: () => ({ message: "Ungültige Einnahmeart" })
}).optional().default("bedarf");

// Complete medication form schema (extended)
export const medicationFormSchema = z.object({
  name: medicationNameSchema,
  wirkstoff: z.string().max(100).optional().nullable(),
  staerke: z.string().max(50).optional().nullable(),
  darreichungsform: z.string().max(50).optional().nullable(),
  einheit: z.string().max(20).optional().nullable(),
  dosis_morgens: dosageSchema,
  dosis_mittags: dosageSchema,
  dosis_abends: dosageSchema,
  dosis_nacht: dosageSchema,
  dosis_bedarf: dosageSchema,
  anwendungsgebiet: z.string().max(200).optional().nullable(),
  hinweise: medicationNotesSchema,
  art: medicationArtSchema,
  // Intolerance fields
  intolerance_flag: z.boolean().optional().default(false),
  intolerance_notes: intoleranceNotesSchema,
});

// Simple medication schema (only name required)
export const simpleMedicationSchema = z.object({
  name: medicationNameSchema,
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

// Types
export type MedicationFormData = z.infer<typeof medicationFormSchema>;
export type SimpleMedicationData = z.infer<typeof simpleMedicationSchema>;
export type MedicationLimitData = z.infer<typeof medicationLimitSchema>;
