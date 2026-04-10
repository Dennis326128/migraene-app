/**
 * Data Quality Tests for Voice Pipeline
 * 
 * Tests not just routing/classification, but the QUALITY of extracted data:
 * - structured_data content
 * - temporal marker extraction
 * - ME/CFS signal detection
 * - causal link recognition
 * - everyday entity extraction
 */

import { describe, it, expect } from 'vitest';
import { parseEverydayContent, type EverydayParseResult } from '../everydayParser';
import { classifyVoiceEvent } from '../eventClassifier';

// ============================================================
// Helper
// ============================================================

function parse(text: string): EverydayParseResult {
  return parseEverydayContent(text);
}

function entityValues(result: EverydayParseResult): string[] {
  return result.entities.map(e => e.value);
}

function entityCategories(result: EverydayParseResult): string[] {
  return [...new Set(result.entities.map(e => e.category))];
}

function timeTypes(result: EverydayParseResult): string[] {
  return result.timeReferences.map(t => t.type);
}

function timeHints(result: EverydayParseResult): (string | undefined)[] {
  return result.timeReferences.map(t => t.normalizedHint);
}

// ============================================================
// A) Everyday Entity Extraction Quality
// ============================================================

describe('Everyday Entity Extraction', () => {
  it('extracts food/drink from natural sentences', () => {
    const r = parse('Ich habe Kaffee getrunken und etwas gegessen');
    expect(entityValues(r)).toContain('kaffee');
    expect(entityValues(r)).toContain('getrunken');
    expect(entityCategories(r)).toContain('food_drink');
  });

  it('extracts activity from "War eben duschen"', () => {
    const r = parse('War eben duschen und jetzt komplett platt');
    expect(entityValues(r)).toContain('duschen');
    expect(entityCategories(r)).toContain('activity');
    expect(entityCategories(r)).toContain('mecfs_state');
  });

  it('extracts environment signals', () => {
    const r = parse('Licht im Supermarkt war schlimm');
    expect(entityCategories(r)).toContain('environment');
  });

  it('extracts rest/sleep', () => {
    const r = parse('Habe schlecht geschlafen');
    expect(entityValues(r)).toContain('schlecht_geschlafen');
    expect(entityCategories(r)).toContain('sleep_rest');
  });

  it('extracts multiple categories from mixed input', () => {
    const r = parse('Kaffee getrunken, danach spazieren, jetzt platt');
    const cats = entityCategories(r);
    expect(cats).toContain('food_drink');
    expect(cats).toContain('activity');
    expect(cats).toContain('mecfs_state');
  });

  it('extracts "etwas gegessen"', () => {
    const r = parse('Ich habe etwas gegessen');
    expect(entityValues(r)).toContain('etwas_gegessen');
  });

  it('extracts "lege mich hin" as rest', () => {
    const r = parse('Lege mich hin');
    expect(entityCategories(r)).toContain('sleep_rest');
  });

  it('extracts "Es ist laut und hell hier"', () => {
    const r = parse('Es ist laut und hell hier');
    expect(entityCategories(r)).toContain('environment');
    expect(entityValues(r)).toContain('laut');
  });
});

// ============================================================
// B) Temporal Marker Extraction
// ============================================================

describe('Temporal Marker Extraction', () => {
  it('detects "gerade" as now', () => {
    const r = parse('Mir ist gerade übel');
    expect(timeTypes(r)).toContain('now');
  });

  it('detects "jetzt" as now', () => {
    const r = parse('Bin jetzt platt');
    expect(timeTypes(r)).toContain('now');
  });

  it('detects "eben" as recent', () => {
    const r = parse('War eben duschen');
    expect(timeTypes(r)).toContain('recent');
  });

  it('detects "vorhin" as recent', () => {
    const r = parse('Vorhin Kaffee getrunken');
    expect(timeTypes(r)).toContain('recent');
  });

  it('detects "seit heute morgen" as absolute', () => {
    const r = parse('Seit heute morgen Brain Fog');
    expect(timeTypes(r)).toContain('absolute');
    expect(timeHints(r)).toContain('seit_tageszeit');
  });

  it('detects "nach dem Duschen" as sequential', () => {
    const r = parse('Nach dem Duschen komplett platt');
    expect(timeTypes(r)).toContain('sequential');
    expect(timeHints(r)).toContain('nach_aktivität');
  });

  it('detects "später" as sequential', () => {
    const r = parse('Kaffee getrunken, später Kopfdruck');
    expect(timeTypes(r)).toContain('sequential');
  });

  it('detects "danach" as sequential', () => {
    const r = parse('Einkaufen gewesen, danach total platt');
    expect(timeTypes(r)).toContain('sequential');
  });

  it('detects "seit stunden" as relative', () => {
    const r = parse('Seit Stunden Druck im Kopf');
    expect(timeTypes(r)).toContain('relative');
    expect(timeHints(r)).toContain('seit_stunden');
  });

  it('detects "vor dem Schlafen" as sequential', () => {
    const r = parse('Vor dem Schlafen noch was genommen');
    expect(timeTypes(r)).toContain('sequential');
  });

  it('detects "beim Aufstehen" as sequential', () => {
    const r = parse('Beim Aufstehen total benommen');
    expect(timeTypes(r)).toContain('sequential');
    expect(timeHints(r)).toContain('während_aktivität');
  });
});

// ============================================================
// C) Causal Link Detection
// ============================================================

describe('Causal Link Detection', () => {
  it('detects "nach dem Duschen komplett platt"', () => {
    const r = parse('Nach dem Duschen komplett platt');
    expect(r.causalLinks.length).toBeGreaterThanOrEqual(1);
    expect(r.summary.hasCausalHint).toBe(true);
  });

  it('detects "Kaffee getrunken und jetzt Kopfdruck"', () => {
    const r = parse('Kaffee getrunken und jetzt Kopfdruck');
    expect(r.causalLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('detects "X, später Y"', () => {
    const r = parse('Kaffee getrunken, später Kopfdruck');
    expect(r.causalLinks.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// D) ME/CFS Signal Detection Quality
// ============================================================

describe('ME/CFS Signal Detection', () => {
  it('detects severe state "komplett platt"', () => {
    const r = parse('Bin komplett platt');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.severity).toBe('severe');
    expect(r.mecfsSignals?.state).toBe('komplett_platt');
  });

  it('detects moderate state "brainfog"', () => {
    const r = parse('Brain Fog seit heute morgen');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.severity).toBe('moderate');
  });

  it('detects PEM pattern: activity + exhaustion', () => {
    const r = parse('Nach dem Duschen komplett platt');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.trigger).toBe('duschen');
    expect(r.mecfsSignals?.pemSuggested).toBe(true);
  });

  it('detects PEM pattern: einkaufen + matschig', () => {
    const r = parse('Nach dem Einkaufen total matschig');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.trigger).toBe('einkaufen');
  });

  it('detects crash state', () => {
    const r = parse('Ich habe einen Crash');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.severity).toBe('severe');
  });

  it('detects "nicht belastbar" as severe', () => {
    const r = parse('Heute nicht belastbar');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.severity).toBe('severe');
  });

  it('detects "reizüberflutet"', () => {
    const r = parse('Bin total reizüberflutet');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.severity).toBe('severe');
  });

  it('detects "musste mich hinlegen"', () => {
    const r = parse('Musste mich hinlegen');
    const cats = entityCategories(r);
    expect(cats).toContain('sleep_rest');
  });

  it('handles "komplett erledigt"', () => {
    const r = parse('Bin komplett erledigt');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.severity).toBe('severe');
  });

  it('handles "crashig"', () => {
    const r = parse('Fühle mich total crashig');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.severity).toBe('severe');
  });

  it('detects activity trigger in "nach dem termin völlig platt"', () => {
    const r = parse('Nach dem Termin völlig platt');
    expect(r.mecfsSignals?.trigger).toBe('termin');
    expect(r.mecfsSignals?.pemSuggested).toBe(true);
  });
});

// ============================================================
// E) Summary Quality
// ============================================================

describe('Summary / structured_data quality', () => {
  it('produces correct summary for everyday input', () => {
    const r = parse('Kaffee getrunken');
    expect(r.summary.categories).toContain('food_drink');
    expect(r.summary.hasMecfsSignal).toBe(false);
    expect(r.summary.primaryCategory).toBe('food_drink');
  });

  it('prioritizes mecfs_state in primaryCategory', () => {
    const r = parse('Nach dem Spazieren total platt');
    expect(r.summary.primaryCategory).toBe('mecfs_state');
    expect(r.summary.hasMecfsSignal).toBe(true);
  });

  it('includes time reference flag', () => {
    const r = parse('Seit heute morgen Brain Fog');
    expect(r.summary.hasTimeReference).toBe(true);
  });

  it('includes causal hint flag', () => {
    const r = parse('Kaffee getrunken, später Kopfdruck');
    expect(r.summary.hasCausalHint).toBe(true);
  });

  it('multi-category summary is complete', () => {
    const r = parse('Kaffee getrunken, danach spazieren, jetzt platt');
    expect(r.summary.categories.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// F) Colloquial / realistic phrasing
// ============================================================

describe('Colloquial German phrasing', () => {
  it('"irgendwie matschig heute"', () => {
    const r = parse('irgendwie matschig heute');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.state).toBe('matschig');
  });

  it('"war kurz draußen, jetzt nicht gut"', () => {
    const r = parse('war kurz draußen, jetzt nicht gut');
    expect(entityCategories(r)).toContain('activity');
    expect(entityCategories(r)).toContain('mecfs_state');
    expect(timeTypes(r)).toContain('now');
  });

  it('"nach dem duschen komplett kaputt"', () => {
    const r = parse('nach dem duschen komplett kaputt');
    expect(r.mecfsSignals?.trigger).toBe('duschen');
    expect(r.mecfsSignals?.pemSuggested).toBe(true);
  });

  it('"heute alles bisschen zu viel"', () => {
    // Should be classified at least as stress
    const cls = classifyVoiceEvent('heute alles bisschen zu viel');
    expect(cls.isMeaningful).toBe(true);
    expect(cls.classifications.some(c => c.type === 'stress_overload')).toBe(true);
  });

  it('"habe kaffee getrunken, jetzt drückt der kopf"', () => {
    const r = parse('habe kaffee getrunken, jetzt drückt der kopf');
    expect(entityValues(r)).toContain('kaffee');
    expect(timeTypes(r)).toContain('now');
    // Classification should detect pain
    const cls = classifyVoiceEvent('habe kaffee getrunken, jetzt drückt der kopf');
    expect(cls.classifications.some(c => c.type === 'pain')).toBe(true);
    expect(cls.classifications.some(c => c.type === 'food_drink')).toBe(true);
  });

  it('"bin voll platt"', () => {
    const r = parse('bin voll platt');
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.severity).toBe('severe');
  });

  it('"seit heute morgen irgendwie daneben"', () => {
    const r = parse('seit heute morgen irgendwie daneben');
    expect(r.summary.hasTimeReference).toBe(true);
    expect(r.mecfsSignals).toBeDefined();
    expect(r.mecfsSignals?.state).toBe('daneben');
  });

  it('"licht hier ist schlimm"', () => {
    const r = parse('licht hier ist schlimm');
    expect(entityCategories(r)).toContain('environment');
  });

  it('"nach dem spazieren komplett erledigt"', () => {
    const r = parse('nach dem spazieren komplett erledigt');
    expect(r.mecfsSignals?.trigger).toBe('spaziergang');
    expect(r.mecfsSignals?.pemSuggested).toBe(true);
  });
});

// ============================================================
// G) Classification + Everyday combined quality check
// ============================================================

describe('Classification + Everyday combined', () => {
  it('"Sumatriptan genommen und hingelegt" → medication + rest, with entities', () => {
    const cls = classifyVoiceEvent('Sumatriptan genommen und hingelegt');
    expect(cls.classifications.some(c => c.type === 'medication')).toBe(true);
    expect(cls.classifications.some(c => c.type === 'sleep_rest')).toBe(true);
    
    const r = parse('Sumatriptan genommen und hingelegt');
    expect(entityCategories(r)).toContain('sleep_rest');
  });

  it('"Licht im Supermarkt schlimm, danach Migräne rechts" → environment + pain + causal', () => {
    const cls = classifyVoiceEvent('Licht im Supermarkt schlimm, danach Migräne rechts');
    expect(cls.classifications.some(c => c.type === 'pain')).toBe(true);
    expect(cls.classifications.some(c => c.type === 'environment')).toBe(true);
    
    const r = parse('Licht im Supermarkt schlimm, danach Migräne rechts');
    expect(r.summary.hasTimeReference).toBe(true);
  });

  it('"geduscht, komplett erledigt, brain fog" → activity + mecfs + multiple signals', () => {
    const r = parse('geduscht, komplett erledigt, brain fog');
    expect(entityCategories(r)).toContain('activity');
    expect(entityCategories(r)).toContain('mecfs_state');
    expect(r.mecfsSignals).toBeDefined();
  });
});
