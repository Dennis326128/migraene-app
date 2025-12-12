import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { MonthGrid } from './MonthGrid';
import { CalendarLegend } from './CalendarLegend';
import { DayDetailSheet } from './DayDetailSheet';
import { EntryPreviewSheet } from './EntryPreviewSheet';
import { useCalendarPainSummary, type DaySummary } from './useCalendarPainSummary';
import { Button } from '@/components/ui/button';
import { ChevronUp, Loader2 } from 'lucide-react';
import { startOfMonth, subMonths, isBefore, parseISO, isSameMonth } from 'date-fns';
import type { PainEntry } from '@/types/painApp';

interface CalendarViewProps {
  onEdit?: (entry: PainEntry) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onEdit }) => {
  const {
    daySummaries,
    isLoading,
    earliestDate,
    loadEarlier,
    canLoadEarlier,
    loadedMonths
  } = useCalendarPainSummary({ initialMonths: 12 });
  
  // Day detail sheet state
  const [selectedDay, setSelectedDay] = useState<{
    date: string;
    entries: DaySummary['entries'];
  } | null>(null);
  
  // Entry preview state
  const [previewEntry, setPreviewEntry] = useState<{
    id: number;
    time: string;
  } | null>(null);
  
  // Refs for scrolling to current month
  const currentMonthRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  
  // Generate months to display - chronological order (oldest first)
  const monthsToDisplay = useMemo(() => {
    const now = new Date();
    const months: Date[] = [];
    
    for (let i = 0; i < loadedMonths; i++) {
      const month = startOfMonth(subMonths(now, i));
      
      // Don't include months before earliest entry
      if (earliestDate) {
        const earliest = startOfMonth(parseISO(earliestDate));
        if (isBefore(month, earliest)) {
          continue;
        }
      }
      
      months.push(month);
    }
    
    // Reverse to get chronological order (oldest first, newest last)
    return months.reverse();
  }, [loadedMonths, earliestDate]);
  
  // Find current month index for ref assignment
  const currentMonthIndex = useMemo(() => {
    const now = new Date();
    return monthsToDisplay.findIndex(month => isSameMonth(month, now));
  }, [monthsToDisplay]);
  
  // Scroll to current month on initial load
  useEffect(() => {
    if (!isLoading && monthsToDisplay.length > 0 && !hasScrolledRef.current && currentMonthRef.current) {
      currentMonthRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
      hasScrolledRef.current = true;
    }
  }, [isLoading, monthsToDisplay.length]);
  
  // Handler: Day clicked in calendar
  const handleDayClick = useCallback((date: string, entries: DaySummary['entries']) => {
    setSelectedDay({ date, entries });
  }, []);
  
  // Handler: Entry clicked in day sheet -> open preview (NOT edit)
  const handleEntryClick = useCallback((entryId: number) => {
    // Find the entry to get its time
    const entry = selectedDay?.entries.find(e => e.id === entryId);
    setPreviewEntry({
      id: entryId,
      time: entry?.time || ''
    });
  }, [selectedDay]);
  
  // Handler: Close preview
  const handlePreviewClose = useCallback(() => {
    setPreviewEntry(null);
    // Day sheet stays open
  }, []);
  
  // Handler: Edit from preview
  const handlePreviewEdit = useCallback((entry: PainEntry) => {
    // Close preview
    setPreviewEntry(null);
    // Day sheet stays open
    
    // Trigger edit
    onEdit?.(entry);
  }, [onEdit]);
  
  // Handler: Day sheet closed
  const handleDaySheetClose = useCallback((open: boolean) => {
    if (!open) {
      setSelectedDay(null);
      setPreviewEntry(null);
    }
  }, []);
  
  if (isLoading && monthsToDisplay.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div ref={containerRef} className="space-y-4 w-full px-2 sm:px-3 max-w-lg sm:max-w-xl mx-auto">
      {/* Legend - compact */}
      <CalendarLegend />
      
      {/* Load earlier button at top */}
      {canLoadEarlier && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadEarlier}
            disabled={isLoading}
            className="gap-2 text-xs"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
            Frühere Monate
          </Button>
        </div>
      )}
      
      {/* Month grids */}
      <div className="space-y-6">
        {monthsToDisplay.map((month, index) => (
          <MonthGrid
            key={month.toISOString()}
            ref={index === currentMonthIndex ? currentMonthRef : undefined}
            month={month}
            daySummaries={daySummaries}
            onDayClick={handleDayClick}
          />
        ))}
      </div>
      
      {/* No data state */}
      {monthsToDisplay.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Noch keine Einträge vorhanden</p>
          <p className="text-sm mt-1">Erstellen Sie Ihren ersten Schmerzeintrag</p>
        </div>
      )}
      
      {/* Day detail sheet */}
      <DayDetailSheet
        open={!!selectedDay && !previewEntry}
        onOpenChange={handleDaySheetClose}
        date={selectedDay?.date ?? null}
        entries={selectedDay?.entries ?? []}
        onEntryClick={handleEntryClick}
      />
      
      {/* Entry preview sheet */}
      <EntryPreviewSheet
        open={!!previewEntry}
        onOpenChange={(open) => !open && handlePreviewClose()}
        entryId={previewEntry?.id ?? null}
        date={selectedDay?.date ?? null}
        time={previewEntry?.time ?? null}
        onEdit={handlePreviewEdit}
        onClose={handlePreviewClose}
      />
    </div>
  );
};
