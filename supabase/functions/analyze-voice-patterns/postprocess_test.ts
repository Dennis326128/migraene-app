import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { postprocessExpandedFindings, MAX_EXPANDED_FINDINGS } from './postprocess.ts';

const detIds = new Set(['weather.pressure_drop', 'medication.acute_intakes']);

Deno.test('postprocess: keeps valid findings and dedupes by title', () => {
  const out = postprocessExpandedFindings(
    [
      {
        id: 'weather.llm.1', category: 'weather', title: 'Druckabfall fällt mit Schmerztagen zusammen',
        evidence_level: 'low', source_basis: 'deterministic_finding',
        related_deterministic_finding_ids: ['weather.pressure_drop', 'unknown.id'],
        summary: 'An Tagen mit Druckabfall häufen sich Schmerzeinträge.',
        reasoning: 'Aus deterministischem Finding weather.pressure_drop abgeleitet.',
        limitations: ['Wenige Vergleichstage.'],
        patient_relevance: 'medium', doctor_relevance: 'medium',
        recommended_tracking_next: ['Weiter dokumentieren'], doctor_discussion_points: [],
      },
      {
        id: 'weather.llm.dup', category: 'weather', title: 'Druckabfall fällt mit Schmerztagen zusammen',
        evidence_level: 'low', source_basis: 'preanalysis',
        related_deterministic_finding_ids: [],
        summary: 'dup', reasoning: 'dup',
        limitations: [], patient_relevance: 'low', doctor_relevance: 'low',
        recommended_tracking_next: [], doctor_discussion_points: [],
      },
    ],
    detIds,
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].related_deterministic_finding_ids, ['weather.pressure_drop']);
});

Deno.test('postprocess: drops findings without basis except data_gap', () => {
  const out = postprocessExpandedFindings(
    [
      {
        id: 'a', category: 'sleep', title: 'Schlaf', evidence_level: 'low',
        source_basis: 'aggregated_daily_data', related_deterministic_finding_ids: [],
        summary: 'x', reasoning: '',
        limitations: [], patient_relevance: 'low', doctor_relevance: 'low',
        recommended_tracking_next: [], doctor_discussion_points: [],
      },
      {
        id: 'b', category: 'sleep', title: 'Schlafdaten fehlen', evidence_level: 'high',
        source_basis: 'data_gap', related_deterministic_finding_ids: [],
        summary: 'Keine Schlafdaten dokumentiert.', reasoning: '',
        limitations: [], patient_relevance: 'low', doctor_relevance: 'low',
        recommended_tracking_next: ['Schlafdauer erfassen'], doctor_discussion_points: [],
      },
    ],
    detIds,
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].id, 'b');
  assertEquals(out[0].evidence_level, 'insufficient');
});

Deno.test('postprocess: invalid category falls back to data_quality', () => {
  const out = postprocessExpandedFindings(
    [
      {
        id: 'x', category: 'not_a_category', title: 'Test',
        evidence_level: 'low', source_basis: 'aggregated_daily_data',
        related_deterministic_finding_ids: [],
        summary: 'sum', reasoning: 'reason here',
        limitations: [], patient_relevance: 'low', doctor_relevance: 'low',
        recommended_tracking_next: [], doctor_discussion_points: [],
      },
    ],
    detIds,
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].category, 'data_quality');
});

Deno.test('postprocess: downgrades deterministic_finding without ids to preanalysis when reasoning is substantive', () => {
  const out = postprocessExpandedFindings(
    [
      {
        id: 'pa.1', category: 'mecfs_energy_pem', title: 'PEM-Hinweis',
        evidence_level: 'low', source_basis: 'deterministic_finding',
        related_deterministic_finding_ids: ['not.matching'],
        summary: 'PEM-Muster T+1/T+2 nach Belastung sichtbar.',
        reasoning: 'Aggregierte Tagesdaten zeigen Belastungstage gefolgt von Crash-Markern auf T+1.',
        limitations: [], patient_relevance: 'medium', doctor_relevance: 'medium',
        recommended_tracking_next: ['Energie T-1/T-2 dokumentieren'],
        doctor_discussion_points: ['Wie ist die Belastungsverträglichkeit?'],
      },
    ],
    detIds,
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].source_basis, 'preanalysis');
});

Deno.test('postprocess: dedupes by normalized summary across different titles', () => {
  const out = postprocessExpandedFindings(
    [
      {
        id: 'a', category: 'sleep', title: 'Schlafmuster',
        evidence_level: 'low', source_basis: 'aggregated_daily_data',
        related_deterministic_finding_ids: [],
        summary: 'Die Schlafdauer schwankt stark zwischen den Tagen.',
        reasoning: 'Aus Tagesfaktoren-Aggregaten abgeleitet.',
        limitations: [], patient_relevance: 'low', doctor_relevance: 'low',
        recommended_tracking_next: ['Schlafdauer erfassen'], doctor_discussion_points: [],
      },
      {
        id: 'b', category: 'sleep', title: 'Andere Überschrift',
        evidence_level: 'low', source_basis: 'aggregated_daily_data',
        related_deterministic_finding_ids: [],
        summary: 'Die Schlafdauer schwankt stark zwischen den Tagen!',
        reasoning: 'Selbe Beobachtung anders verpackt.',
        limitations: [], patient_relevance: 'low', doctor_relevance: 'low',
        recommended_tracking_next: ['x'], doctor_discussion_points: [],
      },
    ],
    detIds,
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].id, 'a');
});

Deno.test('postprocess: caps at MAX_EXPANDED_FINDINGS (24)', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({
    id: `f.${i}`, category: 'sleep', title: `Titel ${i}`,
    evidence_level: 'low', source_basis: 'aggregated_daily_data',
    related_deterministic_finding_ids: [],
    summary: `Aussage ${i}`,
    reasoning: 'Begründung mit ausreichend Länge.',
    limitations: [], patient_relevance: 'low', doctor_relevance: 'low',
    recommended_tracking_next: ['x'], doctor_discussion_points: [],
  }));
  const out = postprocessExpandedFindings(items, detIds);
  assertEquals(out.length, MAX_EXPANDED_FINDINGS);
});

Deno.test('postprocess: normalizes missing tracking/discussion arrays to []', () => {
  const out = postprocessExpandedFindings(
    [
      {
        id: 'q', category: 'data_quality', title: 'Dokulücke',
        evidence_level: 'insufficient', source_basis: 'data_gap',
        related_deterministic_finding_ids: [],
        summary: 'Wenige Tage dokumentiert.', reasoning: '',
        // recommended_tracking_next + doctor_discussion_points fehlen ganz
      } as any,
    ],
    detIds,
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].recommended_tracking_next, []);
  assertEquals(out[0].doctor_discussion_points, []);
});
