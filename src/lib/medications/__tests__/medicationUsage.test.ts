import { describe, expect, it } from "vitest";
import { countMedicationUsageInRange, normalizeMedicationNameForUsage } from "../medicationUsage";

describe("medication usage counting", () => {
  it("normalizes casing, whitespace and compact/spaced strengths consistently", () => {
    expect(normalizeMedicationNameForUsage(" Diazepam 10mg ")).toBe(
      normalizeMedicationNameForUsage("diazepam 10 mg")
    );
  });

  it("counts medication_intakes with taken_date/taken_at fallback", () => {
    const count = countMedicationUsageInRange("Diazepam 10 mg", "2026-04-01", "2026-04-07", [
      { entry_id: 1, medication_name: "Diazepam 10mg", taken_date: "2026-04-02", taken_at: null },
      { entry_id: 2, medication_name: "diazepam 10 mg", taken_date: null, taken_at: "2026-04-05T08:00:00+00" },
      { entry_id: 3, medication_name: "Diazepam 5 mg", taken_date: "2026-04-05", taken_at: null },
    ]);

    expect(count).toBe(2);
  });

  it("uses legacy pain_entries.medications only when no intake exists for that entry/medication", () => {
    const count = countMedicationUsageInRange(
      "Diazepam 10 mg",
      "2026-04-01",
      "2026-04-07",
      [{ entry_id: 1, medication_name: "Diazepam 10mg", taken_date: "2026-04-02", taken_at: null }],
      [
        { id: 1, selected_date: "2026-04-02", medications: ["Diazepam 10 mg"] },
        { id: 2, selected_date: "2026-04-06", medications: ["Diazepam 10mg"] },
      ]
    );

    expect(count).toBe(2);
  });
});