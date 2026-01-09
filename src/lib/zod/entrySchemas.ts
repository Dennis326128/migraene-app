import { z } from "zod";
import { isValid, parse, isBefore, startOfDay } from "date-fns";

// Pain level validation (0-10 scale or legacy text values)
export const painLevelSchema = z.union([
  z.number().min(0, "Schmerzwert muss mindestens 0 sein").max(10, "Schmerzwert darf maximal 10 sein"),
  z.enum(["leicht", "mittel", "stark", "sehr_stark"], {
    errorMap: () => ({ message: "Ungültiger Schmerzwert" })
  })
]);

// Date validation
export const dateSchema = z.string()
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
      // Allow dates up to 1 year in the past
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      return !isBefore(date, oneYearAgo);
    },
    { message: "Datum darf nicht mehr als 1 Jahr in der Vergangenheit liegen" }
  );

// Time validation
export const timeSchema = z.string()
  .min(1, "Uhrzeit ist erforderlich")
  .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Ungültiges Zeitformat (HH:MM)");

// Medication name validation
export const medicationNameSchema = z.string()
  .trim()
  .min(1, "Medikamentenname ist erforderlich")
  .max(100, "Medikamentenname darf maximal 100 Zeichen lang sein")
  .regex(/^[a-zA-ZäöüÄÖÜß0-9\s\-/().]+$/, "Medikamentenname enthält ungültige Zeichen");

// Notes validation
export const notesSchema = z.string()
  .max(2000, "Notizen dürfen maximal 2000 Zeichen lang sein")
  .optional()
  .nullable();

// Medication array validation
export const medicationsArraySchema = z.array(medicationNameSchema)
  .max(20, "Maximal 20 Medikamente erlaubt")
  .optional()
  .default([]);

// Location validation (single location enum)
export const locationEnumSchema = z.enum([
  "einseitig_links",
  "einseitig_rechts", 
  "beidseitig",
  "stirn",
  "nacken",
  "schlaefe",
  "top_of_head_burning"
], {
  errorMap: () => ({ message: "Ungültige Schmerzlokalisation" })
});

// Locations array validation (0-n locations)
export const locationsArraySchema = z.array(locationEnumSchema).default([]);

// Aura type validation
export const auraTypeSchema = z.enum([
  "keine",
  "visuell",
  "sensorisch",
  "sprachlich",
  "gemischt"
], {
  errorMap: () => ({ message: "Ungültiger Aura-Typ" })
}).optional().default("keine");

// Coordinates validation
export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).optional();

// Complete entry schema
export const entryFormSchema = z.object({
  pain_level: painLevelSchema,
  selected_date: dateSchema,
  selected_time: timeSchema,
  pain_locations: locationsArraySchema,
  aura_type: auraTypeSchema,
  medications: medicationsArraySchema,
  notes: notesSchema,
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  weather_id: z.number().int().nullable().optional(),
});

export type EntryFormData = z.infer<typeof entryFormSchema>;
