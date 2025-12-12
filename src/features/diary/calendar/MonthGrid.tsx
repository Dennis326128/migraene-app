import React, { forwardRef } from 'react';
import { DayCell } from './DayCell';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, startOfWeek, endOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import type { DaySummary } from './useCalendarPainSummary';

interface MonthGridProps {
  month: Date;
  daySummaries: Map<string, DaySummary>;
  onDayClick: (date: string, entries: DaySummary['entries']) => void;
}

// Weekday headers (Monday first)
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Group days into weeks for divider rendering
function groupIntoWeeks(days: Date[], firstDayOfWeek: number): Date[][] {
  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];
  
  // Add empty slots for first week offset
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push(null as unknown as Date);
  }
  
  days.forEach(day => {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  
  // Push last partial week if any
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }
  
  return weeks;
}

export const MonthGrid = forwardRef<HTMLDivElement, MonthGridProps>(({
  month,
  daySummaries,
  onDayClick
}, ref) => {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Get day of week for first day (0 = Sunday, 1 = Monday, ...)
  // Convert to Monday-first (0 = Monday, 6 = Sunday)
  const firstDayOfWeek = (getDay(monthStart) + 6) % 7;
  
  // Group days into weeks
  const weeks = groupIntoWeeks(days, firstDayOfWeek);
  
  const monthLabel = format(month, 'MMMM yyyy', { locale: de });
  
  return (
    <div ref={ref} className="space-y-1">
      {/* Month header - iPhone style centered */}
      <h3 className="text-sm font-semibold text-foreground text-center capitalize py-2">
        {monthLabel}
      </h3>
      
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 border-b border-border/30 pb-1">
        {WEEKDAYS.map(day => (
          <div 
            key={day} 
            className="text-center text-[10px] font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>
      
      {/* Weeks with dividers */}
      <div className="space-y-0">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex}>
            {/* Week row */}
            <div className="grid grid-cols-7 gap-0.5 py-0.5">
              {week.map((day, dayIndex) => {
                if (!day) {
                  // Empty cell for offset
                  return <div key={`empty-${dayIndex}`} className="h-10" />;
                }
                
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
            
            {/* Subtle divider between weeks (except last) */}
            {weekIndex < weeks.length - 1 && (
              <div className="border-b border-border/20 mx-1" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

MonthGrid.displayName = 'MonthGrid';
