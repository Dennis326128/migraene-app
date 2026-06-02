import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────
// Mock the supabase client BEFORE importing the module under test.
// ─────────────────────────────────────────────────────────────────────────

const queryState: {
  rows: Array<{ id: number; pressure_mb: number | null; created_at: string; requested_at?: string }>;
  error: { message: string } | null;
} = { rows: [], error: null };

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    not() { return this; },
    gte() { return this; },
    lte() { return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data: queryState.rows, error: queryState.error }); },
  };
  return { supabase: builder };
});

import { fetchPressureDelta24h } from '../usePressureDelta24h';

beforeEach(() => {
  queryState.rows = [];
  queryState.error = null;
});

describe('fetchPressureDelta24h', () => {
  const userId = 'user-1';
  const occurredAt = '2025-06-02T12:00:00Z';
  const currentPressure = 1010;

  it('returns "missing" when no candidates exist (sparse user data — common case)', async () => {
    queryState.rows = [];
    const res = await fetchPressureDelta24h(userId, occurredAt, currentPressure);
    expect(res).toEqual({ delta: null, source: 'missing' });
  });

  it('regression: only the current log is returned (self) → returns "missing", NOT delta=0', async () => {
    // Self log shows up in the ±90 min window (e.g. user has overlapping cache hits).
    // Bug used to pick self → falsely produced delta=0. Fix should filter self out.
    queryState.rows = [
      { id: 42, pressure_mb: 1010, created_at: '2025-06-01T11:30:00Z' },
    ];
    const res = await fetchPressureDelta24h(userId, occurredAt, currentPressure, 42);
    expect(res).toEqual({ delta: null, source: 'missing' });
  });

  it('computes Δ from the closest non-self candidate', async () => {
    queryState.rows = [
      { id: 42, pressure_mb: 1010, created_at: '2025-06-01T11:30:00Z' }, // self, ignored
      { id: 17, pressure_mb: 1004, created_at: '2025-06-01T12:05:00Z' }, // closest to T-24h
      { id: 9,  pressure_mb: 1000, created_at: '2025-06-01T10:00:00Z' },
    ];
    const res = await fetchPressureDelta24h(userId, occurredAt, currentPressure, 42);
    expect(res.source).toBe('calculated');
    expect(res.delta).toBe(6); // 1010 − 1004
  });

  it('rounds the resulting delta', async () => {
    queryState.rows = [
      { id: 1, pressure_mb: 1007.4, created_at: '2025-06-01T12:00:00Z' },
    ];
    const res = await fetchPressureDelta24h(userId, occurredAt, 1010.0);
    expect(res.delta).toBe(3); // 2.6 → rounds to 3
  });

  it('returns "missing" on supabase error', async () => {
    queryState.error = { message: 'boom' };
    const res = await fetchPressureDelta24h(userId, occurredAt, currentPressure);
    expect(res).toEqual({ delta: null, source: 'missing' });
  });
});
