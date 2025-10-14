import { z } from "zod";

// Migräne-spezifische Enums und Schemas
export const MigraineLevelEnum = z.union([
  z.enum(["-", "leicht", "mittel", "stark", "sehr_stark"]), // Legacy support
  z.number().min(0).max(10) // New numeric scale
]);
export const AuraTypeEnum = z.enum(["keine", "visuell", "sensorisch", "sprachlich", "gemischt"]);
export const PainLocationEnum = z.enum(["einseitig_links", "einseitig_rechts", "beidseitig", "stirn", "nacken", "schlaefe"]);

export const EntryPayloadSchema = z.object({
  selected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum (YYYY-MM-DD)"),
  selected_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Ungültige Uhrzeit (HH:MM oder HH:MM:SS)").transform(val => val.substring(0, 5)),
  pain_level: z.union([
    z.number().min(0).max(10),
    MigraineLevelEnum.refine(v => v !== "-", { message: "Bitte Migräne-Intensität auswählen" })
  ]),
  aura_type: AuraTypeEnum.optional().default("keine"),
  pain_location: PainLocationEnum.optional(),
  medications: z.array(z.string().min(1)).max(20).default([]),
  notes: z.string().max(2000).nullable().optional(),
  weather_id: z.number().int().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

export type EntryPayload = z.infer<typeof EntryPayloadSchema>;