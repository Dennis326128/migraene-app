/**
 * Domain-spezifisches Vokabular für bessere Voice-Erkennung
 * Kann später an STT-Provider übergeben werden für Custom Vocabulary
 */

export const PAIN_LEVELS = [
  'kein', 'keine', 'leicht', 'leichte', 'mittel', 'mittlere', 'stark', 'starke', 'sehr stark', 'sehr starke',
  'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn'
];

export const SYMPTOM_TERMS = [
  'Übelkeit', 'Erbrechen', 'Schwindel',
  'Lichtempfindlichkeit', 'Lärmempfindlichkeit', 'Geräuschempfindlichkeit',
  'Aura', 'Sehstörung', 'Flimmern',
  'Müdigkeit', 'Konzentrationsstörung',
  'Nackenschmerzen', 'Verspannung'
];

export const TIME_PHRASES = [
  'jetzt', 'gerade', 'eben',
  'vor', 'Minute', 'Minuten', 'Stunde', 'Stunden',
  'gestern', 'heute', 'morgen',
  'Morgen', 'Vormittag', 'Mittag', 'Nachmittag', 'Abend', 'Nacht',
  'früh', 'mittags', 'abends', 'nachts'
];

export const REMINDER_TRIGGERS = [
  'erinnere', 'Erinnerung', 'erinnern',
  'Termin', 'Appointment',
  'einnehmen', 'nehmen',
  'morgen', 'mittags', 'abends', 'nachts'
];

export const MEDICATION_KEYWORDS = [
  'Tablette', 'Tabletten', 'Kapsel', 'Kapseln',
  'Tropfen', 'Spray',
  'Medikament', 'Medikamente', 'Mittel',
  'genommen', 'eingenommen', 'geschluckt'
];

/**
 * Gibt alle Domain-spezifischen Begriffe als Array zurück
 * Kann an STT-Provider für Custom Vocabulary übergeben werden
 */
export function getAllDomainVocabulary(): string[] {
  return [
    ...PAIN_LEVELS,
    ...SYMPTOM_TERMS,
    ...TIME_PHRASES,
    ...REMINDER_TRIGGERS,
    ...MEDICATION_KEYWORDS
  ];
}

/**
 * Gibt Medikamentennamen aus User-Liste hinzu
 */
export function getVocabularyWithUserMeds(userMeds: Array<{ name: string }>): string[] {
  const medNames = userMeds.map(m => m.name);
  return [
    ...getAllDomainVocabulary(),
    ...medNames
  ];
}
