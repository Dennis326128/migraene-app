import React, { useState, useMemo } from 'react';
import { MonthGrid } from './MonthGrid';
import { CalendarLegend } from './CalendarLegend';
import { DayDetailSheet } from './DayDetailSheet';
import { useCalendarPainSummary, type DaySummary } from './useCalendarPainSummary';
import { Button } from '@/components/ui/button';
import { ChevronUp, Loader2 } from 'lucide-react';
import { startOfMonth, subMonths, isBefore, parseISO, isAfter } from 'date-fns';
import { cn } from '@/lib/utils';

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
  
  // Generate months to display
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
    
    return months;
  }, [loadedMonths, earliestDate]);
  
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
    <div className="space-y-6">
      {/* Legend */}
      <CalendarLegend />
      
      {/* Month grids */}
      <div className="space-y-8">
        {monthsToDisplay.map((month, index) => (
          <MonthGrid
            key={month.toISOString()}
            month={month}
            daySummaries={daySummaries}
            onDayClick={handleDayClick}
          />
        ))}
      </div>
      
      {/* Load earlier button */}
      {canLoadEarlier && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={loadEarlier}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
            Frühere Monate laden
          </Button>
        </div>
      )}
      
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
