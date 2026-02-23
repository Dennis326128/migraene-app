/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Chart Data Builders
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type {
  ReportCharts,
  DayCountRecord,
  DonutSegment,
  PainTrendPoint,
  TimeOfDayEntry,
  MedicationChartItem,
  MeCfsDonutSegment,
  MeCfsDonutKey,
  ReportEntryInput,
  ReportOptions,
  LegacyPieSegment,
} from './types';

export interface ChartInput {
  countsByDay: DayCountRecord[];
  totalDaysInRange: number;
  documentedDays: number;
  undocumentedDays: number;
  headacheDays: number;
  entries: ReportEntryInput[];
  options: ReportOptions;
}

export function buildCharts(input: ChartInput): ReportCharts {
  const { countsByDay, totalDaysInRange, documentedDays, undocumentedDays, headacheDays, entries, options } = input;

  // ─── Headache Days Donut ─────────────────────────────────────────────
  const headacheDaysDonut: { segments: DonutSegment[] } = {
    segments: [
      { key: 'headache', days: headacheDays },
      { key: 'no_headache', days: documentedDays - headacheDays },
      { key: 'undocumented', days: undocumentedDays },
    ],
  };

  // ─── Pain Intensity Trend ────────────────────────────────────────────
  const sortedDays = [...countsByDay].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const painIntensityTrend: { points: PainTrendPoint[] } = {
    points: sortedDays.map(d => ({
      dateISO: d.dateISO,
      value: d.painMax,
    })),
  };

  // ─── Time of Day (placeholder — input lacks time info) ───────────────
  // TODO: Add timeOfDay to ReportEntryInput when upstream provides it
  const timeOfDayDistribution: { buckets: TimeOfDayEntry[] } = {
    buckets: [
      { bucket: 'night', headacheDays: 0 },
      { bucket: 'morning', headacheDays: 0 },
      { bucket: 'afternoon', headacheDays: 0 },
      { bucket: 'evening', headacheDays: 0 },
    ],
  };

  // ─── Medications ─────────────────────────────────────────────────────
  const medMap = new Map<string, { name: string; days: Set<string>; effects: number[] }>();
  if (options.includeMedications) {
    for (const entry of entries) {
      if (!entry.medications) continue;
      for (const med of entry.medications) {
        let stat = medMap.get(med.medicationId);
        if (!stat) {
          stat = { name: med.name, days: new Set(), effects: [] };
          medMap.set(med.medicationId, stat);
        }
        stat.days.add(entry.dateISO);
        if (med.effect != null) {
          stat.effects.push(med.effect);
        }
      }
    }
  }

  const medications: { items: MedicationChartItem[] } = {
    items: Array.from(medMap.entries())
      .map(([medicationId, data]) => ({
        medicationId,
        name: data.name,
        daysUsed: data.days.size,
        avgEffect: data.effects.length > 0
          ? Math.round((data.effects.reduce((a, b) => a + b, 0) / data.effects.length) * 10) / 10
          : null,
      }))
      .sort((a, b) => b.daysUsed - a.daysUsed),
  };

  // ─── ME/CFS Donut ───────────────────────────────────────────────────
  let meCfs: { donut: MeCfsDonutSegment[] } | undefined;
  if (options.includeMeCfs) {
    const counts: Record<MeCfsDonutKey, number> = {
      none: 0,
      mild: 0,
      moderate: 0,
      severe: 0,
      undocumented: 0,
    };

    for (const day of countsByDay) {
      if (!day.documented) {
        counts.undocumented++;
      } else {
        const level = day.meCfsMax ?? 'undocumented';
        const key: MeCfsDonutKey = (level === 'none' || level === 'mild' || level === 'moderate' || level === 'severe')
          ? level
          : 'undocumented';
        counts[key]++;
      }
    }

    meCfs = {
      donut: [
        { key: 'none', days: counts.none },
        { key: 'mild', days: counts.mild },
        { key: 'moderate', days: counts.moderate },
        { key: 'severe', days: counts.severe },
        { key: 'undocumented', days: counts.undocumented },
      ],
    };
  }

  // ─── Legacy 3-Bucket Pie (painFree / painNoTriptan / triptan) ─────
  // Matches dayBuckets.ts logic:
  //   triptan = day has triptanUsed (highest priority)
  //   painNoTriptan = day has headache but no triptan
  //   painFree = everything else (including undocumented)
  let legacyTriptan = 0;
  let legacyPainNoTriptan = 0;

  for (const day of countsByDay) {
    if (day.triptanUsed) {
      legacyTriptan++;
    } else if (day.headache) {
      legacyPainNoTriptan++;
    }
  }

  // painFree = totalDaysInRange - (triptan + painNoTriptan)
  // This includes undocumented days as "painFree" (matches existing UI behavior)
  const legacyPainFree = totalDaysInRange - legacyTriptan - legacyPainNoTriptan;

  const legacyHeadacheDaysPie: { segments: LegacyPieSegment[] } = {
    segments: [
      { key: 'painFree', days: legacyPainFree },
      { key: 'painNoTriptan', days: legacyPainNoTriptan },
      { key: 'triptan', days: legacyTriptan },
    ],
  };

  return {
    headacheDaysDonut,
    painIntensityTrend,
    timeOfDayDistribution,
    medications,
    ...(meCfs ? { meCfs } : {}),
    legacyHeadacheDaysPie,
  };
}
