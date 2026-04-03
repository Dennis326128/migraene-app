/**
 * buildReviewState.ts
 * Wandelt VoiceParseResult → EntryReviewState.
 * Bereitet geparste Spracheingabe für das Review-Sheet der App auf.
 */

import { VoiceParseResult, ParsedMedication } from './parseVoiceEntry';

// ============================================================
// === TYPEN ===
// ============================================================

export interface ReviewMedication {
  id?: string;
  name: string;
  doseQuarters: number;
  doseText: string;
  takenTime: string;
  takenDate: string;
  needsReview: boolean;
}

export interface ReviewUncertainField {
  field: string;
  label: string;          // Deutsches Label für UI
  value: string;
  confidence: number;
  tapToEdit: boolean;     // true wenn Nutzereingabe empfohlen
}

export interface EntryReviewState {
  painLevel: number;
  painLevelIsDefault: boolean;

  selectedMedications: ReviewMedication[];

  painLocations: string[];
  auraType: string;         // default "keine"
  symptoms: string[];
  meCfsLevel: string;       // default "none"
  isPrivate: boolean;

  occurredAt: {
    date: string;
    time: string;
    displayText?: string;
  };

  notesText: string;

  // UI-Hints
  uncertainFields: ReviewUncertainField[];

  overallConfidence: number;
  needsReview: boolean;
}

// ============================================================
// === FELD-LABELS (Deutsch) ===
// ============================================================

const FIELD_LABELS: Record<string, string> = {
  painLevel: 'Schmerzstärke',
  medication: 'Medikament',
  occurredAt: 'Zeitpunkt',
  painLocations: 'Schmerzlokalisation',
  auraType: 'Aura-Typ',
  symptoms: 'Begleitsymptome',
  meCfsLevel: 'ME/CFS-Level',
  note: 'Notiz',
};

function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

// ============================================================
// === CONFIDENCE-REGELN ===
// ============================================================

/**
 * Bestimmt ob ein Feld im UI hervorgehoben werden soll.
 * - < 0.65: tapToEdit: true, wird hervorgehoben
 * - 0.65-0.80: tapToEdit: true, subtile Markierung
 * - > 0.80: kein Hinweis
 */
function shouldTapToEdit(confidence: number): boolean {
  return confidence < 0.80;
}

function confidenceToUiLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.80) return 'high';
  if (confidence >= 0.65) return 'medium';
  return 'low';
}

// ============================================================
// === HAUPT-FUNKTION ===
// ============================================================

/**
 * Konvertiert ein gepartes VoiceParseResult in einen EntryReviewState.
 *
 * @param parsed - Ergebnis von parseVoiceEntry()
 * @param defaults - App-weite Standardwerte
 */
export function buildReviewState(
  parsed: VoiceParseResult,
  defaults: {
    defaultPainLevel?: number;
    defaultMeCfs?: string;
    defaultAura?: string;
  } = {}
): EntryReviewState {
  const {
    defaultPainLevel = 7,
    defaultMeCfs = 'none',
    defaultAura = 'keine',
  } = defaults;

  // ---- 1. Schmerzstärke ----
  const painLevelIsDefault = parsed.painLevel === null;
  const painLevel = painLevelIsDefault ? defaultPainLevel : parsed.painLevel!;

  // ---- 2. Medikamente ----
  const selectedMedications: ReviewMedication[] = parsed.medications.map(med => ({
    id: med.medicationId,
    name: med.name,
    doseQuarters: med.doseQuarters,
    doseText: med.doseText,
    takenTime: med.takenTime ?? parsed.occurredAt.time,
    takenDate: med.takenDate ?? parsed.occurredAt.date,
    needsReview: med.needsReview,
  }));

  // ---- 3. Lokalisationen ----
  const painLocations = parsed.painLocations.length > 0
    ? parsed.painLocations
    : [];

  // ---- 4. Aura ----
  const auraType = parsed.auraType ?? defaultAura;

  // ---- 5. ME/CFS ----
  const meCfsLevel = parsed.meCfsLevel ?? defaultMeCfs;

  // ---- 6. uncertainFields aufbauen ----
  const uncertainFields: ReviewUncertainField[] = [];

  // Schmerzstärke
  if (painLevelIsDefault) {
    uncertainFields.push({
      field: 'painLevel',
      label: getFieldLabel('painLevel'),
      value: String(defaultPainLevel),
      confidence: 0.50,
      tapToEdit: true,
    });
  } else if (parsed.painLevelConfidence < 0.80) {
    uncertainFields.push({
      field: 'painLevel',
      label: getFieldLabel('painLevel'),
      value: String(painLevel),
      confidence: parsed.painLevelConfidence,
      tapToEdit: shouldTapToEdit(parsed.painLevelConfidence),
    });
  }

  // Zeitpunkt
  if (parsed.occurredAt.isDefault) {
    uncertainFields.push({
      field: 'occurredAt',
      label: getFieldLabel('occurredAt'),
      value: `${parsed.occurredAt.date} ${parsed.occurredAt.time}`,
      confidence: parsed.occurredAt.confidence,
      tapToEdit: true,
    });
  } else if (parsed.occurredAt.confidence < 0.80) {
    uncertainFields.push({
      field: 'occurredAt',
      label: getFieldLabel('occurredAt'),
      value: parsed.occurredAt.displayText ?? `${parsed.occurredAt.date} ${parsed.occurredAt.time}`,
      confidence: parsed.occurredAt.confidence,
      tapToEdit: shouldTapToEdit(parsed.occurredAt.confidence),
    });
  }

  // Medikamente mit Unsicherheit
  for (const med of selectedMedications) {
    const medSource = parsed.medications.find(m => m.name === med.name);
    if (medSource && (medSource.needsReview || medSource.confidence < 0.80)) {
      uncertainFields.push({
        field: 'medication',
        label: `${getFieldLabel('medication')}: ${med.name}`,
        value: med.name,
        confidence: medSource.confidence,
        tapToEdit: shouldTapToEdit(medSource.confidence),
      });
    }
  }

  // Aura
  if (parsed.auraConfidence > 0 && parsed.auraConfidence < 0.80) {
    uncertainFields.push({
      field: 'auraType',
      label: getFieldLabel('auraType'),
      value: auraType,
      confidence: parsed.auraConfidence,
      tapToEdit: shouldTapToEdit(parsed.auraConfidence),
    });
  }

  // Symptome
  if (parsed.symptomsConfidence > 0 && parsed.symptomsConfidence < 0.75) {
    uncertainFields.push({
      field: 'symptoms',
      label: getFieldLabel('symptoms'),
      value: parsed.symptoms.join(', '),
      confidence: parsed.symptomsConfidence,
      tapToEdit: shouldTapToEdit(parsed.symptomsConfidence),
    });
  }

  // ME/CFS
  if (parsed.meCfsConfidence > 0 && parsed.meCfsConfidence < 0.75) {
    uncertainFields.push({
      field: 'meCfsLevel',
      label: getFieldLabel('meCfsLevel'),
      value: meCfsLevel,
      confidence: parsed.meCfsConfidence,
      tapToEdit: shouldTapToEdit(parsed.meCfsConfidence),
    });
  }

  // Lokalisationen (von uncertain-Fields aus parsed)
  if (parsed.locationsConfidence > 0 && parsed.locationsConfidence < 0.75) {
    uncertainFields.push({
      field: 'painLocations',
      label: getFieldLabel('painLocations'),
      value: painLocations.join(', '),
      confidence: parsed.locationsConfidence,
      tapToEdit: shouldTapToEdit(parsed.locationsConfidence),
    });
  }

  // ---- 7. Gesamt-Confidence ----
  const overallConfidence = parsed.confidence;

  // ---- 8. needsReview ----
  const needsReview =
    parsed.needsReview ||
    uncertainFields.some(f => f.tapToEdit) ||
    selectedMedications.some(m => m.needsReview);

  return {
    painLevel,
    painLevelIsDefault,
    selectedMedications,
    painLocations,
    auraType,
    symptoms: parsed.symptoms,
    meCfsLevel,
    isPrivate: parsed.isPrivate,
    occurredAt: {
      date: parsed.occurredAt.date,
      time: parsed.occurredAt.time,
      displayText: parsed.occurredAt.displayText,
    },
    notesText: parsed.note,
    uncertainFields,
    overallConfidence,
    needsReview,
  };
}

// ============================================================
// === HILFSFUNKTIONEN ===
// ============================================================

/**
 * Gibt einen menschenlesbaren deutschen Text für die Confidence zurück.
 * Nützlich für UI-Labels.
 */
export function confidenceToText(confidence: number): string {
  if (confidence >= 0.90) return 'sehr sicher';
  if (confidence >= 0.80) return 'sicher';
  if (confidence >= 0.65) return 'wahrscheinlich';
  if (confidence >= 0.50) return 'unsicher';
  return 'sehr unsicher';
}

/**
 * Gibt den deutschen Namen für eine Schmerzlokalisation zurück.
 */
export function getLocationLabel(locationId: string): string {
  const labels: Record<string, string> = {
    'einseitig_links': 'Links',
    'einseitig_rechts': 'Rechts',
    'beidseitig': 'Beidseitig',
    'stirn': 'Stirn',
    'schlaefe': 'Schläfe',
    'nacken': 'Nacken / Hinterkopf',
    'auge': 'Auge / Orbital',
    'kiefer': 'Kiefer',
    'gesicht': 'Gesicht',
  };
  return labels[locationId] ?? locationId;
}

/**
 * Gibt den deutschen Namen für einen Aura-Typ zurück.
 */
export function getAuraLabel(auraType: string): string {
  const labels: Record<string, string> = {
    'visuell': 'Visuelle Aura',
    'sensorisch': 'Sensorische Aura',
    'sprachlich': 'Sprachliche Aura',
    'motorisch': 'Motorische Aura',
    'hirnstamm': 'Hirnstamm-Aura',
    'keine': 'Keine Aura',
  };
  return labels[auraType] ?? auraType;
}

/**
 * Gibt den deutschen Namen für ein Symptom zurück.
 */
export function getSymptomLabel(symptomId: string): string {
  const labels: Record<string, string> = {
    'uebelkeit': 'Übelkeit',
    'erbrechen': 'Erbrechen',
    'schwindel': 'Schwindel',
    'lichtempfindlichkeit': 'Lichtempfindlichkeit',
    'geraeuschempfindlichkeit': 'Geräuschempfindlichkeit',
    'geruchsempfindlichkeit': 'Geruchsempfindlichkeit',
    'sehstoerungen': 'Sehstörungen',
    'kribbeln': 'Kribbeln / Taubheit',
    'muedigkeit': 'Müdigkeit / Erschöpfung',
    'appetitlosigkeit': 'Appetitlosigkeit',
    'nackenschmerz': 'Nackenschmerzen',
    'wortfindungsstoerung': 'Wortfindungsstörung',
    'doppelbilder': 'Doppelbilder',
    'gleichgewichtsstoerung': 'Gleichgewichtsstörung',
    'hitzewallungen': 'Hitzewallungen',
    'kaeltegefuehl': 'Kältegefühl',
    'spannungskopfschmerz': 'Spannungskopfschmerz',
    'konzentrationsstoerung': 'Konzentrationsstörung',
    'aura': 'Aura',
  };
  return labels[symptomId] ?? symptomId;
}

/**
 * Gibt den deutschen Namen für ein ME/CFS-Level zurück.
 */
export function getMeCfsLabel(level: string): string {
  const labels: Record<string, string> = {
    'none': 'Keine Beschwerden',
    'mild': 'Leichte Beschwerden',
    'moderate': 'Mittlere Beschwerden',
    'severe': 'Schwere Beschwerden',
  };
  return labels[level] ?? level;
}

/**
 * Formatiert Quartale als lesbaren deutschen Text.
 * Beispiele: 4 → "1 Tablette", 2 → "½ Tablette", 6 → "1½ Tabletten"
 */
export function quartersToText(quarters: number): string {
  const map: Record<number, string> = {
    1: '¼ Tablette',
    2: '½ Tablette',
    3: '¾ Tablette',
    4: '1 Tablette',
    6: '1½ Tabletten',
    8: '2 Tabletten',
    12: '3 Tabletten',
  };
  return map[quarters] ?? `${quarters / 4} Tabletten`;
}
