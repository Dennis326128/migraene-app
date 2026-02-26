import { describe, it, expect } from 'vitest';
import { buildLimitMessageParts, getLimitStatus } from '../medicationLimitStatus';

describe('buildLimitMessageParts — structured 2-paragraph output', () => {
  it('warning: renders statusLine + detailLine with remaining count', () => {
    const parts = buildLimitMessageParts('warning', 9, 10, 'month', 'Ibuprofen 400mg');
    expect(parts).not.toBeNull();
    expect(parts!.title).toBe('Limit bald erreicht');
    expect(parts!.statusLine).toContain('9/10');
    expect(parts!.statusLine).toContain('30 Tagen');
    expect(parts!.detailLine).toContain('Noch 1');
    expect(parts!.detailLine).toContain('Limit von 10');
  });

  it('reached: renders statusLine + detailLine with medName and count', () => {
    const parts = buildLimitMessageParts('reached', 10, 10, 'month', 'Sumatriptan');
    expect(parts).not.toBeNull();
    expect(parts!.title).toBe('Limit erreicht');
    expect(parts!.statusLine).toContain('10');
    expect(parts!.statusLine).toContain('erreicht');
    expect(parts!.detailLine).toContain('Sumatriptan');
    expect(parts!.detailLine).toContain('10 Einnahmen');
  });

  it('exceeded: renders statusLine + detailLine with medName and count', () => {
    const parts = buildLimitMessageParts('exceeded', 13, 10, 'month', 'Ibuprofen');
    expect(parts).not.toBeNull();
    expect(parts!.title).toBe('Limit überschritten');
    expect(parts!.statusLine).toContain('überschritten');
    expect(parts!.detailLine).toContain('Ibuprofen');
    expect(parts!.detailLine).toContain('13 Einnahmen');
  });

  it('safe: returns null', () => {
    expect(buildLimitMessageParts('safe', 3, 10, 'month', 'X')).toBeNull();
  });

  it('week period uses 7 Tagen', () => {
    const parts = buildLimitMessageParts('warning', 4, 5, 'week', 'Med');
    expect(parts!.statusLine).toContain('7 Tagen');
  });

  it('day period uses 1 Tagen', () => {
    const parts = buildLimitMessageParts('reached', 3, 3, 'day', 'Med');
    expect(parts!.statusLine).toContain('heute');
  });

  it('all 3 states produce exactly 2 text parts (statusLine + detailLine)', () => {
    for (const status of ['warning', 'reached', 'exceeded'] as const) {
      const parts = buildLimitMessageParts(status, 10, 10, 'month', 'Test');
      expect(parts).not.toBeNull();
      expect(typeof parts!.statusLine).toBe('string');
      expect(typeof parts!.detailLine).toBe('string');
      expect(parts!.statusLine.length).toBeGreaterThan(0);
      expect(parts!.detailLine.length).toBeGreaterThan(0);
    }
  });

  it('detailLine contains "{medName}: {count}" for reached/exceeded', () => {
    const reached = buildLimitMessageParts('reached', 10, 10, 'month', 'Aspirin');
    expect(reached!.detailLine).toMatch(/^Aspirin: 10 Einnahmen/);

    const exceeded = buildLimitMessageParts('exceeded', 15, 10, 'month', 'Naproxen');
    expect(exceeded!.detailLine).toMatch(/^Naproxen: 15 Einnahmen/);
  });
});

describe('getLimitStatus — fixed threshold logic', () => {
  it("returns 'warning' at limit - 1", () => {
    expect(getLimitStatus(9, 10)).toBe('warning');
  });

  it("returns 'reached' at exactly limit", () => {
    expect(getLimitStatus(10, 10)).toBe('reached');
  });

  it("returns 'exceeded' above limit", () => {
    expect(getLimitStatus(12, 10)).toBe('exceeded');
  });

  it("returns 'safe' well below limit", () => {
    expect(getLimitStatus(5, 10)).toBe('safe');
  });
});
