import React from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const getPainLevelDisplay = (level: number | null) => {
  if (level === null) {
    return { label: 'Unbekannt', color: 'bg-muted text-muted-foreground' };
  }
  
  if (level === 0) return { label: 'Keine', color: 'bg-green-500/20 text-green-300' };
  if (level <= 3) return { label: 'Leicht', color: 'bg-yellow-500/20 text-yellow-300' };
  if (level <= 6) return { label: 'Mittel', color: 'bg-orange-500/20 text-orange-300' };
  if (level <= 8) return { label: 'Stark', color: 'bg-red-500/20 text-red-300' };
  return { label: 'Sehr stark', color: 'bg-purple-500/20 text-purple-300' };
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
    >
      <div className="space-y-3 pb-4">
        {sortedEntries.map((entry, index) => {
          const painDisplay = getPainLevelDisplay(entry.painLevel);
          
          return (
            <Card 
              key={entry.id}
              className={cn(
                "cursor-pointer hover:bg-accent/5 transition-colors",
                "touch-manipulation"
              )}
              onClick={() => onEntryClick?.(entry.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Activity className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {entry.time} Uhr
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Schmerzeintrag
                      </p>
                    </div>
                  </div>
                  
                  <Badge className={painDisplay.color}>
                    {entry.painLevel !== null ? `${entry.painLevel}/10` : 'k.A.'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
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
