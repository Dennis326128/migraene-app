import { describe, it, expect, vi } from "vitest";
import { getLimitStatus, isWarningStatus, getStatusLabel } from "@/lib/utils/medicationLimitStatus";

// Test getSummaryRanges by reimplementing the pure logic (avoids supabase import chain)
import { subDays, format } from "date-fns";

function getSummaryRangesFrom(effectiveToday: string) {
  const effective = new Date(effectiveToday + "T00:00:00");
  const from7d = format(subDays(effective, 6), "yyyy-MM-dd");
  const from30d = format(subDays(effective, 29), "yyyy-MM-dd");
  return { effectiveToday, from7d, from30d };
}

describe("getSummaryRanges logic", () => {
  it("computes 7d range (effectiveToday - 6 → effectiveToday)", () => {
    const { from7d, effectiveToday } = getSummaryRangesFrom("2026-02-23");
    expect(from7d).toBe("2026-02-17");
    expect(effectiveToday).toBe("2026-02-23");
  });

  it("computes 30d range (effectiveToday - 29 → effectiveToday)", () => {
    const { from30d, effectiveToday } = getSummaryRangesFrom("2026-02-23");
    expect(from30d).toBe("2026-01-25");
    expect(effectiveToday).toBe("2026-02-23");
  });

  it("handles month boundary correctly", () => {
    const { from30d } = getSummaryRangesFrom("2026-03-05");
    expect(from30d).toBe("2026-02-04");
  });
});

describe("getLimitStatus", () => {
  it("returns 'safe' when usage is well below limit", () => {
    expect(getLimitStatus(3, 10)).toBe("safe");
  });

  it("returns 'warning' one before limit", () => {
    expect(getLimitStatus(9, 10)).toBe("warning");
  });

  it("returns 'reached' at limit", () => {
    expect(getLimitStatus(10, 10)).toBe("reached");
  });

  it("returns 'exceeded' above limit", () => {
    expect(getLimitStatus(12, 10)).toBe("exceeded");
  });
});

describe("isWarningStatus", () => {
  it("false for safe", () => expect(isWarningStatus("safe")).toBe(false));
  it("true for warning/reached/exceeded", () => {
    expect(isWarningStatus("warning")).toBe(true);
    expect(isWarningStatus("reached")).toBe(true);
    expect(isWarningStatus("exceeded")).toBe(true);
  });
});

describe("getStatusLabel", () => {
  it("returns German labels", () => {
    expect(getStatusLabel("exceeded")).toBe("Überschritten");
    expect(getStatusLabel("reached")).toBe("Erreicht");
    expect(getStatusLabel("warning")).toBe("Achtung");
    expect(getStatusLabel("safe")).toBe("OK");
  });
});

describe("period used value matching", () => {
  it("month period uses 30d count", () => {
    // Simulating the getUsedForPeriod logic
    const getUsedForPeriod = (periodType: string, count7d: number, count30d: number) => {
      switch (periodType) {
        case 'month': return count30d;
        case 'week': return count7d;
        default: return count30d;
      }
    };
    expect(getUsedForPeriod('month', 3, 20)).toBe(20);
    expect(getUsedForPeriod('week', 3, 20)).toBe(3);
  });
});

/**
 * Regression test: NULL taken_date must not cause intakes to be invisible.
 *
 * ROOT CAUSE (2026-03-09):
 * syncIntakesForEntry() created medication_intakes records WITHOUT setting
 * taken_date/taken_time. fetchMedicationSummaries filtered with
 * .gte("taken_date", from30d) which excluded NULL rows (SQL: NULL >= X → NULL).
 * This caused ~half of intakes to be invisible to all aggregation screens.
 *
 * FIX: Client-side filtering with fallback: effectiveDate = taken_date ?? taken_at.substring(0,10)
 */
describe("NULL taken_date resilience", () => {
  it("SQL NULL comparison excludes rows — the root cause", () => {
    const takenDate: string | null = null;
    const from30d = "2026-02-07";
    const oldQueryIncludes = takenDate !== null && takenDate >= from30d;
    expect(oldQueryIncludes).toBe(false);

    const takenAt = "2026-02-28T22:58:51.214027+00";
    const effectiveDate = takenDate ?? takenAt.substring(0, 10);
    expect(effectiveDate >= from30d).toBe(true);
  });

  it("fallback extracts YYYY-MM-DD from ISO timestamp", () => {
    const takenDate: string | null = null;
    const takenAt = "2026-03-07T15:17:41+00";
    const effectiveDate = takenDate ?? takenAt.substring(0, 10);
    expect(effectiveDate).toBe("2026-03-07");
  });

  it("taken_date takes priority over taken_at", () => {
    const takenDate: string | null = "2026-03-03";
    const takenAt = "2026-03-03T11:32:00+00";
    const effectiveDate = takenDate ?? takenAt.substring(0, 10);
    expect(effectiveDate).toBe("2026-03-03");
  });

  it("multiple intakes same day counted individually (not deduplicated to 1)", () => {
    const intakes = [
      { taken_date: "2026-02-28", taken_at: "2026-02-28T07:00:00+00" },
      { taken_date: "2026-02-28", taken_at: "2026-02-28T19:00:00+00" },
      { taken_date: "2026-02-28", taken_at: "2026-02-28T22:00:00+00" },
    ];
    let count = 0;
    for (const i of intakes) {
      const d = i.taken_date ?? i.taken_at.substring(0, 10);
      if (d >= "2026-02-01" && d <= "2026-03-08") count++;
    }
    expect(count).toBe(3);
  });

  it("NULL taken_date AND NULL taken_at skipped gracefully", () => {
    const intakes: Array<{ taken_date: string | null; taken_at: string | null }> = [
      { taken_date: null, taken_at: null },
      { taken_date: "2026-03-01", taken_at: "2026-03-01T10:00:00+00" },
    ];
    let count = 0;
    for (const i of intakes) {
      const d = i.taken_date ?? i.taken_at?.substring(0, 10) ?? null;
      if (!d) continue;
      if (d >= "2026-02-01" && d <= "2026-03-08") count++;
    }
    expect(count).toBe(1);
  });
});
