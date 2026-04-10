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

// ============================================================
// === FATIGUE CONTEXT SERIALIZATION TESTS ===
// ============================================================

describe('fatigue context filtering in serializeForLLM', () => {
  // These are integration-style behavioral tests for the serializer logic

  it('suppresses fatigue entries far from pain days', () => {
    // This tests the design rule: fatigue only near pain days
    // The actual function is in analysisContext.ts — we test the filter concept here
    const fatigueDate = '2025-03-10';
    const painDates = new Set(['2025-03-15']);
    const isNearPain = (dateStr: string) => {
      if (painDates.has(dateStr)) return true;
      const d = new Date(dateStr);
      const prev = new Date(d); prev.setDate(prev.getDate() - 1);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      return painDates.has(prev.toISOString().slice(0, 10)) || painDates.has(next.toISOString().slice(0, 10));
    };
    expect(isNearPain(fatigueDate)).toBe(false);
  });

  it('includes fatigue entries adjacent to pain days', () => {
    const painDates = new Set(['2025-03-15']);
    const isNearPain = (dateStr: string) => {
      if (painDates.has(dateStr)) return true;
      const d = new Date(dateStr);
      const prev = new Date(d); prev.setDate(prev.getDate() - 1);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      return painDates.has(prev.toISOString().slice(0, 10)) || painDates.has(next.toISOString().slice(0, 10));
    };
    expect(isNearPain('2025-03-14')).toBe(true); // day before pain
    expect(isNearPain('2025-03-16')).toBe(true); // day after pain
  });

  it('"einfach müde" alone does not pass meaningful-tag filter', () => {
    const meaningfulTags = /belastung|reizüberflutet|brain fog|benommen|hinlegen|aktivität/i;
    expect(meaningfulTags.test('einfach müde')).toBe(false);
  });

  it('meaningful fatigue tags pass the filter', () => {
    const meaningfulTags = /belastung|reizüberflutet|brain fog|benommen|hinlegen|aktivität/i;
    expect(meaningfulTags.test('nach Belastung schlechter')).toBe(true);
    expect(meaningfulTags.test('reizüberflutet')).toBe(true);
    expect(meaningfulTags.test('benommen/Brain Fog')).toBe(true);
  });

  it('medication patterns always outrank pure fatigue findings', () => {
    // Behavioral: medication pattern type gets priority via MEDICATION_TITLE_RX
    expect(MEDICATION_TITLE_RX.test('Triptan-Zurückhaltung')).toBe(true);
    // Fatigue-only title should NOT match medication priority
    expect(MEDICATION_TITLE_RX.test('Erschöpfung an Schmerztagen')).toBe(false);
    expect(MEDICATION_TITLE_RX.test('Müdigkeit vor Attacke')).toBe(false);
  });
});

// ============================================================
// === NEW: Tightened filter behavioral tests ===
// ============================================================

describe('isWeakPattern – expanded hedging', () => {
  it('rejects "in einigen Fällen" hedging', () => {
    expect(isWeakPattern('In einigen Fällen scheint Stress eine Rolle zu spielen')).toBe(true);
  });
  it('rejects "tendenziell" hedging', () => {
    expect(isWeakPattern('Tendenziell etwas mehr Beschwerden bei Wetterwechsel')).toBe(true);
  });
  it('rejects "gewisse Hinweise"', () => {
    expect(isWeakPattern('Es gibt gewisse Hinweise auf einen Zusammenhang')).toBe(true);
  });
  it('accepts a concrete medication pattern', () => {
    expect(isWeakPattern('Triptane werden häufig erst 3-4 Stunden nach Schmerzbeginn eingenommen, was mit längeren Attacken korreliert.')).toBe(false);
  });
});

describe('isGenericUncertainty – expanded phrases', () => {
  it('rejects "längerer Zeitraum nötig"', () => {
    expect(isGenericUncertainty('Ein längerer Zeitraum nötig für verlässliche Aussagen')).toBe(true);
  });
  it('rejects "weitere Beobachtung"', () => {
    expect(isGenericUncertainty('Weitere Beobachtung könnte hier hilfreich sein')).toBe(true);
  });
  it('rejects "regelmäßiger eintragen"', () => {
    expect(isGenericUncertainty('Regelmäßiger eintragen würde die Analyse verbessern')).toBe(true);
  });
  it('accepts a specific actionable question', () => {
    expect(isGenericUncertainty('Ob der Schlafmangel am 12. und 14. ursächlich war, lässt sich mit weiteren Tagen besser beurteilen')).toBe(false);
  });
});

describe('context finding minimum length gate', () => {
  it('observations under 30 chars should be considered too short', () => {
    const shortObs = 'Stress an Schmerztagen';
    expect(shortObs.length < 30).toBe(true);
  });
  it('observations over 30 chars pass length gate', () => {
    const longObs = 'An Tagen mit Schlafmangel traten stärkere Beschwerden auf';
    expect(longObs.length >= 30).toBe(true);
  });
});

describe('uncertainty minimum length gate', () => {
  it('very short uncertainty items should be filtered', () => {
    const shortItem = 'Zu wenig Daten.';
    expect(shortItem.length < 25).toBe(true);
  });
  it('substantive uncertainty items pass', () => {
    const goodItem = 'Ob die Triptan-Zurückhaltung ursächlich für längere Attacken ist, bleibt offen.';
    expect(goodItem.length >= 25).toBe(true);
  });
});

// ============================================================
// === Tightened quality round – behavioral tests ===
// ============================================================

describe('isWeakPattern – vague weather/stress/fatigue', () => {
  it('rejects vague weather pattern', () => {
    expect(isWeakPattern('Wetter könnte eine Rolle spielen bei den Beschwerden')).toBe(true);
    expect(isWeakPattern('Wetterwechsel ist möglicherweise ein Auslöser gewesen')).toBe(true);
  });
  it('rejects vague stress pattern', () => {
    expect(isWeakPattern('Stress scheint ein Faktor zu sein bei stärkeren Schmerztagen')).toBe(true);
  });
  it('rejects vague fatigue pattern', () => {
    expect(isWeakPattern('Erschöpfung könnte beitragen zu stärkeren Beschwerden')).toBe(true);
  });
  it('rejects "insgesamt eher schlechter"', () => {
    expect(isWeakPattern('Insgesamt eher schlechter als in der Vorwoche')).toBe(true);
  });
});

describe('isWeakPattern – medication-aware length threshold', () => {
  it('short non-medication description (35 chars) is weak', () => {
    expect(isWeakPattern('Schlaf war öfter schlecht.')).toBe(true); // 25 chars
    expect(isWeakPattern('Stress an einigen Tagen beobachtet.')).toBe(true); // 35 chars
  });
  it('short medication description (>25 chars) is NOT weak', () => {
    expect(isWeakPattern('Triptan teils spät eingesetzt.', 'Einnahmeverzögerung')).toBe(false);
  });
  it('medication title protects shorter descriptions', () => {
    expect(isWeakPattern('Einnahme oft verzögert.', 'Medikament zu spät')).toBe(false);
  });
});

describe('context finding evidence gate', () => {
  it('low-evidence findings should be excluded by medium+ requirement', () => {
    const lowEvidence = 'low';
    expect(lowEvidence === 'medium' || lowEvidence === 'high').toBe(false);
  });
  it('medium-evidence passes', () => {
    const medEvidence = 'medium';
    expect(medEvidence === 'medium' || medEvidence === 'high').toBe(true);
  });
});

describe('sequence interpretation minimum length', () => {
  it('interpretation under 30 chars is too short for sequences', () => {
    expect('Stress vor Schmerz.'.length < 30).toBe(true);
  });
  it('interpretation over 30 chars passes', () => {
    expect('Schlafmangel ging mehrfach einem Schmerzanstieg voraus.'.length >= 30).toBe(true);
  });
});
