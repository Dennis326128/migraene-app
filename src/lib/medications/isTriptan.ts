/**
 * Single Source of Truth für Triptan-Erkennung
 * 
 * ALLE Stellen im Code müssen diese Funktion importieren.
 * Keine Duplikate in report.ts, reportStructure.ts, reportModel.ts etc.
 */

export {
  isTriptan,
  isTriptanMedication,
  TRIPTAN_WIRKSTOFFE,
  TRIPTAN_HANDELSNAMEN,
  ALL_TRIPTAN_KEYWORDS,
} from './classifyMedication';

/**
 * Prüft ob ein Medikament ein Triptan ist.
 * 
 * Robuste Normalisierung (case-insensitive, Umlaute, Sonderzeichen),
 * aber kein Fuzzy-Matching – nur exakte Substring-Prüfung.
 */
export { isGepant, classifyMedication, normalizeMedicationName, GEPANT_KEYWORDS } from './classifyMedication';
