import React from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColorForPain } from './painColorScale';

interface EntryPreview {
  id: number;
  painLevel: number | null;
  time: string;
}

interface DayDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null; // YYYY-MM-DD
  entries: EntryPreview[];
  onEntryClick?: (entryId: number) => void;
}

const getPainLevelLabel = (level: number | null): string => {
  if (level === null) return 'k.A.';
  if (level === 0) return 'Keine';
  if (level <= 3) return 'Leicht';
  if (level <= 6) return 'Mittel';
  if (level <= 8) return 'Stark';
  return 'Sehr stark';
};

// Format time without seconds: "12:00 Uhr" instead of "12:00:00 Uhr"
const formatTime = (time: string): string => {
  const parts = time.split(':');
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]} Uhr`;
  }
  return `${time} Uhr`;
};

export const DayDetailSheet: React.FC<DayDetailSheetProps> = ({
  open,
  onOpenChange,
  date,
  entries,
  onEntryClick
}) => {
  if (!date) return null;
  
  const formattedDate = format(parseISO(date), 'EEEE, d. MMMM yyyy', { locale: de });
  const entrySummary = `${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'}`;
  
  // Sort entries by time
  const sortedEntries = [...entries].sort((a, b) => a.time.localeCompare(b.time));
  
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={formattedDate}
      description={entrySummary}
      className="sm:max-w-md"
    >
      <div className="space-y-2 pb-4">
        {sortedEntries.map((entry) => {
          const markerColor = entry.painLevel !== null ? getColorForPain(entry.painLevel) : undefined;
          const painLabel = getPainLevelLabel(entry.painLevel);
          
          return (
            <button
              key={entry.id}
              onClick={() => onEntryClick?.(entry.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg",
                "bg-card/50 border border-border/50",
                "hover:bg-accent/10 active:scale-[0.98]",
                "transition-all duration-150",
                "touch-manipulation min-h-[52px]",
                "text-left"
              )}
            >
              {/* Pain marker dot */}
              <div 
                className={cn(
                  "w-3 h-3 rounded-full flex-shrink-0",
                  !markerColor && "bg-muted-foreground/30"
                )}
                style={markerColor ? { backgroundColor: markerColor } : undefined}
              />
              
              {/* Time and label */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">
                  {formatTime(entry.time)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {painLabel}{entry.painLevel !== null && ` (${entry.painLevel}/10)`}
                </p>
              </div>
              
              {/* Chevron indicator */}
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          );
        })}
        
        {entries.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Keine Einträge an diesem Tag
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
