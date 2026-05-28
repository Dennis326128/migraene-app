import { describe, it, expect } from 'vitest';
import { curateFindingsV22, applySectionCaps } from '../curateFindingsV22';
import type { NormalizedAnalysisFinding } from '../normalizeAnalysisFindings';

function f(overrides: Partial<NormalizedAnalysisFinding> & { id: string; category: string }): NormalizedAnalysisFinding {
  return {
    id: overrides.id,
    category: overrides.category,
    section: 'strongest',
    title: overrides.title ?? 'T',
    summary: overrides.summary ?? 'S',
    reasoning: overrides.reasoning,
    evidenceLevel: overrides.evidenceLevel ?? 'low',
    limitations: overrides.limitations ?? [],
    recommendedTrackingNext: overrides.recommendedTrackingNext ?? [],
    doctorDiscussionPoints: overrides.doctorDiscussionPoints ?? [],
    source: 'llm_expanded',
    shouldShowInDoctorShare: true,
  };
}

describe('curateFindingsV22', () => {
  it('rewrites unsafe diagnostic phrasing', () => {
    const r = curateFindingsV22([
      f({ id: 'b1', category: 'chronification', title: 'Frequenz erfüllt Kriterien chronische Migräne',
          summary: 'Patient ist chronische Migräne.', evidenceLevel: 'high' }),
    ]);
    const fnd = r.findings[0];
    expect(fnd.title).not.toMatch(/erfüllt Kriterien/i);
    expect(fnd.title).toMatch(/ärztlich/);
    expect(fnd.summary).not.toMatch(/ist chronische Migräne/i);
    expect(fnd.summary).toMatch(/ärztlich/);
  });

  it('hides Voice-event data_quality cards by default', () => {
    const r = curateFindingsV22([
      f({ id: 'v', category: 'data_quality', title: 'Nur 2 Voice-Events', summary: 'Wenige Voice-Events vorhanden' }),
      f({ id: 'w', category: 'data_quality', title: 'Wetterabdeckung', summary: '45/90 Tage' }),
    ]);
    expect(r.findings.map(x => x.id)).toEqual(['w']);
    expect(r.suppressed.find(s => s.id === 'v')?.reason).toBe('voice_quality_noise');
  });

  it('respects showVoiceQualityNotes opt-in', () => {
    const r = curateFindingsV22(
      [f({ id: 'v', category: 'data_quality', title: 'Voice-Events', summary: 'wenige' })],
      undefined,
      { showVoiceQualityNotes: true },
    );
    expect(r.findings).toHaveLength(1);
  });

  it('drops burden when strong chronification finding exists', () => {
    const r = curateFindingsV22([
      f({ id: 'c', category: 'chronification', evidenceLevel: 'high', title: 'Chronifizierung' }),
      f({ id: 'b', category: 'burden', evidenceLevel: 'low', title: 'Krankheitslast' }),
    ]);
    expect(r.findings.map(x => x.id)).toEqual(['c']);
  });

  it('drops triptan interaction when triptan medication_use is strong', () => {
    const r = curateFindingsV22([
      f({ id: 'm', category: 'medication_use', evidenceLevel: 'moderate',
          title: 'Triptan-Zurückhaltung', summary: 'Triptan selten genutzt' }),
      f({ id: 'i', category: 'interaction', evidenceLevel: 'low',
          title: 'Triptan + Schmerzverlauf', summary: 'Triptan später → längerer Schmerz' }),
    ]);
    expect(r.findings.map(x => x.id)).toEqual(['m']);
  });

  it('weather single-source keeps best evidence', () => {
    const r = curateFindingsV22([
      f({ id: 'w1', category: 'weather', evidenceLevel: 'low', title: 'Druck' }),
      f({ id: 'w2', category: 'weather', evidenceLevel: 'moderate', title: 'Temperatur' }),
      f({ id: 'w3', category: 'weather', evidenceLevel: 'low', title: 'Humid' }),
    ]);
    expect(r.findings.map(x => x.id)).toEqual(['w2']);
  });

  it('time_pattern single-source', () => {
    const r = curateFindingsV22([
      f({ id: 't1', category: 'time_pattern', evidenceLevel: 'moderate', title: 'Mittag' }),
      f({ id: 't2', category: 'time_pattern', evidenceLevel: 'low', title: 'Wochenende' }),
    ]);
    expect(r.findings.map(x => x.id)).toEqual(['t1']);
  });

  it('ME/CFS gap rewrite when scores exist on many days', () => {
    const responseJson = { analysisV21: { data_basis: { mecfs_energy_days: 63, documented_days: 90 } } };
    const r = curateFindingsV22(
      [f({ id: 'me', category: 'mecfs_energy_pem', evidenceLevel: 'insufficient',
          title: 'ME/CFS nicht ausreichend dokumentiert',
          summary: 'Keine ausreichende Datenbasis für ME/CFS.' })],
      responseJson,
    );
    expect(r.findings[0].title).toMatch(/Energiesignale/i);
    expect(r.findings[0].evidenceLevel).toBe('moderate');
    expect(r.findings[0].pinToTopical).toBe(true);
    expect(r.findings[0].summary).toMatch(/63 von 90/);
    expect(r.findings[0].limitations.join(' ')).toMatch(/PEM/i);
  });

  it('ME/CFS gap NOT rewritten when few days of data', () => {
    const r = curateFindingsV22(
      [f({ id: 'me', category: 'mecfs_energy_pem', evidenceLevel: 'insufficient',
          title: 'ME/CFS nicht ausreichend dokumentiert', summary: 'Keine Daten' })],
      { analysisV21: { data_basis: { mecfs_energy_days: 2 } } },
    );
    expect(r.findings[0].title).toMatch(/nicht ausreichend/);
  });

  it('caps data_quality to 3 by evidence', () => {
    const items = ['a','b','c','d','e'].map((id, i) =>
      f({ id, category: 'data_quality', title: id, evidenceLevel: i === 0 ? 'low' : 'insufficient' }),
    );
    const r = curateFindingsV22(items);
    expect(r.findings.filter(x => x.category === 'data_quality')).toHaveLength(3);
    expect(r.findings.find(x => x.id === 'a')).toBeDefined(); // best evidence kept
  });

  it('open questions deduplicate by topic and cap to 5', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      f({ id: `f${i}`, category: 'medication_use', evidenceLevel: 'moderate',
          title: `T${i}`, doctorDiscussionPoints: [`Frage Nummer ${i}`] }),
    );
    // add duplicates
    items.push(f({ id: 'dup', category: 'weather', evidenceLevel: 'high',
      doctorDiscussionPoints: ['Frage Nummer 0', 'Frage Nummer 1'] }));
    const r = curateFindingsV22(items);
    expect(r.openQuestions.length).toBeLessThanOrEqual(5);
    // first item should be from highest evidence (weather high)
    expect(r.openQuestions[0]).toBe('Frage Nummer 0');
  });

  it('does not include data_quality discussion points in open questions', () => {
    const r = curateFindingsV22([
      f({ id: 'dq', category: 'data_quality', title: 'Lücke',
          doctorDiscussionPoints: ['Bitte Schlaf erfassen'] }),
      f({ id: 'm', category: 'medication_use', evidenceLevel: 'high',
          doctorDiscussionPoints: ['Akutstrategie besprechen'] }),
    ]);
    expect(r.openQuestions).toEqual(['Akutstrategie besprechen']);
  });
});

describe('applySectionCaps', () => {
  it('caps strongest to 4 by evidence', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      evidenceLevel: (i < 2 ? 'high' : 'low') as NormalizedAnalysisFinding['evidenceLevel'],
      id: `x${i}`,
    }));
    const out = applySectionCaps('strongest', items);
    expect(out).toHaveLength(4);
    // highest-evidence kept
    expect(out.filter(o => o.evidenceLevel === 'high')).toHaveLength(2);
  });

  it('does not touch uncapped sections', () => {
    const items = Array.from({ length: 8 }, () => ({ evidenceLevel: 'low' as const, id: 'x' }));
    expect(applySectionCaps('medication', items)).toHaveLength(8);
  });
});

describe('curateFindingsV22 — V2.2 hardening', () => {
  it('rewrites plural "erfüllen die Kriterien für chronische Migräne"', () => {
    const r = curateFindingsV22([
      f({ id: 'c', category: 'chronification', evidenceLevel: 'high',
          title: 'Häufigkeit',
          summary: 'Die Schmerzeinträge erfüllen die Kriterien für chronische Migräne.',
          doctorDiscussionPoints: ['Mögliche Diagnose chronische Migräne abklären'] }),
    ]);
    const fnd = r.findings[0];
    expect(fnd.summary).not.toMatch(/erfüllen\s+die\s+Kriterien/i);
    expect(fnd.summary).toMatch(/ärztlich/);
    expect(r.openQuestions[0]).not.toMatch(/Diagnose chronische Migräne/i);
    expect(r.openQuestions[0]).toMatch(/ärztlich/);
  });

  it('strips "100% Korrelation" wording', () => {
    const r = curateFindingsV22([
      f({ id: 'w', category: 'weather', evidenceLevel: 'moderate',
          summary: '100% Korrelation mit Schmerztagen.' }),
    ]);
    expect(r.findings[0].summary).not.toMatch(/100\s?%/);
  });

  it('downgrades weather to insufficient when pain ratio > 0.9', () => {
    const rj = { analysisV21: { data_basis: { pain_days: 89, documented_days: 90 } } };
    const r = curateFindingsV22([
      f({ id: 'w', category: 'weather', evidenceLevel: 'moderate',
          title: 'Druckabfall', summary: 'Druckabfälle fallen mit Schmerztagen zusammen.',
          doctorDiscussionPoints: ['Wetterprävention besprechen'] }),
    ], rj);
    expect(r.findings[0].evidenceLevel).toBe('insufficient');
    expect(r.findings[0].summary).toMatch(/Wetteranalyse bleibt vorsichtig/);
    expect(r.findings[0].summary).not.toMatch(/Mangel an schmerzfreien/i);
    expect(r.findings[0].summary).not.toMatch(/fehlende schmerzfreie/i);
    expect(r.openQuestions).toHaveLength(0);
  });

  it('pins localization-only symptoms_aura to topical and excludes from open questions', () => {
    const r = curateFindingsV22([
      f({ id: 's', category: 'symptoms_aura', evidenceLevel: 'moderate',
          title: 'Primäre Schmerzlokalisation Stirn und Nacken',
          summary: 'Stirn/Nacken häufig betroffen.',
          doctorDiscussionPoints: ['Nackenbeteiligung besprechen'] }),
    ]);
    const fnd = r.findings[0];
    expect(fnd.pinToTopical).toBe(true);
    expect(fnd.title).toBe('Häufige Schmerzorte');
    expect(r.openQuestions).toHaveLength(0);
  });

  it('dedup: PEM-gap rewrite removes other "ME/CFS nicht dokumentiert" findings', () => {
    const rj = { analysisV21: { data_basis: { mecfs_energy_days: 63, documented_days: 90 } } };
    const r = curateFindingsV22([
      f({ id: 'me1', category: 'mecfs_energy_pem', evidenceLevel: 'insufficient',
          title: 'ME/CFS nicht ausreichend dokumentiert', summary: 'Keine ausreichende Datenbasis.' }),
      f({ id: 'me2', category: 'mecfs_energy_pem', evidenceLevel: 'insufficient',
          title: 'Mangelnde ME/CFS-Dokumentation', summary: 'ME/CFS nicht dokumentiert.' }),
    ], rj);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].title).toMatch(/Energiesignale/);
  });
});

describe('curateFindingsV22 — V2.2 UX hardening', () => {
  it('drops red_flag findings entirely', () => {
    const r = curateFindingsV22([
      f({ id: 'rf', category: 'red_flag', evidenceLevel: 'high',
          title: 'Dringende Abklärung', summary: 'Warnzeichen.' }),
      f({ id: 'c', category: 'chronification', evidenceLevel: 'high', title: 'Chron' }),
    ]);
    expect(r.findings.map(x => x.id)).toEqual(['c']);
    expect(r.suppressed.find(s => s.id === 'rf')?.reason).toBe('red_flag_hidden');
  });

  it('pins medication_use to topical so it does NOT land in strongest', () => {
    const r = curateFindingsV22([
      f({ id: 'm', category: 'medication_use', evidenceLevel: 'moderate',
          title: 'Akutmedikation – Einnahmen im Zeitraum' }),
    ]);
    expect(r.findings[0].pinToTopical).toBe(true);
  });

  it('pins time_pattern to topical so it does NOT pollute weaker', () => {
    const r = curateFindingsV22([
      f({ id: 't', category: 'time_pattern', evidenceLevel: 'low',
          title: 'Kein klares zeitliches Muster' }),
    ]);
    expect(r.findings[0].pinToTopical).toBe(true);
  });

  it('chronification stays routable to strongest (not pinned)', () => {
    const r = curateFindingsV22([
      f({ id: 'c', category: 'chronification', evidenceLevel: 'high', title: 'Chron' }),
    ]);
    expect(r.findings[0].pinToTopical).toBeFalsy();
  });
});

describe('curateFindingsV22 — Phase 1b wording & dedup', () => {
  const rjHighPain = { analysisV21: { data_basis: { pain_days: 29, documented_days: 30 } } };

  it('merges burden + chronification into single high-pain card at painRatio ≥ 0.85', () => {
    const r = curateFindingsV22([
      f({ id: 'b', category: 'burden', evidenceLevel: 'moderate',
          title: 'Sehr hohe Schmerzlast im gesamten Zeitraum',
          summary: '29 Schmerztage von 30.' }),
      f({ id: 'c', category: 'chronification', evidenceLevel: 'high',
          title: 'Sehr hohe Schmerzfrequenz deutet auf Chronifizierungstendenz hin',
          summary: 'Frequenz deutet auf chronische Migräne hin.',
          doctorDiscussionPoints: ['Chronifizierung abklären'] }),
    ], rjHighPain);
    const burdenCards = r.findings.filter(x => x.category === 'burden');
    const chronCards = r.findings.filter(x => x.category === 'chronification');
    expect(burdenCards).toHaveLength(1);
    expect(chronCards).toHaveLength(0);
    expect(burdenCards[0].title).toBe('Sehr hohe Schmerzlast im gesamten Zeitraum');
    expect(burdenCards[0].summary).toMatch(/29 von 30 Tagen/);
    expect(burdenCards[0].summary).toMatch(/ärztlich eingeordnet/);
    expect(burdenCards[0].doctorDiscussionPoints[0]).toMatch(/chronische Verlaufsform/);
  });

  it('rewrites diagnostic phrasings: "bereits bestehende" / "Diagnose" / "deutet auf chronische Migräne hin"', () => {
    const r = curateFindingsV22([
      f({ id: 'a', category: 'chronification', evidenceLevel: 'high',
          title: 'Hinweis auf bereits bestehende chronische Migräne',
          summary: 'Frequenz deutet auf chronische Migräne hin. Diagnose stellen.' }),
    ]);
    const out = r.findings[0];
    const combined = `${out.title} ${out.summary}`;
    expect(combined).not.toMatch(/bereits bestehende chronische Migräne/i);
    expect(combined).not.toMatch(/deutet auf chronische Migräne hin/i);
    expect(combined).not.toMatch(/Kriterium für chronische Migräne/i);
    expect(combined).not.toMatch(/\bDiagnose\b/);
    expect(combined).toMatch(/chronische Verlaufsform/i);
  });

  it('suppresses negative data_quality cards when friendly Dokumentationsfazit exists', () => {
    const r = curateFindingsV22([
      f({ id: 'data_quality.diary_coverage', category: 'data_quality',
          evidenceLevel: 'moderate',
          title: 'Dokumentationsfazit',
          summary: 'Du hast an 30 von 30 Tagen Einträge dokumentiert. Gute Grundlage.' }),
      f({ id: 'dq2', category: 'data_quality', evidenceLevel: 'insufficient',
          title: 'Mangel an Detaildaten zu Tagesfaktoren und Symptomen',
          summary: 'Es fehlen Tagesfaktoren.' }),
      f({ id: 'dq3', category: 'data_quality', evidenceLevel: 'insufficient',
          title: 'Mangel an schmerzfreien Vergleichstagen',
          summary: 'Fehlende schmerzfreie Tage.' }),
      f({ id: 'dq4', category: 'data_quality', evidenceLevel: 'insufficient',
          title: 'Datenlage zu Stress macht Analyse unmöglich',
          summary: 'Unzureichende Stress-Daten.' }),
    ], rjHighPain);
    const dq = r.findings.filter(x => x.category === 'data_quality');
    expect(dq).toHaveLength(1);
    expect(dq[0].id).toBe('data_quality.diary_coverage');
    expect(r.suppressed.filter(s => s.reason === 'documentation_summary_supersedes')).toHaveLength(3);
  });

  it('weather at high pain ratio uses "low" with soft wording, no comparison-day asks', () => {
    const r = curateFindingsV22([
      f({ id: 'w', category: 'weather', evidenceLevel: 'moderate',
          title: 'Druckabfall', summary: 'Druckabfälle fallen mit Schmerztagen zusammen.',
          limitations: ['Wenige schmerzfreie Vergleichstage – Aussagen bleiben vorsichtig.'],
          recommendedTrackingNext: ['Schmerzfreie Tage dokumentieren'],
          doctorDiscussionPoints: ['Wetter besprechen'] }),
    ], rjHighPain);
    const w = r.findings[0];
    expect(w.evidenceLevel).toBe('low');
    expect(w.summary).toMatch(/möglicher Verstärkungsfaktor/);
    const joined = [w.summary, ...w.limitations, ...w.recommendedTrackingNext].join(' ');
    expect(joined).not.toMatch(/schmerzfreie Tage dokumentieren/i);
    expect(joined).not.toMatch(/schmerzfreie Vergleichstage fehlen/i);
    expect(joined).not.toMatch(/maskiert mögliche Wettereinflüsse/i);
    expect(w.recommendedTrackingNext[0]).toMatch(/Subjektive Wetterempfindungen/);
    expect(r.openQuestions).toHaveLength(0);
  });

  it('open questions stay capped at 5 with no duplicate chronification questions', () => {
    const r = curateFindingsV22([
      f({ id: 'b', category: 'burden', evidenceLevel: 'moderate', title: 'Last',
          doctorDiscussionPoints: ['Hohe Kopfschmerzfrequenz ärztlich besprechen'] }),
      f({ id: 'c', category: 'chronification', evidenceLevel: 'high', title: 'Chron',
          doctorDiscussionPoints: ['Hohe Kopfschmerzfrequenz ärztlich besprechen', 'Chronifizierung besprechen'] }),
      f({ id: 'm', category: 'medication_use', evidenceLevel: 'high',
          doctorDiscussionPoints: ['Akutmedikation besprechen'] }),
    ], rjHighPain);
    expect(r.openQuestions.length).toBeLessThanOrEqual(5);
    const lowered = r.openQuestions.map(q => q.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });
});




