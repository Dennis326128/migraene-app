import React from 'react';
import { DayCell } from './DayCell';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from 'date-fns';
import { de } from 'date-fns/locale';
import type { DaySummary } from './useCalendarPainSummary';

interface MonthGridProps {
  month: Date;
  daySummaries: Map<string, DaySummary>;
  onDayClick: (date: string, entries: DaySummary['entries']) => void;
}

// Weekday headers (Monday first)
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const MonthGrid: React.FC<MonthGridProps> = ({
  month,
  daySummaries,
  onDayClick
}) => {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Get day of week for first day (0 = Sunday, 1 = Monday, ...)
  // Convert to Monday-first (0 = Monday, 6 = Sunday)
  const firstDayOfWeek = (getDay(monthStart) + 6) % 7;
  
  // Create empty cells for days before month start
  const emptyCells = Array(firstDayOfWeek).fill(null);
  
  const monthLabel = format(month, 'MMMM yyyy', { locale: de });
  
  return (
    <div className="space-y-2">
      {/* Month header */}
      <h3 className="text-sm font-semibold text-foreground capitalize">
        {monthLabel}
      </h3>
      
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map(day => (
          <div 
            key={day} 
            className="text-center text-[10px] font-medium text-muted-foreground py-1"
          >
            {day}
          </div>
        ))}
      </div>
      
      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells before first day */}
        {emptyCells.map((_, index) => (
          <div key={`empty-${index}`} className="aspect-square" />
        ))}
        
        {/* Actual days */}
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const summary = daySummaries.get(dateKey);
          
          return (
            <DayCell
              key={dateKey}
              date={day}
              maxPain={summary?.maxPain ?? null}
              entryCount={summary?.entryCount ?? 0}
              onClick={() => {
                if (summary && summary.entryCount > 0) {
                  onDayClick(dateKey, summary.entries);
                }
              }}
              isCurrentMonth={isSameMonth(day, month)}
            />
          );
        })}
      </div>
    </div>
  );
};
