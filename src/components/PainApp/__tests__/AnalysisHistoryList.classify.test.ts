import { describe, it, expect } from 'vitest';
import { classifyEntry } from '../AnalysisHistoryList';
import type { AnalysisHistoryEntry } from '@/lib/voice/analysisCache';

function entry(overrides: Partial<AnalysisHistoryEntry> = {}): AnalysisHistoryEntry {
  return {
    id: 'e1',
    createdAt: '2026-05-22T00:02:00Z',
    updatedAt: '2026-05-22T00:02:00Z',
    fromDate: '2026-02-19',
    toDate: '2026-05-19',
    dataStateSignature: 'v:2.2.0|pe:5:1|ve:0:0|mi:0:0|me:0:0|cn:0:0',
    daysAnalyzed: 90,
    painEntryCount: 5,
    voiceEventCount: 0,
    ...overrides,
  };
}

describe('AnalysisHistoryList.classifyEntry', () => {
  it('returns "current" when range and signature match', () => {
    const e = entry();
    expect(classifyEntry(e, '2026-02-19', '2026-05-19', e.dataStateSignature)).toBe('current');
  });

  it('returns "other_range" when range does not match', () => {
    const e = entry();
    expect(classifyEntry(e, '2026-04-01', '2026-05-01', e.dataStateSignature)).toBe('other_range');
  });

  it('returns "older" when range matches but version differs', () => {
    const e = entry({ dataStateSignature: 'v:2.1.0|pe:5:1|ve:0:0|mi:0:0|me:0:0|cn:0:0' });
    expect(classifyEntry(e, '2026-02-19', '2026-05-19', 'v:2.2.0|pe:5:1|ve:0:0|mi:0:0|me:0:0|cn:0:0')).toBe('older');
  });

  it('returns "older" when range matches but data signature differs', () => {
    const e = entry();
    expect(classifyEntry(e, '2026-02-19', '2026-05-19', 'v:2.2.0|pe:99:9|ve:0:0|mi:0:0|me:0:0|cn:0:0')).toBe('older');
  });
});
