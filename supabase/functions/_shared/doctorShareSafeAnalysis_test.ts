import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  getDoctorShareSafeAnalysis,
  evaluateShareReAnalyzeGate,
} from './doctorShareSafeAnalysis.ts';

Deno.test('getDoctorShareSafeAnalysis: returns null without analysisV21', () => {
  assertEquals(getDoctorShareSafeAnalysis(null), null);
  assertEquals(getDoctorShareSafeAnalysis({ possiblePatterns: [] }), null);
});

Deno.test('getDoctorShareSafeAnalysis: strips private keys + filters findings', () => {
  const safe = getDoctorShareSafeAnalysis({
    analysisV21: {
      _preAnalysis: { secret: 1 },
      _legacy: {},
      transcripts: ['x'],
      audio_url: 'https://',
      data_basis: { documented_days: 5 },
      clinical_caution: { no_diagnosis: true },
      section_map: {},
      findings: [
        { id: 'a', should_show_in_doctor_share: true, title: 'A' },
        { id: 'b', should_show_in_doctor_share: false, title: 'B' },
      ],
      llm_expanded_findings: [
        { id: 'l1', category: 'red_flag', title: 'R' },
        { id: 'l2', category: 'weather', title: 'W' },
      ],
    },
  });
  if (!safe) throw new Error('expected safe payload');
  const v21 = safe.analysisV21 as any;
  assertEquals(v21._preAnalysis, undefined);
  assertEquals(v21._legacy, undefined);
  assertEquals(v21.transcripts, undefined);
  assertEquals(v21.audio_url, undefined);
  assertEquals(v21.findings.map((f: any) => f.id), ['a']);
  assertEquals(v21.llm_expanded_findings.map((f: any) => f.id), ['l2']);
});

Deno.test('evaluateShareReAnalyzeGate: blocks inside cooldown', () => {
  const last = new Date(Date.now() - 2 * 60_000).toISOString();
  const r = evaluateShareReAnalyzeGate({ lastCreatedAtISO: last });
  assertEquals(r.allowed, false);
  assertEquals(r.reason, 'cooldown_active');
});

Deno.test('evaluateShareReAnalyzeGate: allows after cooldown', () => {
  const last = new Date(Date.now() - 20 * 60_000).toISOString();
  const r = evaluateShareReAnalyzeGate({ lastCreatedAtISO: last });
  assertEquals(r.allowed, true);
  assertEquals(r.reason, 'cooldown_passed');
});

Deno.test('evaluateShareReAnalyzeGate: allows when no prior report', () => {
  const r = evaluateShareReAnalyzeGate({ lastCreatedAtISO: null });
  assertEquals(r.allowed, true);
  assertEquals(r.reason, 'no_existing_report');
});
