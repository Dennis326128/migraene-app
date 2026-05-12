import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { postprocessExpandedFindings } from './index.ts';

const detIds = new Set(['weather.pressure_drop', 'medication.acute_intakes']);

Deno.test('postprocess: keeps valid findings and dedupes', () => {
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
      // duplicate by category+title
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
      // missing reasoning, not data_gap → drop
      {
        id: 'a', category: 'sleep', title: 'Schlaf', evidence_level: 'low',
        source_basis: 'aggregated_daily_data', related_deterministic_finding_ids: [],
        summary: 'x', reasoning: '',
        limitations: [], patient_relevance: 'low', doctor_relevance: 'low',
        recommended_tracking_next: [], doctor_discussion_points: [],
      },
      // data_gap with empty reasoning is allowed
      {
        id: 'b', category: 'sleep', title: 'Schlafdaten fehlen', evidence_level: 'high',
        source_basis: 'data_gap', related_deterministic_finding_ids: [],
        summary: 'Keine Schlafdaten dokumentiert.', reasoning: '',
        limitations: [], patient_relevance: 'low', doctor_relevance: 'low',
        recommended_tracking_next: [], doctor_discussion_points: [],
      },
    ],
    detIds,
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].id, 'b');
  // data_gap forces evidence_level to insufficient
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
