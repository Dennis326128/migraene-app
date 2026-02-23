/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SSOT Zählregeln / Counting Definitions
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * EINZIGE Stelle, an der Zählregeln definiert werden.
 * Wenn sich eine Regel ändert, NUR hier ändern.
 * 
 * Reine Funktionen. Keine Seiteneffekte. Kein I/O.
 */

import type { MeCfsSeverity, MohRiskFlag } from './types';

// ─── Severity Ordinal (for MAX computation) ──────────────────────────────

const MECFS_ORDINAL: Record<MeCfsSeverity, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  severe: 3,
};

const ORDINAL_TO_MECFS: MeCfsSeverity[] = ['none', 'mild', 'moderate', 'severe'];

// ─── Public Definitions ──────────────────────────────────────────────────

/**
 * Ein Tag gilt als "dokumentiert" wenn mindestens ein Eintrag existiert.
 * Auch ein Eintrag mit "keine Schmerzen" zählt als dokumentiert.
 */
export function isDocumentedDay(day: {
  hasAnyEntry: boolean;
  allSymptomsSetToNone?: boolean;
}): boolean {
  return day.hasAnyEntry;
}

/**
 * Ein Tag ist ein "Kopfschmerztag" wenn painMax > 0.
 */
export function isHeadacheDay(painMax: number | null): boolean {
  return painMax !== null && painMax > 0;
}

/**
 * Ein Tag ist ein "Behandlungstag" wenn Akutmedikation eingenommen wurde.
 */
export function isTreatmentDay(acuteMedUsed: boolean): boolean {
  return acuteMedUsed === true;
}

/**
 * Berechnet das Maximum der ME/CFS Schweregrade eines Tages.
 * none < mild < moderate < severe
 * Gibt null zurück wenn keine validen Levels vorhanden.
 */
export function computeMeCfsMax(
  levels: Array<MeCfsSeverity | null | undefined>
): MeCfsSeverity | null {
  let maxOrdinal = -1;

  for (const level of levels) {
    if (level == null) continue;
    const ord = MECFS_ORDINAL[level];
    if (ord !== undefined && ord > maxOrdinal) {
      maxOrdinal = ord;
    }
  }

  return maxOrdinal >= 0 ? ORDINAL_TO_MECFS[maxOrdinal] : null;
}

/**
 * Konservative MOH-Risiko-Heuristik (Medication Overuse Headache).
 * Basiert auf absoluten Tagen, NICHT normiert.
 * 
 * Schwellenwerte (konservativ):
 * - likely:   Triptan ≥10 Tage ODER Akutmed ≥15 Tage
 * - possible: Triptan ≥8 Tage ODER Akutmed ≥12 Tage
 * - none:     sonst
 * 
 * WICHTIG: rangeDays wird aktuell nicht verwendet, ist aber als
 * Parameter für zukünftige Normierung reserviert.
 */
export function computeMohRiskFlag(
  kpis: {
    triptanDays: number;
    acuteMedDays: number;
    headacheDays: number;
  },
  _rangeDays: number
): MohRiskFlag {
  if (kpis.triptanDays >= 10 || kpis.acuteMedDays >= 15) {
    return 'likely';
  }
  if (kpis.triptanDays >= 8 || kpis.acuteMedDays >= 12) {
    return 'possible';
  }
  return 'none';
}
