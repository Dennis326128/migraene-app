import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MonthGrid } from './MonthGrid';
import { CalendarLegend } from './CalendarLegend';
import { DaySheet } from './DaySheet';
import { useCalendarPainSummary, type DaySummary } from './useCalendarPainSummary';
import { Loader2 } from 'lucide-react';
import { startOfMonth, subMonths, isBefore, parseISO, isSameMonth } from 'date-fns';
import { toast } from 'sonner';
import type { PainEntry } from '@/types/painApp';
import { supabase } from '@/integrations/supabase/client';
import { invalidateEntryCaches } from '@/features/entries/hooks/invalidateEntryCaches';

interface CalendarViewProps {
  onEdit?: (entry: PainEntry) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onEdit }) => {
  const queryClient = useQueryClient();
  const {
    daySummaries,
    isLoading,
    earliestDate,
    loadEarlier,
    canLoadEarlier,
    loadedMonths
  } = useCalendarPainSummary({ initialMonths: 12 });

  // Realtime: refresh calendar whenever this user's pain_entries change
  // (e.g. voice entry from another tab, backfill job, edit on another device).
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (cancelled || !uid) return;

      channel = supabase
        .channel(`calendar-pain-entries-${uid}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pain_entries', filter: `user_id=eq.${uid}` },
          () => invalidateEntryCaches(queryClient),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);
  
  // Unified sheet state
  const [sheetState, setSheetState] = useState<{
    open: boolean;
    date: string | null;
    entries: DaySummary['entries'];
    initialEntryId: number | null;
  }>({
    open: false,
    date: null,
    entries: [],
    initialEntryId: null
  });
  
  // Refs for scrolling to current month
  const currentMonthRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  
  // Infinite scroll sentinel ref
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  
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
  
  // Scroll to current month on initial load – zeige die letzten Wochen (heute nahe unten).
  useEffect(() => {
    if (!isLoading && monthsToDisplay.length > 0 && !hasScrolledRef.current && currentMonthRef.current) {
      currentMonthRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      hasScrolledRef.current = true;
    }
  }, [isLoading, monthsToDisplay.length]);
  
  // Infinite scroll: IntersectionObserver for loading older months
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !canLoadEarlier) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoading && !isLoadingMoreRef.current && canLoadEarlier) {
          isLoadingMoreRef.current = true;
          loadEarlier();
          // Reset lock after a short delay
          setTimeout(() => {
            isLoadingMoreRef.current = false;
          }, 500);
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0.1,
      }
    );
    
    observer.observe(sentinel);
    
    return () => {
      observer.disconnect();
    };
  }, [canLoadEarlier, isLoading, loadEarlier]);
  
  // Handler: Day clicked in calendar (ADAPTIVE)
  const handleDayClick = useCallback((date: string, entries: DaySummary['entries']) => {
    if (entries.length === 0) {
      // No entries - show toast, don't open sheet
      toast.info('Keine Einträge an diesem Tag');
      return;
    }
    
    if (entries.length === 1) {
      // Single entry - open sheet directly in preview mode
      setSheetState({
        open: true,
        date,
        entries,
        initialEntryId: entries[0].id
      });
    } else {
      // Multiple entries - open sheet in list mode
      setSheetState({
        open: true,
        date,
        entries,
        initialEntryId: null
      });
    }
  }, []);
  
  // Handler: Sheet open change
  const handleSheetOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSheetState(prev => ({ ...prev, open: false }));
    }
  }, []);
  
  // Handler: Edit from sheet
  const handleEdit = useCallback((entry: PainEntry) => {
    // Close sheet
    setSheetState(prev => ({ ...prev, open: false }));
    // Trigger edit
    onEdit?.(entry);
  }, [onEdit]);
  
  if (isLoading && monthsToDisplay.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div ref={containerRef} className="w-full">
      {/* Infinite scroll sentinel at top for older months */}
      {canLoadEarlier && (
        <div ref={loadMoreSentinelRef} className="h-1" />
      )}
      
      {/* Loading indicator for older months */}
      {isLoading && monthsToDisplay.length > 0 && (
        <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Lade ältere Monate…</span>
        </div>
      )}
      
      {/* Month grids - reduced spacing */}
      <div className="space-y-3">
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
      
      {/* End of data indicator */}
      {!canLoadEarlier && monthsToDisplay.length > 0 && (
        <div className="text-center py-3 text-xs text-muted-foreground/50">
          Anfang erreicht
        </div>
      )}
      
      {/* No data state */}
      {monthsToDisplay.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Noch keine Einträge vorhanden</p>
          <p className="text-sm mt-1">Erstellen Sie Ihren ersten Schmerzeintrag</p>
        </div>
      )}
      
      {/* Legend at bottom - compact */}
      {monthsToDisplay.length > 0 && <CalendarLegend />}
      
      {/* Unified Day Sheet (list/preview) */}
      <DaySheet
        open={sheetState.open}
        onOpenChange={handleSheetOpenChange}
        date={sheetState.date}
        entries={sheetState.entries}
        initialEntryId={sheetState.initialEntryId}
        onEdit={handleEdit}
      />
    </div>
  );
};
