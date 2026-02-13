/**
 * Single Source of Truth für Triptan-Erkennung
 * 
 * ALLE Stellen im Code müssen diese Funktion importieren.
 * Keine Duplikate in report.ts, reportStructure.ts, reportModel.ts etc.
 */

const TRIPTAN_WIRKSTOFFE = [
  'sumatriptan',
  'rizatriptan',
  'zolmitriptan',
  'naratriptan',
  'almotriptan',
  'eletriptan',
  'frovatriptan',
] as const;

const TRIPTAN_HANDELSNAMEN = [
  'imigran',
  'maxalt',
  'ascotop',
  'naramig',
  'almogran',
  'relpax',
  'allegro',
  'dolotriptan',
  'formigran',
] as const;

const ALL_TRIPTAN_KEYWORDS = [
  ...TRIPTAN_WIRKSTOFFE,
  ...TRIPTAN_HANDELSNAMEN,
] as const;

/**
 * Normalisiert einen Medikamentennamen für robustes Matching.
 * - lowercase + trim
 * - deutsche Umlaute ersetzen
 * - Sonderzeichen entfernen (nur a-z0-9 bleibt)
 */
function normalizeMedName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Prüft ob ein Medikament ein Triptan ist.
 * 
 * Robuste Normalisierung (case-insensitive, Umlaute, Sonderzeichen),
 * aber kein Fuzzy-Matching – nur exakte Substring-Prüfung.
 */
export function isTriptan(medName: string | null | undefined): boolean {
  if (!medName) return false;
  const n = normalizeMedName(medName);
  if (!n) return false;
  
  // Schneller Check: enthält "triptan" im normalisierten Namen
  if (n.includes('triptan')) return true;
  
  // Zusätzlich: bekannte Handelsnamen prüfen
  return ALL_TRIPTAN_KEYWORDS.some(t => n.includes(t));
}

/** Re-export für Abwärtskompatibilität */
export const isTriptanMedication = isTriptan;

export { TRIPTAN_WIRKSTOFFE, TRIPTAN_HANDELSNAMEN, ALL_TRIPTAN_KEYWORDS };
