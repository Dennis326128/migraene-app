import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MonthGrid } from './MonthGrid';
import { CalendarLegend } from './CalendarLegend';
import { DayDetailSheet } from './DayDetailSheet';
import { useCalendarPainSummary, type DaySummary } from './useCalendarPainSummary';
import { Button } from '@/components/ui/button';
import { ChevronUp, Loader2 } from 'lucide-react';
import { startOfMonth, subMonths, isBefore, parseISO, isSameMonth } from 'date-fns';

interface CalendarViewProps {
  onEntryClick?: (entryId: number) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onEntryClick }) => {
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
  
  const handleDayClick = (date: string, entries: DaySummary['entries']) => {
    setSelectedDay({ date, entries });
  };
  
  const handleEntryClick = (entryId: number) => {
    setSelectedDay(null);
    onEntryClick?.(entryId);
  };
  
  if (isLoading && monthsToDisplay.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div ref={containerRef} className="space-y-4 max-w-md mx-auto">
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
      
      {/* Month grids - compact iPhone style */}
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
        open={!!selectedDay}
        onOpenChange={(open) => !open && setSelectedDay(null)}
        date={selectedDay?.date ?? null}
        entries={selectedDay?.entries ?? []}
        onEntryClick={handleEntryClick}
      />
    </div>
  );
};
