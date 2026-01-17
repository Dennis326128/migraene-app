/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EINHEITLICHE BERICHTSSTRUKTUR FÜR KOPFSCHMERZTAGEBUCH
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Diese Datei definiert die standardisierte Reihenfolge und Struktur
 * für alle Ausgabeformate (App-Ansicht, PDF, Arzt-Website).
 * 
 * PRINZIPIEN:
 * - Wichtigste Informationen zuerst (ärztliche Entscheidungsfindung)
 * - Einheitliche Struktur für Patient und Arzt
 * - Details immer am Ende
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * OFFIZIELLE SEKTIONSREIHENFOLGE für Kopfschmerztagebuch
 * 
 * Diese Reihenfolge ist verbindlich für:
 * - PDF-Export (buildDiaryPdf)
 * - App-Ansicht (DiaryReport.tsx)
 * - Arzt-Website (zukünftig)
 */
export const REPORT_SECTION_ORDER = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. KOPFBEREICH – KONTEXT & IDENTIFIKATION
  // ═══════════════════════════════════════════════════════════════════════════
  'header',           // Titel, Berichtszeitraum, Erstellungsdatum
  'patient',          // Patientendaten (Name, Geburtsdatum, Krankenkasse, Versicherungsnr.)
  'doctor',           // Behandelnder Arzt (Name, Fachrichtung, Praxisadresse, Kontakt)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ÄRZTLICHE KERNÜBERSICHT (höchste Priorität)
  // ═══════════════════════════════════════════════════════════════════════════
  'core_kpis',        // Die 3 wichtigsten Kennzahlen (groß, klar):
                      // - Ø Schmerztage pro Monat (normiert auf 30 Tage)
                      // - Ø Triptan-EINNAHMEN pro Monat (normiert auf 30 Tage)
                      // - Ø Schmerzintensität (NRS 0–10)
                      // Berechnet aus X dokumentierten Tagen

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. AUFFÄLLIGKEITEN & MUSTER (sachlich, ohne Warnungen)
  // ═══════════════════════════════════════════════════════════════════════════
  'analysis_section',    // EIN konsolidierter Abschnitt:
                         // - BEI PREMIUM-KI: "Medizinische Gesamtanalyse (KI-gestützt)"
                         // - OHNE PREMIUM: "Sachliche Auswertung der dokumentierten Daten"
                         // Keine doppelten Analysen, keine Warnhinweise
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 4. AKUTMEDIKATION & WIRKUNG
  // ═══════════════════════════════════════════════════════════════════════════
  'acute_medication',  // Pro Medikament:
                       // - Wirkstoff + Dosierung
                       // - Ø Einnahmen pro Monat
                       // - Einnahmen letzte 30 Tage
                       // - Ø subjektive Wirkung
                       // + klarer Hinweis bei Grenzwertüberschreitungen
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PROPHYLAXE & THERAPIEVERLAUF
  // ═══════════════════════════════════════════════════════════════════════════
  'therapy_courses',   // Prophylaktische Therapien:
                       // - Präparat, Dosierung, Zeitraum
                       // - Subjektive Wirksamkeit
                       // - Relevante Notizen
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 6. PREMIUM-KI-ANALYSE (klar abgegrenzt, unterstützend)
  // ═══════════════════════════════════════════════════════════════════════════
  'premium_ai_report', // Eigener Abschnitt mit klarer Kennzeichnung
                       // Fokus auf Muster, Trends, Kombinationen
                       // Kein Wiederholen der Kernkennzahlen
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 7. STATISTIKEN & DIAGRAMME (visuelle Vertiefung)
  // ═══════════════════════════════════════════════════════════════════════════
  'charts',            // - Intensitätsverlauf
                       // - Tageszeit-Verteilung
                       // - Schmerz-/Wetterverlauf
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 8. DETAILLIERTE EINTRÄGE (immer ganz unten)
  // ═══════════════════════════════════════════════════════════════════════════
  'entries_list',      // Chronologische Tabelle mit:
                       // - Datum/Uhrzeit, Schmerzintensität, Medikation
                       // - Lokalisation, Besonderheiten
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 9. KONTEXT- & SPRACHNOTIZEN (optional, am Ende)
  // ═══════════════════════════════════════════════════════════════════════════
  'context_notes',     // Ausführliche Notizen als Rohmaterial
  
] as const;

export type ReportSectionId = typeof REPORT_SECTION_ORDER[number];

/**
 * Sektionsmetadaten für UI und PDF-Generierung
 */
export const REPORT_SECTIONS: Record<ReportSectionId, {
  id: ReportSectionId;
  labelDe: string;
  labelEn: string;
  pdfTitle?: string;
  isRequired: boolean;
  isPremium: boolean;
  description?: string;
}> = {
  header: {
    id: 'header',
    labelDe: 'Kopfbereich',
    labelEn: 'Header',
    isRequired: true,
    isPremium: false,
  },
  patient: {
    id: 'patient',
    labelDe: 'Patientendaten',
    labelEn: 'Patient Data',
    pdfTitle: 'PATIENT',
    isRequired: false,
    isPremium: false,
  },
  doctor: {
    id: 'doctor',
    labelDe: 'Behandelnder Arzt',
    labelEn: 'Treating Physician',
    pdfTitle: 'BEHANDELNDER ARZT',
    isRequired: false,
    isPremium: false,
  },
  core_kpis: {
    id: 'core_kpis',
    labelDe: 'Ärztliche Kernübersicht',
    labelEn: 'Core Medical Overview',
    pdfTitle: 'ARZTLICHE KERNUBERSICHT',
    isRequired: true,
    isPremium: false,
    description: 'Ø Schmerztage, Ø Triptan-Einnahmen, Ø Schmerzintensität (normiert auf 30 Tage)',
  },
  analysis_section: {
    id: 'analysis_section',
    labelDe: 'Auffälligkeiten & Muster',
    labelEn: 'Observations & Patterns',
    pdfTitle: 'AUFFALLIGKEITEN & MUSTER',
    isRequired: false,
    isPremium: false,
    description: 'Sachliche Auswertung oder KI-Analyse (Premium)',
  },
  acute_medication: {
    id: 'acute_medication',
    labelDe: 'Akutmedikation',
    labelEn: 'Acute Medication',
    pdfTitle: 'AKUTMEDIKATION & WIRKUNG',
    isRequired: false,
    isPremium: false,
  },
  therapy_courses: {
    id: 'therapy_courses',
    labelDe: 'Prophylaxe & Therapieverlauf',
    labelEn: 'Prophylaxis & Therapy History',
    pdfTitle: 'PROPHYLAXE & THERAPIEVERLAUF',
    isRequired: false,
    isPremium: false,
  },
  premium_ai_report: {
    id: 'premium_ai_report',
    labelDe: 'KI-Analyse (Premium)',
    labelEn: 'AI Analysis (Premium)',
    pdfTitle: 'KI-GESTUTZTE ANALYSE (UNTERSTUTZEND)',
    isRequired: false,
    isPremium: true,
  },
  charts: {
    id: 'charts',
    labelDe: 'Statistiken & Diagramme',
    labelEn: 'Statistics & Charts',
    pdfTitle: 'STATISTIKEN & DIAGRAMME',
    isRequired: false,
    isPremium: false,
  },
  entries_list: {
    id: 'entries_list',
    labelDe: 'Detaillierte Einträge',
    labelEn: 'Detailed Entries',
    pdfTitle: 'DETAILLIERTE KOPFSCHMERZ-EINTRAGE',
    isRequired: false,
    isPremium: false,
  },
  context_notes: {
    id: 'context_notes',
    labelDe: 'Kontextnotizen',
    labelEn: 'Context Notes',
    pdfTitle: 'AUSFUHRLICHE KONTEXTNOTIZEN',
    isRequired: false,
    isPremium: false,
  },
};

/**
 * Triptan-Medikamente für Berechnung der Triptantage
 * Wird für die ärztliche Kernübersicht verwendet
 */
export const TRIPTAN_MEDICATIONS = [
  'sumatriptan',
  'rizatriptan', 
  'zolmitriptan',
  'naratriptan',
  'almotriptan',
  'eletriptan',
  'frovatriptan',
  // Handelsnamen (häufigste)
  'imigran',
  'maxalt',
  'ascotop',
  'naramig',
  'almogran',
  'relpax',
  'allegro',
] as const;

/**
 * Prüft ob ein Medikament ein Triptan ist
 * WICHTIG: Prüft ob der Name "triptan" enthält (case-insensitive)
 * z.B. Sumatriptan, Rizatriptan, Naratriptan → true
 */
export function isTriptanMedication(medicationName: string): boolean {
  const normalized = medicationName.toLowerCase().trim();
  
  // KRITISCH: Prüfe ob "triptan" im Namen enthalten ist
  if (normalized.includes('triptan')) {
    return true;
  }
  
  // Zusätzlich: bekannte Handelsnamen prüfen
  return TRIPTAN_MEDICATIONS.some(triptan => 
    normalized.includes(triptan)
  );
}

/**
 * Grenzwerte für Warnhinweise
 */
export const MEDICATION_THRESHOLDS = {
  // Triptan-Tage pro Monat (Empfehlung: max. 10)
  triptanDaysPerMonth: 10,
  // Akutmedikationstage pro Monat (Empfehlung: max. 10-15)
  acuteMedDaysPerMonth: 15,
  // Schmerztage pro Monat für chronische Migräne
  chronicMigraineThreshold: 15,
} as const;
