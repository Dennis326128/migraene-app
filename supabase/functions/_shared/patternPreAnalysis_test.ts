import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDeterministicFindings, mergeExpandedFindingsIntoReport, type PreAnalysis } from "./patternPreAnalysis.ts";

function makePre(overrides: Partial<PreAnalysis> = {}): PreAnalysis {
  return {
    weather: { daysWithData: 30, pressureDropDays: 6, pressureRiseDays: 4, painOnDropDays: 3,
      painOnRiseDays: 1, painOnStableDays: 4, stableDays: 20, pressureMin: 990, pressureMax: 1025,
      tempMin: 5, tempMax: 22, note: "" },
    time: { topWeekday: "Montag", topWeekdayShare: 0.35, topPhase: "Morgen", topPhaseShare: 0.5,
      weekdayCount: 14, weekendCount: 4, withTime: 18, note: "" },
    mecfs: { daysWithMecfs: 0, contextNoteCount: 2, note: "" },
    medication: { intakeCount: 8, highPainEntries: 5, highPainWithMed: 3, highPainWithoutMed: 2, note: "" },
    dataQuality: { painEntries: 18, voiceEvents: 4, weatherDays: 30, rangeDays: 30, note: "" },
    ...overrides,
  };
}
const META = { totalDays: 30, voiceEventCount: 4, painEntryCount: 18, medicationIntakeCount: 8, daysWithPain: 12, daysWithMecfs: 0 };

Deno.test("findings: produces V2.1/2.2.0 envelope with required findings + section_map", () => {
  const r = buildDeterministicFindings({ pre: makePre(), meta: META, fromISO: "2026-04-01T00:00:00Z", toISO: "2026-04-30T23:59:59Z", privateNotesExcluded: true });
  assertEquals(r.schema_version, "2.1");
  assertEquals(r.analysis_version, "2.2.0");
  const ids = r.findings.map((f) => f.id);
  for (const id of ["data_quality.weather_coverage", "data_quality.diary_coverage", "burden.pain_days_share", "medication.acute_intakes", "weather.pressure_drop", "mecfs.energy_coverage", "time_pattern.weekday_phase"]) {
    assert(ids.includes(id), `missing ${id}`);
  }
  assert(r.section_map.data_quality.length >= 2);
  assertEquals(r.data_basis.private_notes_excluded, true);
});

Deno.test("findings: V2.2 ME/CFS rule — signal present → not 'insufficient'", () => {
  const r = buildDeterministicFindings({ pre: makePre({ mecfs: { daysWithMecfs: 8, contextNoteCount: 5, note: "" } }), meta: { ...META, daysWithMecfs: 8 }, fromISO: "a", toISO: "b", privateNotesExcluded: true });
  const m = r.findings.find((f) => f.id === "mecfs.energy_coverage")!;
  assertEquals(m.evidence_level, "low");
  assert(m.plain_language_summary.includes("Signal"));
});

Deno.test("findings: V2.2 weather rule — no pain-free comparison days → insufficient", () => {
  const r = buildDeterministicFindings({ pre: makePre({ weather: { ...makePre().weather, stableDays: 10, painOnStableDays: 10 } }), meta: META, fromISO: "a", toISO: "b", privateNotesExcluded: true });
  const w = r.findings.find((f) => f.id === "weather.pressure_drop")!;
  assertEquals(w.evidence_level, "insufficient");
  assert(w.limitations.some((l) => l.includes("Vergleichstage")));
});

Deno.test("findings: V2.2 diary coverage uses pain entries only (no voice-event data-quality)", () => {
  const r = buildDeterministicFindings({ pre: makePre(), meta: META, fromISO: "a", toISO: "b", privateNotesExcluded: true });
  const d = r.findings.find((f) => f.id === "data_quality.diary_coverage")!;
  assert(!d.plain_language_summary.toLowerCase().includes("voice"));
});

Deno.test("merge: red_flag findings stripped for doctor-share, sections updated", () => {
  const r = buildDeterministicFindings({ pre: makePre(), meta: META, fromISO: "a", toISO: "b", privateNotesExcluded: true });
  mergeExpandedFindingsIntoReport(r, [
    { id: "llm.weather.1", category: "weather", evidence_level: "low" },
    { id: "llm.rf.1", category: "red_flag", evidence_level: "moderate" },
  ], { excludeRedFlags: true });
  assert(r.section_map.weather_environment.includes("llm.weather.1"));
  assert(!r.section_map.red_flags.includes("llm.rf.1"));
  assertEquals((r as any).llm_expanded_findings.length, 1);
});
