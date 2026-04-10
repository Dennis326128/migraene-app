/**
 * Tests for analysisFilters.ts — Content quality filters for AI analysis.
 */
import { describe, it, expect } from 'vitest';
import {
  isTrivialSequence,
  isBanalContent,
  isGenericUncertainty,
  isWeakPattern,
  MEDICATION_TITLE_RX,
} from '../analysisFilters';

describe('isTrivialSequence', () => {
  it('suppresses pain → medication', () => {
    expect(isTrivialSequence('Schmerz → Medikament')).toBe(true);
  });

  it('suppresses migraine → rest', () => {
    expect(isTrivialSequence('Migräne → Ruhe')).toBe(true);
  });

  it('suppresses fatigue → sleep', () => {
    expect(isTrivialSequence('Erschöpfung → Schlaf')).toBe(true);
  });

  it('suppresses English phase sequences', () => {
    expect(isTrivialSequence('pain→medication')).toBe(true);
    expect(isTrivialSequence('fatigue→rest')).toBe(true);
  });

  it('suppresses via banal interpretation', () => {
    expect(isTrivialSequence('custom pattern', 'Das ist eine übliche Reaktion auf Schmerz')).toBe(true);
    expect(isTrivialSequence('custom pattern', 'Typische Reaktion bei Migräne')).toBe(true);
  });

  it('allows genuinely interesting sequences', () => {
    expect(isTrivialSequence('Schlafmangel → Migräne am Folgetag')).toBe(false);
    expect(isTrivialSequence('Reizüberflutung → Schmerzanstieg nach 4h')).toBe(false);
  });

  it('suppresses attack → bed', () => {
    expect(isTrivialSequence('Attacke → Bett')).toBe(true);
  });

  it('suppresses complaints → retreat', () => {
    expect(isTrivialSequence('Beschwerden → Rückzug')).toBe(true);
  });
});

describe('isBanalContent', () => {
  it('suppresses nausea as accompanying symptom', () => {
    expect(isBanalContent('Übelkeit als Begleitsymptom der Migräne')).toBe(true);
  });

  it('suppresses medication was taken phrasing', () => {
    expect(isBanalContent('Schmerz wurde mit Medikament behandelt')).toBe(true);
    expect(isBanalContent('Das Medikament wurde dann eingenommen')).toBe(true);
  });

  it('suppresses tired/exhausted without context', () => {
    expect(isBanalContent('Einfach müde an dem Tag')).toBe(true);
    expect(isBanalContent('Allgemein erschöpft gewesen')).toBe(true);
  });

  it('suppresses trivial reaction phrases', () => {
    expect(isBanalContent('Daraufhin Ruhe')).toBe(true);
    expect(isBanalContent('Danach Rückzug in dunklen Raum')).toBe(true);
    expect(isBanalContent('Normale Reaktion auf die Belastung')).toBe(true);
  });

  it('suppresses fatigue banalities', () => {
    expect(isBanalContent('War den ganzen Tag müde')).toBe(true);
    expect(isBanalContent('Hatte wenig Kraft')).toBe(true);
    expect(isBanalContent('Keine Energie gehabt')).toBe(true);
    expect(isBanalContent('Generell erschöpft')).toBe(true);
    expect(isBanalContent('War ein schwerer Tag')).toBe(true);
    expect(isBanalContent('Anstrengender Tag ohne besonderes')).toBe(true);
  });

  it('suppresses generic symptom listings', () => {
    expect(isBanalContent('Die üblichen Beschwerden traten auf')).toBe(true);
    expect(isBanalContent('Symptome wie üblich')).toBe(true);
  });

  it('allows substantive observations', () => {
    expect(isBanalContent('Schlafmangel korreliert mit stärkeren Attacken am Folgetag')).toBe(false);
    expect(isBanalContent('Triptane werden teils spät eingenommen')).toBe(false);
  });
});

describe('isGenericUncertainty', () => {
  it('suppresses more-data-needed phrases', () => {
    expect(isGenericUncertainty('Mehr Daten wären hilfreich für eine genauere Analyse')).toBe(true);
    expect(isGenericUncertainty('Zu wenig Daten für eine Aussage')).toBe(true);
    expect(isGenericUncertainty('Die Datenlage reicht nicht aus')).toBe(true);
    expect(isGenericUncertainty('Weitere Daten erforderlich')).toBe(true);
  });

  it('suppresses vague unclear phrases', () => {
    expect(isGenericUncertainty('Es ist unklar, ob ein Zusammenhang besteht')).toBe(true);
    expect(isGenericUncertainty('Das könnte zufällig sein')).toBe(true);
    expect(isGenericUncertainty('Schwer zu beurteilen ohne mehr Einträge')).toBe(true);
  });

  it('allows specific actionable uncertainties', () => {
    expect(isGenericUncertainty('Ob der Wetterwechsel oder der Schlafmangel der eigentliche Auslöser war, lässt sich noch nicht trennen')).toBe(false);
    expect(isGenericUncertainty('Es wäre hilfreich, beim nächsten Mal den genauen Einnahmezeitpunkt zu notieren')).toBe(false);
  });
});

describe('isWeakPattern', () => {
  it('suppresses vague descriptions', () => {
    expect(isWeakPattern('Stress tritt teilweise auf vor Attacken')).toBe(true);
    expect(isWeakPattern('Ein eventuell Zusammenhang mit dem Wetter')).toBe(true);
    expect(isWeakPattern('Vereinzelt beobachtet bei hoher Belastung')).toBe(true);
    expect(isWeakPattern('Ein Zusammenhang ist nicht ausgeschlossen')).toBe(true);
  });

  it('suppresses hedging/vague phrasing', () => {
    expect(isWeakPattern('Es fällt auf, dass manchmal Stress vorkommt')).toBe(true);
    expect(isWeakPattern('Es scheint als ob ein Muster vorliegt')).toBe(true);
    expect(isWeakPattern('Möglicherweise besteht ein Zusammenhang')).toBe(true);
  });

  it('suppresses too-short descriptions as generic', () => {
    expect(isWeakPattern('Stress und Wetter')).toBe(true);
    expect(isWeakPattern('Schlaf relevant')).toBe(true);
  });

  it('allows strong descriptions', () => {
    expect(isWeakPattern('An 8 von 12 Schmerztagen lag die Einnahme mehr als 3 Stunden nach Schmerzbeginn')).toBe(false);
    expect(isWeakPattern('Triptane wurden in der Mehrzahl der Fälle erst bei starken Beschwerden eingesetzt')).toBe(false);
  });
});

describe('MEDICATION_TITLE_RX', () => {
  it('matches medication-related titles', () => {
    expect(MEDICATION_TITLE_RX.test('Triptan-Zurückhaltung')).toBe(true);
    expect(MEDICATION_TITLE_RX.test('Akutmedikament zu spät')).toBe(true);
    expect(MEDICATION_TITLE_RX.test('Übergebrauchsrisiko')).toBe(true);
    expect(MEDICATION_TITLE_RX.test('Vermeidungsverhalten bei Einnahme')).toBe(true);
    expect(MEDICATION_TITLE_RX.test('Spätes Einnehmen von Triptanen')).toBe(true);
    expect(MEDICATION_TITLE_RX.test('Abwarten trotz starker Beschwerden')).toBe(true);
  });

  it('does not match unrelated titles', () => {
    expect(MEDICATION_TITLE_RX.test('Schlafmangel als Trigger')).toBe(false);
    expect(MEDICATION_TITLE_RX.test('Stress und Belastung')).toBe(false);
    expect(MEDICATION_TITLE_RX.test('Wettereinfluss')).toBe(false);
  });
});
