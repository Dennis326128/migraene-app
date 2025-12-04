import { z } from "zod";

/**
 * Validation schemas for medication management
 * Enhanced for German Medication Plan (BMP-style)
 */

// ═══════════════════════════════════════════════════════════════════════════
// BASIC FIELDS
// ═══════════════════════════════════════════════════════════════════════════

// Medication name validation
export const medicationNameSchema = z.string()
  .trim()
  .min(1, "Medikamentenname ist erforderlich")
  .max(100, "Medikamentenname darf maximal 100 Zeichen lang sein")
  .regex(
    /^[a-zA-ZäöüÄÖÜß0-9\s\-/().]+$/,
    "Medikamentenname enthält ungültige Zeichen. Nur Buchstaben, Zahlen und -/() sind erlaubt."
  );

// Active substance (Wirkstoff)
export const activeSubstanceSchema = z.string()
  .trim()
  .max(100, "Wirkstoff darf maximal 100 Zeichen lang sein")
  .optional()
  .nullable();

// Strength value (numeric only)
export const strengthValueSchema = z.string()
  .trim()
  .max(20, "Stärke darf maximal 20 Zeichen lang sein")
  .optional()
  .nullable();

// Strength unit
export const strengthUnitSchema = z.enum([
  "mg", "µg", "g", "ml", "Tropfen", "Hub", "mg/ml", "IE", "Stück", "Sonstiges"
]).optional().default("mg");

// Dosage form (Darreichungsform)
export const dosageFormSchema = z.enum([
  "Tablette", "Kapsel", "Filmtablette", "Schmelztablette", "Brausetablette",
  "Tropfen", "Lösung", "Sirup", "Nasenspray", "Spray",
  "Injektionslösung", "Fertigspritze", "Pen",
  "Zäpfchen", "Creme", "Salbe", "Pflaster", "Infusion", "Sonstiges"
]).optional();

// ═══════════════════════════════════════════════════════════════════════════
// INTAKE TYPE
// ═══════════════════════════════════════════════════════════════════════════

export const intakeTypeSchema = z.enum(["as_needed", "regular"], {
  errorMap: () => ({ message: "Ungültige Einnahmeart" })
}).default("as_needed");

// ═══════════════════════════════════════════════════════════════════════════
// AS-NEEDED (Bei Bedarf) DOSING
// ═══════════════════════════════════════════════════════════════════════════

export const asNeededStandardDoseSchema = z.string()
  .trim()
  .max(50, "Standarddosis darf maximal 50 Zeichen lang sein")
  .optional()
  .nullable();

export const asNeededMaxPer24hSchema = z.number()
  .int("Muss eine ganze Zahl sein")
  .min(1, "Muss mindestens 1 sein")
  .max(20, "Maximal 20 Einnahmen pro 24h")
  .optional()
  .nullable();

export const asNeededMaxDaysPerMonthSchema = z.number()
  .int("Muss eine ganze Zahl sein")
  .min(1, "Muss mindestens 1 Tag sein")
  .max(31, "Maximal 31 Tage pro Monat")
  .optional()
  .nullable();

export const asNeededMinIntervalHoursSchema = z.number()
  .min(0.5, "Mindestabstand muss mindestens 0.5 Stunden sein")
  .max(72, "Maximal 72 Stunden Abstand")
  .optional()
  .nullable();

export const asNeededNotesSchema = z.string()
  .max(500, "Notizen dürfen maximal 500 Zeichen lang sein")
  .optional()
  .nullable();

// ═══════════════════════════════════════════════════════════════════════════
// REGULAR DOSING
// ═══════════════════════════════════════════════════════════════════════════

export const regularDoseSchema = z.string()
  .trim()
  .max(10, "Dosis darf maximal 10 Zeichen lang sein")
  .optional()
  .nullable();

export const regularWeekdaysSchema = z.array(
  z.enum(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"])
).optional().nullable();

export const regularNotesSchema = z.string()
  .max(500, "Notizen dürfen maximal 500 Zeichen lang sein")
  .optional()
  .nullable();

// ═══════════════════════════════════════════════════════════════════════════
// INTOLERANCE
// ═══════════════════════════════════════════════════════════════════════════

export const intoleranceReasonTypeSchema = z.enum([
  "allergie", "nebenwirkungen", "wirkungslos", "sonstiges"
]).optional().nullable();

export const intoleranceNotesSchema = z.string()
  .max(300, "Unverträglichkeits-Notiz darf maximal 300 Zeichen lang sein")
  .optional()
  .nullable();

// ═══════════════════════════════════════════════════════════════════════════
// MEDICATION STATUS
// ═══════════════════════════════════════════════════════════════════════════

export const medicationStatusSchema = z.enum(["active", "stopped", "intolerant"], {
  errorMap: () => ({ message: "Ungültiger Status" })
}).default("active");

// ═══════════════════════════════════════════════════════════════════════════
// TYPICAL INDICATIONS (Anwendungsgebiete)
// ═══════════════════════════════════════════════════════════════════════════

export const typicalIndicationSchema = z.enum([
  "Akute Migräneattacke",
  "Migräneprophylaxe",
  "Übelkeit / Erbrechen",
  "Schlafstörung",
  "Angst / Unruhe",
  "Schmerzen allgemein",
  "Sonstiges"
]).optional().nullable();

// Medication notes
export const medicationNotesSchema = z.string()
  .max(500, "Notizen dürfen maximal 500 Zeichen lang sein")
  .optional()
  .nullable();

// Medication art (type of usage) - kept for backwards compatibility
export const medicationArtSchema = z.enum(["bedarf", "regelmaessig", "prophylaxe", "akut", "notfall"], {
  errorMap: () => ({ message: "Ungültige Einnahmeart" })
}).optional().default("bedarf");

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE MEDICATION FORM SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const medicationFormSchema = z.object({
  // Basic info
  name: medicationNameSchema,
  wirkstoff: activeSubstanceSchema,
  anwendungsgebiet: z.string().max(200).optional().nullable(),
  typical_indication: typicalIndicationSchema,
  
  // Pharma details
  strength_value: strengthValueSchema,
  strength_unit: strengthUnitSchema,
  staerke: z.string().max(50).optional().nullable(), // Legacy field
  darreichungsform: dosageFormSchema,
  einheit: z.string().max(20).optional().nullable(), // Legacy unit field
  
  // Intake type
  intake_type: intakeTypeSchema,
  art: medicationArtSchema, // Legacy field
  
  // As-needed dosing
  as_needed_standard_dose: asNeededStandardDoseSchema,
  as_needed_max_per_24h: asNeededMaxPer24hSchema,
  as_needed_max_days_per_month: asNeededMaxDaysPerMonthSchema,
  as_needed_min_interval_hours: asNeededMinIntervalHoursSchema,
  as_needed_notes: asNeededNotesSchema,
  dosis_bedarf: z.string().max(100).optional().nullable(), // Legacy field
  
  // Regular dosing
  dosis_morgens: regularDoseSchema,
  dosis_mittags: regularDoseSchema,
  dosis_abends: regularDoseSchema,
  dosis_nacht: regularDoseSchema,
  regular_weekdays: regularWeekdaysSchema,
  regular_notes: regularNotesSchema,
  
  // Intolerance
  intolerance_flag: z.boolean().optional().default(false),
  intolerance_reason_type: intoleranceReasonTypeSchema,
  intolerance_notes: intoleranceNotesSchema,
  
  // General warnings
  hinweise: medicationNotesSchema,
  
  // Status
  medication_status: medicationStatusSchema,
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

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type MedicationFormData = z.infer<typeof medicationFormSchema>;
export type SimpleMedicationData = z.infer<typeof simpleMedicationSchema>;
export type MedicationLimitData = z.infer<typeof medicationLimitSchema>;
export type IntakeType = z.infer<typeof intakeTypeSchema>;
export type MedicationStatus = z.infer<typeof medicationStatusSchema>;
export type IntoleranceReasonType = z.infer<typeof intoleranceReasonTypeSchema>;