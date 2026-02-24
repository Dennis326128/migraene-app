/**
 * Global TimeRange Context — Single Source of Truth for time range across the entire app.
 *
 * Uses documentationSpanDays (firstEntryDate → yesterday, inclusive)
 * to determine which presets are available.
 * Today is NEVER included — only fully completed days count.
 */
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { TimeRangePreset } from '@/components/PainApp/TimeRangeButtons';
import {
  computeEffectiveDateRange,
  daysBetweenInclusive,
  validatePreset,
  getDefaultPreset,
  yesterdayStr,
} from '@/lib/dateRange/rangeResolver';
import { fetchFirstEntryDate } from '@/features/entries/api/documentedDates.api';

// ─── LocalStorage Keys (v2 — persistent across tabs/sessions) ─────────
const LS_KEY_PRESET = 'miary_timerange_preset_v2';
const LS_KEY_CUSTOM_START = 'miary_timerange_custom_from_v2';
const LS_KEY_CUSTOM_END = 'miary_timerange_custom_to_v2';

const VALID_PRESETS: TimeRangePreset[] = ['1m', '3m', '6m', '12m', 'all', 'custom'];

/** Read persisted preset from localStorage (with v1 migration fallback). */
function readPersistedPreset(): TimeRangePreset | null {
  try {
    // v2 key
    const v2 = localStorage.getItem(LS_KEY_PRESET);
    if (v2 && VALID_PRESETS.includes(v2 as TimeRangePreset)) return v2 as TimeRangePreset;

    // v1 / legacy migration (sessionStorage)
    const legacy = sessionStorage.getItem('global_timeRange_preset');
    if (legacy && VALID_PRESETS.includes(legacy as TimeRangePreset)) {
      // Migrate once: write to v2, clean up legacy
      localStorage.setItem(LS_KEY_PRESET, legacy);
      sessionStorage.removeItem('global_timeRange_preset');
      return legacy as TimeRangePreset;
    }
  } catch { /* noop */ }
  return null;
}

function readPersistedCustom(): { start: string; end: string } {
  try {
    return {
      start: localStorage.getItem(LS_KEY_CUSTOM_START) || '',
      end: localStorage.getItem(LS_KEY_CUSTOM_END) || '',
    };
  } catch {
    return { start: '', end: '' };
  }
}

// ─── Context Shape ─────────────────────────────────────────────────────

interface OneShotRange {
  preset: TimeRangePreset;
  customFrom?: string;
  customTo?: string;
}

interface TimeRangeContextValue {
  /** Current preset */
  timeRange: TimeRangePreset;
  /** Change the preset */
  setTimeRange: (preset: TimeRangePreset) => void;
  /** Custom date boundaries */
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
  /** Computed effective range (YYYY-MM-DD) */
  from: string;
  to: string;
  /** Whether the range was clamped */
  wasClamped: boolean;
  /** First documented entry date */
  firstEntryDate: string | null;
  /** Days from firstEntryDate to yesterday (inclusive). SSOT for preset availability. */
  documentationSpanDays: number;
  /** Whether the provider has finished initializing */
  isReady: boolean;
  /** Apply a one-shot range override (used once, then auto-cleared) */
  applyOneShotRange: (range: OneShotRange) => void;
}

const TimeRangeContext = createContext<TimeRangeContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────

export function TimeRangeProvider({ children }: { children: React.ReactNode }) {
  const [firstEntryDate, setFirstEntryDate] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [timeRange, setTimeRangeRaw] = useState<TimeRangePreset>(() => readPersistedPreset() || 'all');
  const initCustom = readPersistedCustom();
  const [customFrom, setCustomFrom] = useState(initCustom.start);
  const [customTo, setCustomTo] = useState(initCustom.end);

  // One-shot range: applied once on next render, then cleared
  const [pendingOneShot, setPendingOneShot] = useState<OneShotRange | null>(null);

  // Load first entry date once
  useEffect(() => {
    fetchFirstEntryDate().then((first) => {
      setFirstEntryDate(first);
      setIsReady(true);
    });
  }, []);

  // Apply pending one-shot range
  useEffect(() => {
    if (!pendingOneShot || !isReady) return;
    const { preset, customFrom: cf, customTo: ct } = pendingOneShot;
    setTimeRangeRaw(preset);
    if (preset === 'custom' && cf && ct) {
      setCustomFrom(cf);
      setCustomTo(ct);
    }
    setPendingOneShot(null);
    // Don't persist one-shot to localStorage — it's temporary
  }, [pendingOneShot, isReady]);

  // Span = days from firstEntryDate to yesterday (inclusive) — today not yet complete
  const documentationSpanDays = firstEntryDate
    ? daysBetweenInclusive(firstEntryDate, yesterdayStr())
    : 0;

  // Dev logging
  if (import.meta.env.DEV && isReady) {
    console.debug('[TimeRange] firstEntryDate:', firstEntryDate, '| spanDays:', documentationSpanDays);
  }

  // Once data is loaded: restore persisted preset if valid, else smart default.
  useEffect(() => {
    if (!isReady) return;
    // Skip if we have a pending one-shot (it will be applied next)
    if (pendingOneShot) return;
    const persisted = readPersistedPreset();
    if (persisted) {
      const validated = validatePreset(persisted, documentationSpanDays);
      if (validated !== persisted) {
        try { localStorage.removeItem(LS_KEY_PRESET); } catch { /* noop */ }
      }
      setTimeRangeRaw(validated);
    } else {
      setTimeRangeRaw(getDefaultPreset(documentationSpanDays));
    }
  }, [isReady, documentationSpanDays]);

  // Handle preset change (including custom date initialization)
  const setTimeRange = useCallback((newPreset: TimeRangePreset) => {
    if (newPreset === 'custom') {
      const endDate = yesterdayStr();
      setCustomTo(endDate);
      const threeMonthsAgo = new Date(endDate + 'T00:00:00');
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      let startStr = threeMonthsAgo.toISOString().split('T')[0];
      if (firstEntryDate && startStr < firstEntryDate) startStr = firstEntryDate;
      setCustomFrom(startStr);
    }
    setTimeRangeRaw(newPreset);
  }, [firstEntryDate]);

  const applyOneShotRange = useCallback((range: OneShotRange) => {
    setPendingOneShot(range);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    // Don't persist if we just applied a one-shot
    try { localStorage.setItem(LS_KEY_PRESET, timeRange); } catch { /* noop */ }
  }, [timeRange]);

  useEffect(() => {
    try {
      if (timeRange === 'custom') {
        localStorage.setItem(LS_KEY_CUSTOM_START, customFrom);
        localStorage.setItem(LS_KEY_CUSTOM_END, customTo);
      }
    } catch { /* noop */ }
  }, [timeRange, customFrom, customTo]);

  // Compute effective range
  const { from, to, wasClamped } = useMemo(
    () => computeEffectiveDateRange(timeRange, firstEntryDate, { customFrom, customTo }),
    [timeRange, firstEntryDate, customFrom, customTo],
  );

  const value: TimeRangeContextValue = useMemo(() => ({
    timeRange,
    setTimeRange,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    from,
    to,
    wasClamped,
    firstEntryDate,
    documentationSpanDays,
    isReady,
    applyOneShotRange,
  }), [timeRange, setTimeRange, customFrom, customTo, from, to, wasClamped, firstEntryDate, documentationSpanDays, isReady, applyOneShotRange]);

  return (
    <TimeRangeContext.Provider value={value}>
      {children}
    </TimeRangeContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useTimeRange(): TimeRangeContextValue {
  const ctx = useContext(TimeRangeContext);
  if (!ctx) {
    throw new Error('useTimeRange must be used within a TimeRangeProvider');
  }
  return ctx;
}
