import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Filter, FileText, Calendar as CalendarIcon, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { useEntries } from '@/features/entries/hooks/useEntries';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface DiaryTimelineProps {
  onBack: () => void;
  onNavigate?: (target: 'diary-report') => void;
}

type TimelineItemType = {
  id: string;
  type: 'pain_entry' | 'context_note';
  timestamp: Date;
  date: string;
  time: string;
  data: any;
};

export const DiaryTimeline: React.FC<DiaryTimelineProps> = ({ onBack, onNavigate }) => {
  const isMobile = useIsMobile();
  const [filterType, setFilterType] = useState<'all' | 'pain_entry' | 'context_note'>('all');

  // Schmerzeinträge laden
  const { data: painEntries = [], isLoading: loadingEntries } = useEntries();

  // Kontext-Notizen laden
  const { data: contextNotes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ['voice-notes-timeline'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_notes')
        .select('*')
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data || [];
    }
  });

  // Kombinierte Timeline erstellen
  const timelineItems: TimelineItemType[] = useMemo(() => {
    const items: TimelineItemType[] = [];

    // Schmerzeinträge hinzufügen
    painEntries.forEach(entry => {
      const timestamp = new Date(entry.timestamp_created || entry.selected_date || new Date());
      const berlinTime = toZonedTime(timestamp, 'Europe/Berlin');
      
      items.push({
        id: `pain-${entry.id}`,
        type: 'pain_entry',
        timestamp: berlinTime,
        date: format(berlinTime, 'yyyy-MM-dd'),
        time: format(berlinTime, 'HH:mm'),
        data: entry
      });
    });

    // Kontext-Notizen hinzufügen
    contextNotes.forEach(note => {
      const timestamp = new Date(note.occurred_at);
      const berlinTime = toZonedTime(timestamp, 'Europe/Berlin');
      
      items.push({
        id: `note-${note.id}`,
        type: 'context_note',
        timestamp: berlinTime,
        date: format(berlinTime, 'yyyy-MM-dd'),
        time: format(berlinTime, 'HH:mm'),
        data: note
      });
    });

    // Sortieren (neueste zuerst)
    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [painEntries, contextNotes]);

  // Filtern
  const filteredItems = useMemo(() => {
    if (filterType === 'all') return timelineItems;
    return timelineItems.filter(item => item.type === filterType);
  }, [timelineItems, filterType]);

  // Nach Datum gruppieren
  const groupedByDate = useMemo(() => {
    const groups: Record<string, TimelineItemType[]> = {};
    
    filteredItems.forEach(item => {
      if (!groups[item.date]) {
        groups[item.date] = [];
      }
      groups[item.date].push(item);
    });
    
    return groups;
  }, [filteredItems]);

  const isLoading = loadingEntries || loadingNotes;

  const getPainLevelColor = (level: string) => {
    switch (level) {
      case 'leicht': return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300';
      case 'mittel': return 'bg-orange-500/20 text-orange-700 dark:text-orange-300';
      case 'stark': return 'bg-red-500/20 text-red-700 dark:text-red-300';
      case 'sehr_stark': return 'bg-purple-500/20 text-purple-700 dark:text-purple-300';
      default: return 'bg-muted';
    }
  };

  const getPainLevelLabel = (level: string) => {
    switch (level) {
      case 'leicht': return 'Leicht';
      case 'mittel': return 'Mittel';
      case 'stark': return 'Stark';
      case 'sehr_stark': return 'Sehr stark';
      default: return level;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button 
          variant="ghost" 
          onClick={onBack} 
          className="p-2 hover:bg-secondary/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold flex-1">Kopfschmerztagebuch</h1>
        <Badge variant="outline" className="text-xs">
          {filteredItems.length}
        </Badge>
      </div>

      {/* PDF Report Button */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <Button
          onClick={() => onNavigate?.('diary-report')}
          variant="default"
          size="lg"
          className="w-full justify-start gap-4 h-auto py-4 bg-success hover:bg-success/90 shadow-sm"
        >
          <FileText className="h-6 w-6" />
          <div className="text-left flex-1">
            <div className="font-semibold text-base">Kopfschmerztagebuch erstellen</div>
            <div className="text-xs opacity-90">PDF für Arztbesuche</div>
          </div>
          <Badge variant="secondary" className="ml-auto">
            Neu
          </Badge>
        </Button>
      </div>

      <div className={cn("max-w-4xl mx-auto p-4 space-y-4", isMobile && "px-3")}>
        {/* Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Anzeigen</span>
            </div>
            <ToggleGroup 
              type="single" 
              value={filterType} 
              onValueChange={(value) => value && setFilterType(value as typeof filterType)}
              className="justify-start"
            >
              <ToggleGroupItem value="all" className="flex-1">
                Alle ({timelineItems.length})
              </ToggleGroupItem>
              <ToggleGroupItem value="pain_entry" className="flex-1">
                Schmerz ({painEntries.length})
              </ToggleGroupItem>
              <ToggleGroupItem value="context_note" className="flex-1">
                Kontext ({contextNotes.length})
              </ToggleGroupItem>
            </ToggleGroup>
          </CardContent>
        </Card>

        {/* Timeline */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Lädt...</div>
        ) : Object.keys(groupedByDate).length === 0 ? (
          <EmptyState
            icon="📖"
            title="Noch keine Einträge"
            description="Erstellen Sie Ihren ersten Schmerz-Eintrag oder fügen Sie Kontext-Notizen hinzu."
          />
        ) : (
          Object.entries(groupedByDate).map(([date, items]) => (
            <div key={date} className="space-y-3">
              {/* Datum-Header */}
              <div className="flex items-center gap-2 sticky top-[57px] bg-background/95 backdrop-blur-sm py-2 z-[5]">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">
                  {format(new Date(date), 'EEEE, d. MMMM yyyy', { locale: de })}
                </h2>
              </div>

              {/* Einträge für diesen Tag */}
              <div className="space-y-2 relative pl-6">
                {/* Timeline-Linie */}
                <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />

                {items.map((item, idx) => (
                  <div key={item.id} className="relative">
                    {/* Timeline-Punkt */}
                    <div className={cn(
                      "absolute -left-[22px] top-3 w-3 h-3 rounded-full border-2 border-background",
                      item.type === 'pain_entry' ? 'bg-primary' : 'bg-accent'
                    )} />

                    {item.type === 'pain_entry' ? (
                      <Card className="hover:bg-accent/5 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={getPainLevelColor(item.data.pain_level)}>
                                  {getPainLevelLabel(item.data.pain_level)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{item.time} Uhr</span>
                                {item.data.pain_location && (
                                  <Badge variant="outline" className="text-xs">
                                    {item.data.pain_location}
                                  </Badge>
                                )}
                              </div>
                              
                              {item.data.medications && item.data.medications.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {item.data.medications.map((med: string, i: number) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      💊 {med}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {item.data.notes && (
                                <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                                  {item.data.notes}
                                </p>
                              )}
                            </div>
                            <Activity className="h-4 w-4 text-primary flex-shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="hover:bg-accent/5 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-accent/10">
                                  Kontext-Notiz
                                </Badge>
                                <span className="text-xs text-muted-foreground">{item.time} Uhr</span>
                                {item.data.stt_confidence && (
                                  <Badge variant="outline" className="text-xs">
                                    🎙️ {Math.round(item.data.stt_confidence * 100)}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm">{item.data.text}</p>
                            </div>
                            <FileText className="h-4 w-4 text-accent flex-shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};