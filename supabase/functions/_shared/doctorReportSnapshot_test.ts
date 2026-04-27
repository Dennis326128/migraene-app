import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildHeadacheDayDonut } from "./doctorReportSnapshot.ts";

const entry = (id: number, date: string, pain_level = "5", medications: string[] = []) => ({
  id,
  selected_date: date,
  selected_time: null,
  pain_level,
  medications,
  aura_type: "keine",
  pain_locations: [],
  notes: null,
  timestamp_created: `${date}T08:00:00Z`,
});

const intakes = (items: Array<{ entry_id: number; medication_name: string; taken_date?: string | null }>) => {
  const map = new Map<number, Array<{ entry_id: number; medication_name: string; taken_date?: string | null }>>();
  for (const item of items) {
    if (!map.has(item.entry_id)) map.set(item.entry_id, []);
    map.get(item.entry_id)!.push(item);
  }
  return map;
};

Deno.test("doctor donut uses medication_intakes when medications[] is empty: Sumatriptan + Ibuprofen", () => {
  const result = buildHeadacheDayDonut("2026-01-01", "2026-01-01", [entry(1, "2026-01-01", "5", [])], intakes([
    { entry_id: 1, medication_name: "Sumatriptan", taken_date: "2026-01-01" },
    { entry_id: 1, medication_name: "Ibuprofen", taken_date: "2026-01-01" },
  ]));

  assertEquals(result.triptanDays, 1);
  assertEquals(result.gepantDays, 0);
  assertEquals(result.painDaysWithMedication, 1);
  assertEquals(result.painDaysNoMedication, 0);
  assertEquals(result.undocumentedDays, 0);
});

Deno.test("doctor donut counts Vydura + Ibuprofen as gepant day and one treatment headache day", () => {
  const result = buildHeadacheDayDonut("2026-01-01", "2026-01-01", [entry(1, "2026-01-01", "5", [])], intakes([
    { entry_id: 1, medication_name: "Vydura", taken_date: "2026-01-01" },
    { entry_id: 1, medication_name: "Ibuprofen", taken_date: "2026-01-01" },
  ]));

  assertEquals(result.triptanDays, 0);
  assertEquals(result.gepantDays, 1);
  assertEquals(result.painDaysWithMedication, 1);
});

Deno.test("doctor donut counts Sumatriptan + Vydura once as headache with medication", () => {
  const result = buildHeadacheDayDonut("2026-01-01", "2026-01-01", [entry(1, "2026-01-01", "5", [])], intakes([
    { entry_id: 1, medication_name: "Sumatriptan", taken_date: "2026-01-01" },
    { entry_id: 1, medication_name: "Vydura", taken_date: "2026-01-01" },
  ]));

  assertEquals(result.triptanDays, 1);
  assertEquals(result.gepantDays, 1);
  assertEquals(result.painDaysWithMedication, 1);
  assertEquals(result.painFreeDays + result.painDaysNoMedication + result.painDaysWithMedication + result.undocumentedDays, 1);
});

Deno.test("doctor donut separates undocumented days and keeps legacy medications[] fallback", () => {
  const result = buildHeadacheDayDonut("2026-01-01", "2026-01-03", [entry(1, "2026-01-01", "5", ["Naratriptan"])], intakes([]));

  assertEquals(result.totalDays, 3);
  assertEquals(result.documentedDays, 1);
  assertEquals(result.undocumentedDays, 2);
  assertEquals(result.triptanDays, 1);
  assertEquals(result.painDaysWithMedication, 1);
});

Deno.test("doctor classification recognizes Eletrip alias and does not classify Ajovy as gepant", () => {
  const result = buildHeadacheDayDonut("2026-01-01", "2026-01-02", [
    entry(1, "2026-01-01", "5", []),
    entry(2, "2026-01-02", "5", []),
  ], intakes([
    { entry_id: 1, medication_name: "Eletrip Hormosan 80mg", taken_date: "2026-01-01" },
    { entry_id: 2, medication_name: "Fremanezumab (Ajovy)", taken_date: "2026-01-02" },
  ]));

  assertEquals(result.triptanDays, 1);
  assertEquals(result.gepantDays, 0);
  assertEquals(result.painDaysWithMedication, 2);
});