/**
 * TimeRangeSelector — Unified time range UI component.
 *
 * Wraps TimeRangeButtons + custom date inputs, consuming the global
 * useTimeRange() context. Drop-in replacement for scattered implementations.
 */
import React from 'react';
import { TimeRangeButtons } from './TimeRangeButtons';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { todayStr } from '@/lib/dateRange/rangeResolver';

interface TimeRangeSelectorProps {
  /** Compact mode for PDF export page */
  compact?: boolean;
  className?: string;
  /** Show the clamped warning */
  showClampedWarning?: boolean;
}

export function TimeRangeSelector({
  compact = false,
  className = '',
  showClampedWarning = true,
}: TimeRangeSelectorProps) {
  const {
    timeRange,
    setTimeRange,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    wasClamped,
    firstEntryDate,
    lastDocDate,
    consecutiveDocumentedDays,
  } = useTimeRange();

  const maxDate = lastDocDate || todayStr();

  return (
    <div className={className}>
      <TimeRangeButtons
        value={timeRange}
        onChange={setTimeRange}
        documentationSpanDays={consecutiveDocumentedDays}
        compact={compact}
      />

      {timeRange === 'custom' && (
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-sm font-medium">Von</label>
            <input
              type="date"
              value={customFrom}
              min={firstEntryDate || undefined}
              max={customTo || maxDate}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Bis</label>
            <input
              type="date"
              value={customTo}
              min={customFrom || firstEntryDate || undefined}
              max={maxDate}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
            />
          </div>
        </div>
      )}

      {showClampedWarning && wasClamped && (
        <p className="text-xs text-muted-foreground mt-2">
          Zeitraum wurde an verfügbare Daten angepasst.
        </p>
      )}
    </div>
  );
}
