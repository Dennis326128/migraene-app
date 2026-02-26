/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Prophylaxis Text Generator — Truthful text templates for KI/PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TRUTH RULES:
 * 1. Never claim effects if coverage < 0.5 or confidence < 0.6
 * 2. Always show documentation basis
 * 3. Use hedged language for uncertain data
 * 4. Never invent numbers — only computed values
 */

import type {
  ProphylaxisAnalysis,
  DoseComparison,
  DoseEvent,
  EvidenceSource,
} from './types';

// ─── Source labels (German) ─────────────────────────────────────────────

const SOURCE_LABELS: Record<EvidenceSource, string> = {
  diary_medication_entry: 'Tagebuch',
  reminder_completed: 'Erinnerung (erledigt)',
  diary_free_text: 'Freitext-Notiz',
  reminder_scheduled: 'Erinnerung (geplant)',
  inferred_from_pattern: 'Muster',
};

// ─── Confidence labels ──────────────────────────────────────────────────

function confidenceLabel(c: number): string {
  if (c >= 0.9) return 'hoch';
  if (c >= 0.6) return 'mittel';
  return 'niedrig';
}

// ─── Format percentage ─────────────────────────────────────────────────

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ─── Public: Generate KI text block ─────────────────────────────────────

export interface ProphylaxisTextBlock {
  title: string;
  paragraphs: string[];
  warnings: string[];
  injectionSummaries: InjectionSummaryLine[];
}

export interface InjectionSummaryLine {
  dateKey: string;
  sourceLabel: string;
  confidenceLabel: string;
  preSummary: string;
  postSummary: string;
}

/**
 * Generate truthful text blocks for KI analysis.
 * Returns structured data that can be rendered in UI, PDF, or sent to AI.
 */
export function generateProphylaxisTextBlock(
  analysis: ProphylaxisAnalysis,
  drugLabel: string = 'Ajovy',
): ProphylaxisTextBlock {
  const { doseEvents, comparisons, aggregate, evidenceSummary } = analysis;

  const warnings: string[] = [];
  const paragraphs: string[] = [];

  // No data case
  if (evidenceSummary.countDoseEvents === 0) {
    return {
      title: `Prophylaxe (${drugLabel})`,
      paragraphs: [`Keine dokumentierten ${drugLabel}-Injektionen im Zeitraum.`],
      warnings: [],
      injectionSummaries: [],
    };
  }

  // Source distribution text
  const sourceTexts = Object.entries(evidenceSummary.primarySourcesDistribution)
    .filter(([, count]) => count && count > 0)
    .map(([source, count]) => `${SOURCE_LABELS[source as EvidenceSource]} (${count}×)`)
    .join(', ');

  const confRange = evidenceSummary.bestConfidence === evidenceSummary.worstConfidence
    ? confidenceLabel(evidenceSummary.bestConfidence!)
    : `${confidenceLabel(evidenceSummary.worstConfidence!)}–${confidenceLabel(evidenceSummary.bestConfidence!)}`;

  paragraphs.push(
    `${evidenceSummary.countDoseEvents} Injektion${evidenceSummary.countDoseEvents > 1 ? 'en' : ''} erkannt. ` +
    `Quelle: ${sourceTexts}. Confidence: ${confRange}.`
  );

  // Low confidence warning (scheduled-only typically gets 0.5-0.6)
  if (evidenceSummary.worstConfidence !== null && evidenceSummary.worstConfidence <= 0.6) {
    warnings.push(
      `Mindestens ein Injektionstermin wurde aus einer geplanten Erinnerung geschätzt (nicht bestätigt).`
    );
  }

  // Per-injection summaries (max 3 latest)
  const latestComparisons = comparisons.slice(-3);
  const injectionSummaries: InjectionSummaryLine[] = latestComparisons.map(c => ({
    dateKey: c.doseEvent.dateKeyBerlin,
    sourceLabel: SOURCE_LABELS[c.doseEvent.primarySource],
    confidenceLabel: confidenceLabel(c.doseEvent.confidence),
    preSummary: formatWindowSummary(c, 'pre'),
    postSummary: formatWindowSummary(c, 'post'),
  }));

  // Aggregate assessment (only if sufficient data)
  if (aggregate && comparisons.length > 0) {
    const avgCoveragePre = avg(comparisons.map(c => c.pre.coverage));
    const avgCoveragePost = avg(comparisons.map(c => c.post.coverage));
    const minCoverage = Math.min(avgCoveragePre, avgCoveragePost);

    if (minCoverage < 0.5) {
      warnings.push(`Aussagekraft eingeschränkt: Dokumentation im Vor-/Nachzeitraum unter 50%.`);
    }

    if (aggregate.avgDeltaHeadacheRate !== null) {
      const delta = aggregate.avgDeltaHeadacheRate;
      const isImprovement = delta < -0.05;
      const isWorsening = delta > 0.05;

      if (minCoverage >= 0.5 && evidenceSummary.bestConfidence !== null && evidenceSummary.bestConfidence >= 0.6) {
        if (isImprovement) {
          paragraphs.push(
            `Hinweis auf Besserung nach ${drugLabel}: ` +
            `Die Kopfschmerzrate sank im Mittel um ${pct(Math.abs(delta))} ` +
            `(auf Basis von ${comparisons.length} Injektion${comparisons.length > 1 ? 'en' : ''}).`
          );
        } else if (isWorsening) {
          paragraphs.push(
            `Tendenziell mehr Kopfschmerz nach ${drugLabel}: ` +
            `Die Kopfschmerzrate stieg im Mittel um ${pct(Math.abs(delta))}.`
          );
        } else {
          paragraphs.push(
            `Keine deutliche Veränderung der Kopfschmerzrate nach ${drugLabel} erkennbar.`
          );
        }
      } else {
        // Low coverage or confidence — very hedged
        if (isImprovement) {
          paragraphs.push(
            `Möglicher Hinweis auf Besserung nach ${drugLabel}, ` +
            `jedoch eingeschränkte Aussagekraft (Dokumentation: ${pct(minCoverage)}).`
          );
        }
      }
    }
  }

  return {
    title: `Prophylaxe (${drugLabel})`,
    paragraphs,
    warnings,
    injectionSummaries,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatWindowSummary(c: DoseComparison, window: 'pre' | 'post'): string {
  const w = c[window];
  const headachePart = `${w.headacheDays}/${w.documentedDays} dok. Tage mit Kopfschmerz (${pct(w.headacheRate)})`;
  const intensityPart = w.intensityMedian !== null
    ? `, Median ${w.intensityMedian}`
    : '';
  const coveragePart = `Dokumentiert: ${w.documentedDays}/${w.windowDays}`;

  return `${headachePart}${intensityPart}. ${coveragePart}`;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ─── PDF-specific: format for pdf-lib rendering ─────────────────────────

export interface ProphylaxisPdfData {
  sectionTitle: string;
  injectionRows: Array<{
    date: string;
    source: string;
    confidence: string;
  }>;
  prePostRows: Array<{
    label: string;
    pre: string;
    post: string;
  }>;
  notes: string[];
}

/**
 * Build structured data for PDF rendering.
 */
export function buildProphylaxisPdfData(
  analysis: ProphylaxisAnalysis,
  drugLabel: string = 'Ajovy',
): ProphylaxisPdfData | null {
  if (analysis.evidenceSummary.countDoseEvents === 0) return null;

  const injectionRows = analysis.doseEvents.map(de => ({
    date: formatDateGerman(de.dateKeyBerlin),
    source: SOURCE_LABELS[de.primarySource],
    confidence: confidenceLabel(de.confidence),
  }));

  // Aggregate pre/post if comparisons exist
  const prePostRows: ProphylaxisPdfData['prePostRows'] = [];
  if (analysis.comparisons.length > 0) {
    const avgPre = avgWindowStats(analysis.comparisons.map(c => c.pre));
    const avgPost = avgWindowStats(analysis.comparisons.map(c => c.post));

    prePostRows.push(
      {
        label: 'Kopfschmerztage',
        pre: `${avgPre.headacheDays.toFixed(1)} (${pct(avgPre.headacheRate)})`,
        post: `${avgPost.headacheDays.toFixed(1)} (${pct(avgPost.headacheRate)})`,
      },
      {
        label: 'Intensität (Median)',
        pre: avgPre.intensityMedian !== null ? avgPre.intensityMedian.toFixed(1) : '–',
        post: avgPost.intensityMedian !== null ? avgPost.intensityMedian.toFixed(1) : '–',
      },
      {
        label: 'Akutmedikation',
        pre: `${avgPre.acuteMedDays.toFixed(1)} Tage (${pct(avgPre.acuteMedRate)})`,
        post: `${avgPost.acuteMedDays.toFixed(1)} Tage (${pct(avgPost.acuteMedRate)})`,
      },
      {
        label: 'Dokumentiert',
        pre: `${avgPre.documentedDays.toFixed(0)}/${avgPre.windowDays.toFixed(0)} Tage`,
        post: `${avgPost.documentedDays.toFixed(0)}/${avgPost.windowDays.toFixed(0)} Tage`,
      },
    );
  }

  const notes: string[] = [];
  if (analysis.evidenceSummary.worstConfidence !== null && analysis.evidenceSummary.worstConfidence <= 0.6) {
    notes.push('Termin aus Erinnerung geschätzt (nicht bestätigt).');
  }
  const avgCov = analysis.comparisons.length > 0
    ? Math.min(
        avg(analysis.comparisons.map(c => c.pre.coverage)),
        avg(analysis.comparisons.map(c => c.post.coverage)),
      )
    : 0;
  if (avgCov < 0.5 && analysis.comparisons.length > 0) {
    notes.push('Aussagekraft eingeschränkt: Dokumentation unter 50%.');
  }

  return {
    sectionTitle: `PROPHYLAXE (${drugLabel.toUpperCase()})`,
    injectionRows,
    prePostRows,
    notes,
  };
}

function formatDateGerman(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  return `${d}.${m}.${y}`;
}

function avgWindowStats(windows: Array<{ headacheDays: number; headacheRate: number; intensityMedian: number | null; acuteMedDays: number; acuteMedRate: number; documentedDays: number; windowDays: number }>) {
  const n = windows.length;
  if (n === 0) return { headacheDays: 0, headacheRate: 0, intensityMedian: null as number | null, acuteMedDays: 0, acuteMedRate: 0, documentedDays: 0, windowDays: 0 };
  const medians = windows.map(w => w.intensityMedian).filter((v): v is number => v !== null);
  return {
    headacheDays: avg(windows.map(w => w.headacheDays)),
    headacheRate: avg(windows.map(w => w.headacheRate)),
    intensityMedian: medians.length > 0 ? avg(medians) : null,
    acuteMedDays: avg(windows.map(w => w.acuteMedDays)),
    acuteMedRate: avg(windows.map(w => w.acuteMedRate)),
    documentedDays: avg(windows.map(w => w.documentedDays)),
    windowDays: avg(windows.map(w => w.windowDays)),
  };
}
