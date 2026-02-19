import { z } from "zod";

// Migräne-spezifische Enums und Schemas
export const MigraineLevelEnum = z.union([
  z.enum(["-", "leicht", "mittel", "stark", "sehr_stark"]), // Legacy support
  z.number().min(0).max(10) // New numeric scale
]);
export const AuraTypeEnum = z.enum(["keine", "visuell", "sensorisch", "sprachlich", "gemischt"]);
export const PainLocationEnum = z.enum(["einseitig_links", "einseitig_rechts", "beidseitig", "stirn", "nacken", "schlaefe", "top_of_head_burning"]);

export const SymptomsSourceEnum = z.enum(['copied_from_previous', 'user_selected', 'unknown']);
export const SymptomsStateEnum = z.enum(['untouched', 'viewed', 'edited']);

export const EntryPayloadSchema = z.object({
  selected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum (YYYY-MM-DD)"),
  selected_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Ungültige Uhrzeit (HH:MM oder HH:MM:SS)").transform(val => val.substring(0, 5)),
  pain_level: z.union([
    z.number().min(0).max(10),
    MigraineLevelEnum.refine(v => v !== "-", { message: "Bitte Migräne-Intensität auswählen" })
  ]),
  aura_type: AuraTypeEnum.optional().default("keine"),
  pain_locations: z.array(PainLocationEnum).default([]),
  medications: z.array(z.string().min(1)).max(20).default([]),
  notes: z.string().max(5000).nullable().optional(),
  entry_note_is_private: z.boolean().optional().default(false),
  weather_id: z.number().int().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  entry_kind: z.enum(['pain', 'lifestyle', 'trigger', 'voice', 'note']).optional(),
  symptoms_source: SymptomsSourceEnum.optional().default('unknown'),
  symptoms_state: SymptomsStateEnum.optional().default('untouched'),
  me_cfs_severity_score: z.number().int().min(0).max(10).optional().default(0),
  me_cfs_severity_level: z.enum(['none', 'mild', 'moderate', 'severe']).optional().default('none'),
});

export type EntryPayload = z.infer<typeof EntryPayloadSchema>;