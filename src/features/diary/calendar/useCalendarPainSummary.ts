import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listEntries, getFirstEntryDate } from '@/features/entries/api/entries.api';
import { normalizePainLevel } from './painColorScale';
import { format, subMonths, startOfMonth, endOfMonth, isAfter, isBefore, parseISO } from 'date-fns';

export interface DaySummary {
  date: string; // YYYY-MM-DD
  maxPain: number | null;
  entryCount: number;
  entries: Array<{
    id: number;
    painLevel: number | null;
    time: string;
  }>;
}

export interface CalendarPainSummary {
  daySummaries: Map<string, DaySummary>;
  isLoading: boolean;
  error: Error | null;
  earliestDate: string | null;
  loadedMonths: number;
  loadEarlier: () => void;
  canLoadEarlier: boolean;
}

interface UseCalendarPainSummaryParams {
  initialMonths?: number;
}

export function useCalendarPainSummary({ 
  initialMonths = 12 
}: UseCalendarPainSummaryParams = {}): CalendarPainSummary {
  const [monthsToLoad, setMonthsToLoad] = useState(initialMonths);
  
  // Get earliest entry date
  const { data: earliestDate } = useQuery({
    queryKey: ['first-entry-date'],
    queryFn: getFirstEntryDate,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
  
  // Calculate date range
  const dateRange = useMemo(() => {
    const now = new Date();
    const to = format(endOfMonth(now), 'yyyy-MM-dd');
    const fromDate = startOfMonth(subMonths(now, monthsToLoad - 1));
    
    // Don't go before earliest entry
    let effectiveFrom = fromDate;
    if (earliestDate) {
      const earliest = parseISO(earliestDate);
      if (isBefore(fromDate, earliest)) {
        effectiveFrom = startOfMonth(earliest);
      }
    }
    
    return {
      from: format(effectiveFrom, 'yyyy-MM-dd'),
      to
    };
  }, [monthsToLoad, earliestDate]);
  
  // Load all entries in range with pagination
  const { data: allEntries, isLoading, error } = useQuery({
    queryKey: ['calendar-entries', dateRange.from, dateRange.to],
    queryFn: async () => {
      const pageSize = 500;
      let offset = 0;
      let allData: any[] = [];
      let hasMore = true;
      
      while (hasMore) {
        const entries = await listEntries({
          from: dateRange.from,
          to: dateRange.to,
          limit: pageSize,
          offset
        });
        
        allData = [...allData, ...entries];
        
        if (entries.length < pageSize) {
          hasMore = false;
        } else {
          offset += pageSize;
        }
      }
      
      return allData;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!dateRange.from && !!dateRange.to
  });
  
  // Aggregate by day
  const daySummaries = useMemo(() => {
    const summaries = new Map<string, DaySummary>();
    
    if (!allEntries) return summaries;
    
    allEntries.forEach(entry => {
      // Use selected_date if available, otherwise extract from timestamp
      const date = entry.selected_date || 
        (entry.timestamp_created ? entry.timestamp_created.split('T')[0] : null);
      
      if (!date) return;
      
      const painLevel = normalizePainLevel(entry.pain_level);
      const time = entry.selected_time || 
        (entry.timestamp_created ? format(new Date(entry.timestamp_created), 'HH:mm') : '00:00');
      
      if (!summaries.has(date)) {
        summaries.set(date, {
          date,
          maxPain: painLevel,
          entryCount: 1,
          entries: [{
            id: entry.id,
            painLevel,
            time
          }]
        });
      } else {
        const existing = summaries.get(date)!;
        existing.entryCount++;
        existing.entries.push({
          id: entry.id,
          painLevel,
          time
        });
        
        // Update max pain
        if (painLevel !== null) {
          if (existing.maxPain === null || painLevel > existing.maxPain) {
            existing.maxPain = painLevel;
          }
        }
      }
    });
    
    return summaries;
  }, [allEntries]);
  
  // Check if we can load earlier
  const canLoadEarlier = useMemo(() => {
    if (!earliestDate) return false;
    
    const earliest = parseISO(earliestDate);
    const currentFrom = startOfMonth(subMonths(new Date(), monthsToLoad - 1));
    
    return isAfter(currentFrom, startOfMonth(earliest));
  }, [earliestDate, monthsToLoad]);
  
  const loadEarlier = () => {
    setMonthsToLoad(prev => prev + 12);
  };
  
  return {
    daySummaries,
    isLoading,
    error: error as Error | null,
    earliestDate,
    loadedMonths: monthsToLoad,
    loadEarlier,
    canLoadEarlier
  };
}
