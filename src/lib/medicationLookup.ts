/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIKAMENTEN-LOOKUP & AUTO-FILL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Automatisches Vorfüllen von Medikamenten-Stammdaten basierend auf dem Namen.
 * Enthält eine interne Datenbank typischer Migräne-Medikamente.
 * 
 * TODO: external medication lookup - Kann später durch externe API ersetzt werden
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type MedicationMetadata = {
  wirkstoff: string;
  staerke: string;
  darreichungsform: string;
  einheit: string;
  art: "prophylaxe" | "akut" | "bedarf" | "notfall" | "selbstmedikation";
  anwendungsgebiet: string;
  hinweise?: string;           // Sachliche Hinweise für den Medikationsplan (hinweis_medplan)
  dosis_bedarf?: string;
  dosis_intervall?: string;    // z.B. "1x monatlich", "alle 3 Monate"
};

// Interne Datenbank typischer Migräne-Medikamente
const MEDICATION_DATABASE: Record<string, MedicationMetadata> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // PROPHYLAXE (Vorbeugung)
  // ═══════════════════════════════════════════════════════════════════════════
  "ajovy": {
    wirkstoff: "Fremanezumab",
    staerke: "225 mg",
    darreichungsform: "Injektionsloesung",
    einheit: "Fertigspritze",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Subkutane Injektion",
    dosis_intervall: "1x monatlich",
  },
  "ajovy 225": {
    wirkstoff: "Fremanezumab",
    staerke: "225 mg",
    darreichungsform: "Injektionsloesung",
    einheit: "Fertigspritze",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Subkutane Injektion",
    dosis_intervall: "1x monatlich",
  },
  "aimovig": {
    wirkstoff: "Erenumab",
    staerke: "70 mg",
    darreichungsform: "Injektionsloesung",
    einheit: "Fertigspritze",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Subkutane Injektion",
    dosis_intervall: "1x monatlich",
  },
  "aimovig 140": {
    wirkstoff: "Erenumab",
    staerke: "140 mg",
    darreichungsform: "Injektionsloesung",
    einheit: "Fertigspritze",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Subkutane Injektion",
    dosis_intervall: "1x monatlich",
  },
  "emgality": {
    wirkstoff: "Galcanezumab",
    staerke: "120 mg",
    darreichungsform: "Injektionsloesung",
    einheit: "Fertigpen",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Subkutane Injektion, Startdosis: 240 mg",
    dosis_intervall: "1x monatlich",
  },
  "topiramat": {
    wirkstoff: "Topiramat",
    staerke: "50 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Einschleichen ueber 4-8 Wochen, ausreichend trinken",
  },
  "topamax": {
    wirkstoff: "Topiramat",
    staerke: "50 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Einschleichen ueber 4-8 Wochen",
  },
  "propranolol": {
    wirkstoff: "Propranolol",
    staerke: "40 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Nicht abrupt absetzen, Puls kontrollieren",
  },
  "metoprolol": {
    wirkstoff: "Metoprolol",
    staerke: "47,5 mg",
    darreichungsform: "Retardtablette",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Nicht abrupt absetzen",
  },
  "amitriptylin": {
    wirkstoff: "Amitriptylin",
    staerke: "25 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe / chron. Kopfschmerzen",
    hinweise: "Abends einnehmen, kann muede machen",
  },
  "flunarizin": {
    wirkstoff: "Flunarizin",
    staerke: "5 mg",
    darreichungsform: "Kapsel",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Abends einnehmen, Gewichtskontrolle",
  },
  "botox": {
    wirkstoff: "Botulinumtoxin Typ A",
    staerke: "155 E",
    darreichungsform: "Injektionsloesung",
    einheit: "Behandlung",
    art: "prophylaxe",
    anwendungsgebiet: "Chronische Migraene",
    hinweise: "Injektion durch Arzt",
    dosis_intervall: "alle 12 Wochen",
  },
  "valproat": {
    wirkstoff: "Valproinsaeure",
    staerke: "500 mg",
    darreichungsform: "Retardtablette",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Nicht in Schwangerschaft, Leberwerte kontrollieren",
  },
  "magnesium": {
    wirkstoff: "Magnesium",
    staerke: "400 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe / Ergaenzung",
    hinweise: "Als Nahrungsergaenzung",
  },
  "riboflavin": {
    wirkstoff: "Vitamin B2",
    staerke: "400 mg",
    darreichungsform: "Kapsel",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Hohe Dosis, kann Urin gelblich faerben",
  },
  "coenzym q10": {
    wirkstoff: "Coenzym Q10",
    staerke: "100 mg",
    darreichungsform: "Kapsel",
    einheit: "Stueck",
    art: "prophylaxe",
    anwendungsgebiet: "Migraeneprophylaxe",
    hinweise: "Als Nahrungsergaenzung",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRIPTANE (Akut-/Bedarfsmedikation)
  // ═══════════════════════════════════════════════════════════════════════════
  "sumatriptan": {
    wirkstoff: "Sumatriptan",
    staerke: "50 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Bei Bedarf, max. 200 mg/Tag, max. 10 Tage/Monat",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "sumatriptan 50": {
    wirkstoff: "Sumatriptan",
    staerke: "50 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Max. 10 Tage pro Monat",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "sumatriptan 100": {
    wirkstoff: "Sumatriptan",
    staerke: "100 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Max. 10 Tage pro Monat",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "sumatriptan nasenspray": {
    wirkstoff: "Sumatriptan",
    staerke: "20 mg",
    darreichungsform: "Nasenspray",
    einheit: "Hub",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Schneller Wirkeintritt",
    dosis_bedarf: "1 Hub bei Bedarf",
  },
  "imigran": {
    wirkstoff: "Sumatriptan",
    staerke: "50 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Max. 10 Tage pro Monat",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "rizatriptan": {
    wirkstoff: "Rizatriptan",
    staerke: "10 mg",
    darreichungsform: "Schmelztablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Zergeht auf der Zunge, schneller Wirkeintritt",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "rizatriptan 10": {
    wirkstoff: "Rizatriptan",
    staerke: "10 mg",
    darreichungsform: "Schmelztablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Max. 10 Tage pro Monat",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "maxalt": {
    wirkstoff: "Rizatriptan",
    staerke: "10 mg",
    darreichungsform: "Schmelztablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Zergeht auf der Zunge",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "zolmitriptan": {
    wirkstoff: "Zolmitriptan",
    staerke: "2,5 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Max. 10 mg/Tag",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "ascotop": {
    wirkstoff: "Zolmitriptan",
    staerke: "2,5 mg",
    darreichungsform: "Schmelztablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Zergeht auf der Zunge",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "eletriptan": {
    wirkstoff: "Eletriptan",
    staerke: "40 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Max. 80 mg/Tag",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "relpax": {
    wirkstoff: "Eletriptan",
    staerke: "40 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Max. 80 mg/Tag",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "naratriptan": {
    wirkstoff: "Naratriptan",
    staerke: "2,5 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Gut vertraeglich, laengere Wirkdauer",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "almotriptan": {
    wirkstoff: "Almotriptan",
    staerke: "12,5 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke",
    hinweise: "Max. 25 mg/Tag",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "frovatriptan": {
    wirkstoff: "Frovatriptan",
    staerke: "2,5 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "akut",
    anwendungsgebiet: "Akute Migraeneattacke / Menstruelle Migraene",
    hinweise: "Lange Halbwertszeit, gut bei menstrueller Migraene",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHMERZMITTEL (NSAR / Analgetika)
  // ═══════════════════════════════════════════════════════════════════════════
  "ibuprofen": {
    wirkstoff: "Ibuprofen",
    staerke: "400 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / leichte bis mittlere Migraene",
    hinweise: "Mit Essen, max. 10 Tage/Monat",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "ibuprofen 400": {
    wirkstoff: "Ibuprofen",
    staerke: "400 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / Migraene",
    hinweise: "Mit Essen, max. 10 Tage/Monat",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "ibuprofen 600": {
    wirkstoff: "Ibuprofen",
    staerke: "600 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / Migraene",
    hinweise: "Mit Essen, max. 10 Tage/Monat",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "ibuprofen 800": {
    wirkstoff: "Ibuprofen",
    staerke: "800 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / Migraene",
    hinweise: "Mit Essen, max. 10 Tage/Monat",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "paracetamol": {
    wirkstoff: "Paracetamol",
    staerke: "500 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / leichte Migraene",
    hinweise: "Max. 4g/Tag, max. 10 Tage/Monat",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "paracetamol 500": {
    wirkstoff: "Paracetamol",
    staerke: "500 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / leichte Migraene",
    hinweise: "Max. 4g/Tag, max. 10 Tage/Monat",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "paracetamol 1000": {
    wirkstoff: "Paracetamol",
    staerke: "1000 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / Migraene",
    hinweise: "Max. 4g/Tag",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "aspirin": {
    wirkstoff: "Acetylsalicylsaeure",
    staerke: "500 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / Migraene",
    hinweise: "Nicht mit Triptanen kombinieren, Magenvertraeglichkeit beachten",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "ass": {
    wirkstoff: "Acetylsalicylsaeure",
    staerke: "500 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / Migraene",
    hinweise: "Magenvertraeglichkeit beachten",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "naproxen": {
    wirkstoff: "Naproxen",
    staerke: "500 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / Migraene",
    hinweise: "Laengere Wirkdauer als Ibuprofen",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "diclofenac": {
    wirkstoff: "Diclofenac",
    staerke: "50 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen / Migraene",
    hinweise: "Mit Essen einnehmen",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "voltaren": {
    wirkstoff: "Diclofenac",
    staerke: "50 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schmerzen",
    hinweise: "Mit Essen einnehmen",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "novaminsulfon": {
    wirkstoff: "Metamizol",
    staerke: "500 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Starke Schmerzen / Migraene",
    hinweise: "Verschreibungspflichtig, Blutbildkontrolle",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },
  "novalgin": {
    wirkstoff: "Metamizol",
    staerke: "500 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Starke Schmerzen / Migraene",
    hinweise: "Verschreibungspflichtig",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANTIEMETIKA (gegen Uebelkeit)
  // ═══════════════════════════════════════════════════════════════════════════
  "metoclopramid": {
    wirkstoff: "Metoclopramid",
    staerke: "10 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Uebelkeit bei Migraene",
    hinweise: "Vor Schmerzmittel einnehmen, max. 5 Tage",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "mcp": {
    wirkstoff: "Metoclopramid",
    staerke: "10 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Uebelkeit bei Migraene",
    hinweise: "Vor Schmerzmittel einnehmen",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "domperidon": {
    wirkstoff: "Domperidon",
    staerke: "10 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Uebelkeit bei Migraene",
    hinweise: "Vor Schmerzmittel einnehmen",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "vomex": {
    wirkstoff: "Dimenhydrinat",
    staerke: "50 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Uebelkeit / Erbrechen",
    hinweise: "Kann muede machen",
    dosis_bedarf: "1-2 Tbl. bei Bedarf",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTFALL- / BERUHIGUNGSMITTEL
  // ═══════════════════════════════════════════════════════════════════════════
  "diazepam": {
    wirkstoff: "Diazepam",
    staerke: "10 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "notfall",
    anwendungsgebiet: "Starke Angst / Muskelspannung / Notfall",
    hinweise: "Nicht dauerhaft, nur im Notfall, abhaengigkeitspotenzial",
    dosis_bedarf: "1 Tbl. bei Bedarf (nur Notfall)",
  },
  "diazepam 5": {
    wirkstoff: "Diazepam",
    staerke: "5 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "notfall",
    anwendungsgebiet: "Angst / Muskelspannung",
    hinweise: "Nicht dauerhaft, Abhaengigkeitspotenzial",
    dosis_bedarf: "1 Tbl. bei Bedarf",
  },
  "diazepam 10": {
    wirkstoff: "Diazepam",
    staerke: "10 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "notfall",
    anwendungsgebiet: "Starke Angst / Muskelspannung / Notfall",
    hinweise: "Nur im Notfall, Abhaengigkeitspotenzial",
    dosis_bedarf: "1 Tbl. bei Bedarf (nur Notfall)",
  },
  "lorazepam": {
    wirkstoff: "Lorazepam",
    staerke: "1 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "notfall",
    anwendungsgebiet: "Akute Angst / Panik",
    hinweise: "Kurze Anwendung, Abhaengigkeitspotenzial",
    dosis_bedarf: "1 Tbl. bei Bedarf (nur Notfall)",
  },
  "tavor": {
    wirkstoff: "Lorazepam",
    staerke: "1 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "notfall",
    anwendungsgebiet: "Akute Angst / Panik",
    hinweise: "Kurze Anwendung, Abhaengigkeitspotenzial",
    dosis_bedarf: "1 Tbl. bei Bedarf (nur Notfall)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHLAFMITTEL
  // ═══════════════════════════════════════════════════════════════════════════
  "zopiclon": {
    wirkstoff: "Zopiclon",
    staerke: "7,5 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schlafstörungen",
    hinweise: "Nur kurzfristig, bitterer Nachgeschmack moeglich",
    dosis_bedarf: "1 Tbl. bei Schlafproblemen",
  },
  "zopiclon 7,5": {
    wirkstoff: "Zopiclon",
    staerke: "7,5 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schlafstörungen",
    hinweise: "Nur kurzfristig",
    dosis_bedarf: "1 Tbl. bei Schlafproblemen",
  },
  "zolpidem": {
    wirkstoff: "Zolpidem",
    staerke: "10 mg",
    darreichungsform: "Tablette",
    einheit: "Stueck",
    art: "bedarf",
    anwendungsgebiet: "Schlafstörungen",
    hinweise: "Nur kurzfristig",
    dosis_bedarf: "1 Tbl. bei Schlafproblemen",
  },
};

/**
 * Sucht nach Medikamenten-Metadaten basierend auf dem Namen.
 * 
 * @param medName - Der Medikamentenname (Handelsname oder generischer Name)
 * @returns MedicationMetadata oder undefined wenn nicht gefunden
 * 
 * TODO: external medication lookup - Diese Funktion kann später durch einen
 * externen API-Call zu einer Arzneimittel-Datenbank erweitert werden.
 */
export function lookupMedicationMetadata(medName: string): MedicationMetadata | undefined {
  if (!medName) return undefined;
  
  // Normalisiere den Namen: Kleinbuchstaben, trimmen
  const normalizedName = medName.toLowerCase().trim();
  
  // 1. Exakte Suche
  if (MEDICATION_DATABASE[normalizedName]) {
    return MEDICATION_DATABASE[normalizedName];
  }
  
  // 2. Suche ohne Stärke-Angaben (z.B. "Sumatriptan 100 mg" → "sumatriptan 100")
  const withoutMg = normalizedName.replace(/\s*mg\s*/gi, " ").trim();
  if (MEDICATION_DATABASE[withoutMg]) {
    return MEDICATION_DATABASE[withoutMg];
  }
  
  // 3. Suche nur nach dem Hauptnamen (erster Teil)
  const mainName = normalizedName.split(/[\s\d]+/)[0];
  if (mainName && MEDICATION_DATABASE[mainName]) {
    return MEDICATION_DATABASE[mainName];
  }
  
  // 4. Fuzzy-Suche: Prüfe ob der Hauptname in einem Key enthalten ist
  for (const [key, value] of Object.entries(MEDICATION_DATABASE)) {
    if (key.startsWith(mainName) || mainName.startsWith(key.split(/[\s\d]+/)[0])) {
      return value;
    }
  }
  
  return undefined;
}

/**
 * Ermittelt die Art des Medikaments basierend auf dem Namen.
 * Fallback für unbekannte Medikamente.
 */
export function guessMedicationType(medName: string): MedicationMetadata["art"] {
  const lookup = lookupMedicationMetadata(medName);
  if (lookup) return lookup.art;
  
  const lower = medName.toLowerCase();
  
  // Triptane → Akut
  if (lower.includes("triptan") || lower.includes("imigran") || lower.includes("maxalt") || 
      lower.includes("ascotop") || lower.includes("relpax")) {
    return "akut";
  }
  
  // Prophylaxe-Marker
  if (lower.includes("ajovy") || lower.includes("aimovig") || lower.includes("emgality") ||
      lower.includes("topiramat") || lower.includes("propranolol") || lower.includes("amitriptylin") ||
      lower.includes("botox") || lower.includes("flunarizin")) {
    return "prophylaxe";
  }
  
  // Benzodiazepine → Notfall
  if (lower.includes("diazepam") || lower.includes("lorazepam") || lower.includes("tavor")) {
    return "notfall";
  }
  
  // Default → Bei Bedarf
  return "bedarf";
}

/**
 * Gibt einen Vorschlag für das Anwendungsgebiet zurück.
 */
export function suggestAnwendungsgebiet(medName: string, art?: string): string {
  const lookup = lookupMedicationMetadata(medName);
  if (lookup?.anwendungsgebiet) return lookup.anwendungsgebiet;
  
  // Fallback basierend auf Art
  switch (art) {
    case "prophylaxe": return "Migraeneprophylaxe";
    case "akut": return "Akute Migraeneattacke";
    case "notfall": return "Notfallmedikation";
    default: return "Schmerzen / Migraene";
  }
}

/**
 * Liste aller bekannten Medikamente für Autocomplete.
 */
export function getKnownMedicationNames(): string[] {
  const uniqueNames = new Set<string>();
  
  for (const key of Object.keys(MEDICATION_DATABASE)) {
    // Capitalize first letter
    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
    uniqueNames.add(capitalized);
  }
  
  return Array.from(uniqueNames).sort();
}
