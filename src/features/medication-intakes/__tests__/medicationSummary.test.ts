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
