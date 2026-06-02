/**
 * Release-Polish — Vergleichsfenster in Trendtexten immer explizit nennen.
 * Deckt 10-vs-10, 30-vs-30 und Hälftenvergleich für Schmerzlast, Triptan,
 * Akutmedikation und ME/CFS ab. Generisch — keine hardcodierten Namen.
 */
import { describe, it, expect } from "vitest";
import {
  buildTrendDaysFromEntries,
  computeTrendAnalysis,
  windowPhrases,
  type TrendDayRecord,
} from "../trendAnalysis";
import { aggregateMedicationUsage, formatMedicationUsageLine } from "../medicationUsageOverview";

function isoDay(base: Date, offset: number): string {
  const d = new Date(base.getTime() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function makeDays(count: number, fill: (i: number) => Partial<TrendDayRecord>): TrendDayRecord[] {
  const base = new Date("2026-04-01T00:00:00Z");
  return Array.from({ length: count }, (_, i) => ({
    date: isoDay(base, i),
    documented: true,
    painMax: 0,
    acuteMedTaken: false,
    triptanTaken: false,
    otherAcuteTaken: false,
    mecfsSignal: false,
    mecfsSevere: false,
    ...fill(i),
  }));
}

describe("trend window labels — explicit comparison window in every sentence", () => {
  it("10-vs-10 short-term note names 'in den letzten 10 Tagen' und 'in den 10 Tagen davor'", () => {
    // 20 days, first 10 days lots of triptans, last 10 days few triptans, pain stays high
    const days = makeDays(20, (i) => ({
      painMax: 7,
      acuteMedTaken: i < 10,
      triptanTaken: i < 10,
    }));
    const trend = computeTrendAnalysis(days);
    expect(trend?.shortTerm?.note).toBeTruthy();
    expect(trend!.shortTerm!.note!).toMatch(/in den letzten 10 Tagen/);
    expect(trend!.shortTerm!.note!).toMatch(/in den 10 Tagen davor/);
    expect(trend!.shortTerm!.note!).toMatch(/\d+ vs\. \d+ Tage/);
  });

  it("Hälftenvergleich (≤35 Tage) nennt 'in der zweiten Hälfte des Zeitraums' / 'in der ersten Hälfte'", () => {
    // 28-day range — windowing falls into the halves branch
    const days = makeDays(28, (i) => ({
      painMax: i < 14 ? 8 : 3, // pain decreases
      triptanTaken: i < 14,
      acuteMedTaken: i < 14,
    }));
    const trend = computeTrendAnalysis(days);
    expect(trend).toBeTruthy();
    expect(trend!.recent.label).toBe("zweite Hälfte des Zeitraums");
    expect(trend!.previous.label).toBe("erste Hälfte des Zeitraums");
    const text = trend!.plainLanguage.join(" ");
    expect(text).toMatch(/in der zweiten Hälfte des Zeitraums/);
    expect(text).toMatch(/in der ersten Hälfte/);
    expect(text).toMatch(/Schmerztage/);
  });

  it("30-vs-30 nennt 'in den letzten 30 Tagen' und 'in den 30 Tagen davor'", () => {
    const days = makeDays(60, (i) => ({
      painMax: 5,
      triptanTaken: i % 4 === 0,
      acuteMedTaken: i % 4 === 0,
    }));
    const trend = computeTrendAnalysis(days);
    expect(trend!.recent.label).toBe("letzte 30 Tage");
    const text = trend!.plainLanguage.join(" ");
    expect(text).toMatch(/in den letzten 30 Tagen/);
    expect(text).toMatch(/in den 30 Tagen davor/);
  });

  it("windowPhrases liefert für jeden Standard-Label-Typ einen verständlichen Dativ-Satz", () => {
    const cases = [
      { recent: "letzte 10 Tage", previous: "vorherige 10 Tage", out: "in den letzten 10 Tagen" },
      { recent: "letzte 30 Tage", previous: "vorige 30 Tage", out: "in den letzten 30 Tagen" },
      { recent: "letzter Monat", previous: "vorheriger Monat", out: "im letzten Monat" },
      { recent: "zweite Hälfte des Zeitraums", previous: "erste Hälfte des Zeitraums", out: "in der zweiten Hälfte des Zeitraums" },
    ];
    for (const c of cases) {
      const r = { label: c.recent } as any;
      const p = { label: c.previous } as any;
      expect(windowPhrases(r, p).recent).toBe(c.out);
    }
  });

  it("Custom-Label fällt generisch auf 'in <label>' zurück (keine harte Annahme)", () => {
    const r = { label: "letzte 14 Tage" } as any;
    const p = { label: "vorherige 14 Tage" } as any;
    expect(windowPhrases(r, p).recent).toBe("in letzte 14 Tage");
    expect(windowPhrases(r, p).previous).toBe("in vorherige 14 Tage");
  });

  it("kein Trendtext mehr ohne Fensternennung bei Vergleichszahlen", () => {
    const days = makeDays(30, (i) => ({
      painMax: i < 15 ? 7 : 5,
      triptanTaken: i < 15,
      acuteMedTaken: i < 15,
    }));
    const trend = computeTrendAnalysis(days)!;
    for (const sentence of trend.plainLanguage) {
      if (/\b\d+ vs\. \d+/.test(sentence)) {
        expect(sentence).toMatch(/in (?:den|der|im) /);
      }
    }
  });
});

describe("medication usage overview — generic, semantic notes, sensitive substances", () => {
  it("works without any hardcoded medication name (custom name)", () => {
    const items = aggregateMedicationUsage(
      [
        { medication_name: "Wirkstoff-X 50mg" },
        { medication_name: "Wirkstoff-X 50mg" },
        { medication_name: "Eigenes Mittel" },
      ],
      [{ med_name: "Wirkstoff-X 50mg", effect_score: 7, effect_rating: null, notes: null }],
    );
    expect(items[0].name).toBe("Wirkstoff-X 50mg");
    expect(items[0].intakeCount).toBe(2);
    const line = formatMedicationUsageLine(items[0]);
    expect(line).toMatch(/Wirkstoff-X 50mg: 2 Einnahmen/);
    expect(line).toMatch(/subjektiv/);
  });

  it("does NOT print raw notes with pipes or half sentences", () => {
    const items = aggregateMedicationUsage(
      [{ medication_name: "Sumatriptan" }, { medication_name: "Sumatriptan" }],
      [
        { med_name: "Sumatriptan", effect_score: 7, effect_rating: null,
          notes: "Körper wollte Erholung, ging aber nicht. Mit Regen wurde es besser." },
        { med_name: "Sumatriptan", effect_score: 8, effect_rating: null,
          notes: "Erst spät mit kurzem Schlaf geholfen" },
      ],
    );
    const line = formatMedicationUsageLine(items[0]);
    expect(line).not.toContain("|");
    expect(line).not.toMatch(/Notiz:/);
    expect(line).not.toMatch(/Körper wollte/);
    expect(line).not.toMatch(/Erst spät/);
    // Semantic short hint instead
    expect(line).toMatch(/Einzelne Notizen erwähnen .+ als Kontext\./);
  });

  it("omits the note hint entirely when no meaningful context is detected", () => {
    const items = aggregateMedicationUsage(
      [{ medication_name: "Ibuprofen" }],
      [{ med_name: "Ibuprofen", effect_score: 5, effect_rating: null, notes: "ok" }],
    );
    const line = formatMedicationUsageLine(items[0]);
    expect(line).not.toMatch(/Notiz/);
    expect(line).not.toMatch(/Einzelne Notizen/);
  });

  it("treats any sensitive substance neutrally (not only Diazepam)", () => {
    const names = ["Diazepam 10mg", "Lorazepam 1mg", "Tramadol 50mg", "Tilidin", "Zolpidem"];
    for (const name of names) {
      const items = aggregateMedicationUsage(
        [{ medication_name: name }],
        [{ med_name: name, effect_score: 9, effect_rating: null, notes: null }],
      );
      const line = formatMedicationUsageLine(items[0]);
      expect(line).toMatch(/subjektiv häufig hilfreich bewertet/);
      expect(line).not.toMatch(/wirksam/i);
      expect(line).not.toMatch(/Alternative/i);
    }
  });
});
