import { z } from "zod";

export const PainLevelEnum = z.enum(["-", "leicht", "mittel", "stark", "sehr_stark"]);

export const EntryPayloadSchema = z.object({
  selected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum (YYYY-MM-DD)"),
  selected_time: z.string().regex(/^\d{2}:\d{2}$/, "Ungültige Uhrzeit (HH:MM)"),
  pain_level: PainLevelEnum.refine(v => v !== "-", { message: "Bitte Schmerzstufe auswählen" }),
  medications: z.array(z.string().min(1)).max(20).default([]),
  notes: z.string().max(2000).nullable().optional(),
  weather_id: z.number().int().nullable().optional(),
});

export type EntryPayload = z.infer<typeof EntryPayloadSchema>;