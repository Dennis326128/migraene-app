/**
 * Global TimeRange Context — Single Source of Truth for time range across the entire app.
 *
 * Mirrors the logic from AnalysisView (the reference implementation).
 * All screens share the same preset, custom dates, and computed range.
 */
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { TimeRangePreset } from '@/components/PainApp/TimeRangeButtons';
import {
  computeEffectiveDateRange,
  getDocumentationSpanDays,
  validatePreset,
  getDefaultPreset,
  todayStr,
} from '@/lib/dateRange/rangeResolver';
import { getFirstEntryDate } from '@/features/entries/api/entries.api';

// ─── Session Storage Keys ──────────────────────────────────────────────
const SESSION_KEY_PRESET = 'global_timeRange_preset';
const SESSION_KEY_CUSTOM_START = 'global_timeRange_customStart';
const SESSION_KEY_CUSTOM_END = 'global_timeRange_customEnd';

const VALID_PRESETS: TimeRangePreset[] = ['1m', '3m', '6m', '12m', 'all', 'custom'];

function readSessionPreset(): TimeRangePreset | null {
  try {
    const v = sessionStorage.getItem(SESSION_KEY_PRESET);
    if (v && VALID_PRESETS.includes(v as TimeRangePreset)) return v as TimeRangePreset;
  } catch { /* noop */ }
  return null;
}

function readSessionCustom(): { start: string; end: string } {
  try {
    return {
      start: sessionStorage.getItem(SESSION_KEY_CUSTOM_START) || '',
      end: sessionStorage.getItem(SESSION_KEY_CUSTOM_END) || '',
    };
  } catch {
    return { start: '', end: '' };
  }
}

// ─── Context Shape ─────────────────────────────────────────────────────

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
  /** Documentation span in calendar days */
  documentationSpanDays: number;
  /** Whether the provider has finished initializing */
  isReady: boolean;
}

const TimeRangeContext = createContext<TimeRangeContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────

export function TimeRangeProvider({ children }: { children: React.ReactNode }) {
  const [firstEntryDate, setFirstEntryDate] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [timeRange, setTimeRangeRaw] = useState<TimeRangePreset>(() => readSessionPreset() || 'all');
  const initCustom = readSessionCustom();
  const [customFrom, setCustomFrom] = useState(initCustom.start);
  const [customTo, setCustomTo] = useState(initCustom.end);

  // Load firstEntryDate once
  useEffect(() => {
    getFirstEntryDate().then((date) => {
      setFirstEntryDate(date);
      setIsReady(true);
    });
  }, []);

  const documentationSpanDays = useMemo(
    () => getDocumentationSpanDays(firstEntryDate),
    [firstEntryDate],
  );

  // Once firstEntryDate is loaded: apply default if no session-stored preset,
  // or validate the stored preset.
  useEffect(() => {
    if (!isReady) return;
    const stored = readSessionPreset();
    if (!stored) {
      // No previous selection → use smart default
      setTimeRangeRaw(getDefaultPreset(documentationSpanDays));
    } else {
      // Validate stored preset is still available
      const validated = validatePreset(stored, documentationSpanDays);
      if (validated !== stored) setTimeRangeRaw(validated);
    }
  }, [isReady, documentationSpanDays]);

  // Handle preset change (including custom date initialization)
  const setTimeRange = useCallback((newPreset: TimeRangePreset) => {
    if (newPreset === 'custom') {
      const today = todayStr();
      setCustomTo(today);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      let startStr = threeMonthsAgo.toISOString().split('T')[0];
      if (firstEntryDate && startStr < firstEntryDate) startStr = firstEntryDate;
      setCustomFrom(startStr);
    }
    setTimeRangeRaw(newPreset);
  }, [firstEntryDate]);

  // Persist to session storage
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY_PRESET, timeRange); } catch { /* noop */ }
  }, [timeRange]);

  useEffect(() => {
    try {
      if (timeRange === 'custom') {
        sessionStorage.setItem(SESSION_KEY_CUSTOM_START, customFrom);
        sessionStorage.setItem(SESSION_KEY_CUSTOM_END, customTo);
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
  }), [timeRange, setTimeRange, customFrom, customTo, from, to, wasClamped, firstEntryDate, documentationSpanDays, isReady]);

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
