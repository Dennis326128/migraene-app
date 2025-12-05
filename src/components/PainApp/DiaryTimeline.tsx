import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Filter, FileText, Calendar as CalendarIcon, Activity, Edit, Trash2, ChevronDown, ChevronUp, ArrowDown, Heart, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { useEntries } from '@/features/entries/hooks/useEntries';
import { useDeleteEntry } from '@/features/entries/hooks/useEntryMutations';
import { supabase } from '@/integrations/supabase/client';
import type { MigraineEntry } from '@/types/painApp';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VoiceNoteEditModal } from './VoiceNoteEditModal';
import { QuickContextNoteModal, EditingContextNote } from './QuickContextNoteModal';
import { showSuccessToast, showErrorToast } from '@/lib/toastHelpers';
import type { ContextMetadata } from '@/lib/voice/saveNote';

// Helper: Filtert technische/ungültige Wetterbedingungen
const isValidWeatherCondition = (text: string | null | undefined): boolean => {
  if (!text) return false;
  
  const invalidPatterns = [
    /historical data/i,
    /no data/i,
    /undefined/i,
    /null/i,
    /\(\d{1,2}:\d{2}\)/ // Zeitstempel wie (5:00)
  ];
  
  return !invalidPatterns.some(pattern => pattern.test(text));
};

interface DiaryTimelineProps {
  onBack: () => void;
  onNavigate?: (target: 'diary-report') => void;
  onEdit?: (entry: MigraineEntry) => void;
}

type TimelineItemType = {
  id: string;
  type: 'pain_entry' | 'context_note';
  timestamp: Date;
  date: string;
  time: string;
  data: any;
};

export const DiaryTimeline: React.FC<DiaryTimelineProps> = ({ onBack, onNavigate, onEdit }) => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState<'all' | 'pain_entry' | 'context_note'>('all');
  const [editingNote, setEditingNote] = useState<any>(null);
  const [editingTageszustand, setEditingTageszustand] = useState<EditingContextNote | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [pageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);

  const toggleExpanded = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  // Delete mutation
  const { mutate: deleteMutate } = useDeleteEntry();
  
  const handleDelete = (id: string) => {
    if (!confirm("Diesen Eintrag wirklich löschen?")) return;
    deleteMutate(id);
  };

  const handleDeleteNote = async (id: string) => {
    if (!confirm("Diese Notiz wirklich löschen?")) return;
    
    try {
      const { error } = await supabase
        .from('voice_notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
        
      if (error) throw error;
      
      showSuccessToast("Gelöscht", "Notiz wurde gelöscht");
      queryClient.invalidateQueries({ queryKey: ['voice-notes-timeline'] });
    } catch (error) {
      showErrorToast("Fehler", error instanceof Error ? error.message : "Löschen fehlgeschlagen");
    }
  };

  // Helper to determine context type and label
  const getContextTypeInfo = (note: any) => {
    const contextType = note.context_type || 'notiz';
    const hasMetadata = note.metadata && Object.keys(note.metadata).length > 0;
    
    // Legacy detection: check if text contains structured data patterns
    const isLegacyTageszustand = !note.context_type && 
      (note.text?.includes('Stimmung:') || note.text?.includes('Stress:') || note.text?.includes('Schlaf:'));
    
    if (contextType === 'tageszustand' || hasMetadata || isLegacyTageszustand) {
      return {
        type: 'tageszustand' as const,
        label: 'Tageszustand',
        icon: Heart,
        color: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      };
    }
    
    return {
      type: 'notiz' as const,
      label: 'Notiz',
      icon: MessageSquare,
      color: 'bg-accent/20 text-accent border-accent/30'
    };
  };

  // Handle editing context note - opens appropriate editor
  const handleEditContextNote = (note: any) => {
    const typeInfo = getContextTypeInfo(note);
    
    if (typeInfo.type === 'tageszustand') {
      // Open Tageszustand editor with metadata
      setEditingTageszustand({
        id: note.id,
        text: note.text,
        context_type: note.context_type,
        metadata: note.metadata as ContextMetadata | null
      });
    } else {
      // Open simple text editor
      setEditingNote(note);
    }
  };

  const getPainLevelDisplay = (level: string) => {
    const mapping: Record<string, { label: string; numeric: string; color: string }> = {
      // Text-Werte
      'keine': { label: 'Keine Schmerzen', numeric: '0/10', color: 'bg-green-500/20 text-green-700 dark:bg-green-500/30 dark:text-green-300' },
      'leicht': { label: 'Leicht', numeric: '1-3/10', color: 'bg-yellow-500/20 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-300' },
      'mittel': { label: 'Mittel', numeric: '4-6/10', color: 'bg-orange-500/20 text-orange-700 dark:bg-orange-500/30 dark:text-orange-300' },
      'stark': { label: 'Stark', numeric: '7-8/10', color: 'bg-red-500/20 text-red-700 dark:bg-red-500/30 dark:text-red-300' },
      'sehr_stark': { label: 'Sehr stark', numeric: '9-10/10', color: 'bg-purple-500/20 text-purple-700 dark:bg-purple-500/30 dark:text-purple-300' },
      // Numerische Werte (0-10)
      '0': { label: 'Keine Schmerzen', numeric: '0/10', color: 'bg-green-500/20 text-green-700 dark:bg-green-500/30 dark:text-green-300' },
      '1': { label: 'Leicht', numeric: '1/10', color: 'bg-yellow-500/20 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-300' },
      '2': { label: 'Leicht', numeric: '2/10', color: 'bg-yellow-500/20 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-300' },
      '3': { label: 'Leicht', numeric: '3/10', color: 'bg-yellow-500/20 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-300' },
      '4': { label: 'Mittel', numeric: '4/10', color: 'bg-orange-500/20 text-orange-700 dark:bg-orange-500/30 dark:text-orange-300' },
      '5': { label: 'Mittel', numeric: '5/10', color: 'bg-orange-500/20 text-orange-700 dark:bg-orange-500/30 dark:text-orange-300' },
      '6': { label: 'Mittel', numeric: '6/10', color: 'bg-orange-500/20 text-orange-700 dark:bg-orange-500/30 dark:text-orange-300' },
      '7': { label: 'Stark', numeric: '7/10', color: 'bg-red-500/20 text-red-700 dark:bg-red-500/30 dark:text-red-300' },
      '8': { label: 'Stark', numeric: '8/10', color: 'bg-red-500/20 text-red-700 dark:bg-red-500/30 dark:text-red-300' },
      '9': { label: 'Sehr stark', numeric: '9/10', color: 'bg-purple-500/20 text-purple-700 dark:bg-purple-500/30 dark:text-purple-300' },
      '10': { label: 'Sehr stark', numeric: '10/10', color: 'bg-purple-500/20 text-purple-700 dark:bg-purple-500/30 dark:text-purple-300' },
    };
    return mapping[level] || { label: 'Unbekannt', numeric: '-', color: 'bg-muted' };
  };

  // Schmerzeinträge laden (mit Pagination)
  const { data: painEntries = [], isLoading: loadingEntries } = useEntries({
    limit: pageSize,
    offset: currentPage * pageSize
  });

  // Kontext-Notizen laden (mit Pagination)
  const { data: contextNotes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ['voice-notes-timeline', currentPage],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const offset = currentPage * pageSize;
      const { data, error } = await supabase
        .from('voice_notes')
        .select('*')
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      
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

  const totalEntries = filteredItems.length;
  const hasMore = painEntries.length === pageSize || contextNotes.length === pageSize;

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
                      <Card 
                        className="hover:bg-accent/5 transition-colors cursor-pointer"
                        onClick={() => toggleExpanded(item.id)}
                      >
                        <CardContent className="p-4">
                          {/* KOMPAKTE ANSICHT */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              {/* Zeit + Schmerzstärke (prominent) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{item.time} Uhr</span>
                  <span className="text-sm text-muted-foreground">Schmerzstärke:</span>
                  <Badge className={getPainLevelDisplay(item.data.pain_level).color}>
                    {getPainLevelDisplay(item.data.pain_level).label} ({getPainLevelDisplay(item.data.pain_level).numeric})
                  </Badge>
                  {item.data.pain_location && (
                    <Badge variant="outline" className="text-xs">
                      📍 {item.data.pain_location}
                    </Badge>
                  )}
                </div>
                              
                              {/* Medikamente als Liste (kompakt wenn zugeklappt) */}
                              {item.data.medications && item.data.medications.length > 0 && !expandedEntries.has(item.id) && (
                                <div className="flex flex-wrap gap-1">
                                  {item.data.medications.slice(0, 3).map((med: string, i: number) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      💊 {med}
                                    </Badge>
                                  ))}
                                  {item.data.medications.length > 3 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{item.data.medications.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            {/* Expand/Collapse Icon */}
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(item.id);
                              }}
                            >
                              {expandedEntries.has(item.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>

                          {/* ERWEITERTE ANSICHT (ausgeklappt) */}
                          {expandedEntries.has(item.id) && (
                            <div className="mt-4 pt-4 border-t space-y-3 animate-in slide-in-from-top-2">
                              {/* Medikamente (detailliert) */}
                              {item.data.medications && item.data.medications.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Medikamente</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {item.data.medications.map((med: string, i: number) => (
                                      <Badge key={i} variant="secondary" className="text-xs">
                                        💊 {med}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* Aura */}
                              {item.data.aura_type && item.data.aura_type !== 'keine' && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Aura</h4>
                                  <Badge variant="outline">✨ {item.data.aura_type}</Badge>
                                </div>
                              )}
                              
                              {/* Notizen */}
                              {item.data.notes && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Notizen</h4>
                                  <p className="text-sm bg-muted/50 rounded p-2">{item.data.notes}</p>
                                </div>
                              )}
                              
                              {/* Wetterdaten */}
                              {item.data.weather && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Wetter</h4>
                                  <div className="text-sm space-y-1">
                                    {item.data.weather.temperature_c !== null && (
                                      <div>🌡️ {item.data.weather.temperature_c}°C</div>
                                    )}
                                    {item.data.weather.pressure_mb !== null && (
                                      <div>📊 {item.data.weather.pressure_mb} hPa</div>
                                    )}
                                    {item.data.weather.humidity !== null && (
                                      <div>💧 {item.data.weather.humidity}%</div>
                                    )}
                                    {item.data.weather.condition_text && isValidWeatherCondition(item.data.weather.condition_text) && (
                                      <div>☁️ {item.data.weather.condition_text}</div>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Mondphase */}
                              {item.data.weather?.moon_phase !== null && item.data.weather?.moon_phase !== undefined && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Mondphase</h4>
                                  <span className="text-sm">🌙 {item.data.weather.moon_phase}</span>
                                </div>
                              )}
                              
                              {/* Koordinaten */}
                              {item.data.latitude && item.data.longitude && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Standort</h4>
                                  <span className="text-xs text-muted-foreground">
                                    📍 {item.data.latitude.toFixed(4)}, {item.data.longitude.toFixed(4)}
                                  </span>
                                </div>
                              )}
                              
                              {/* Edit/Delete Buttons */}
                              <div className="flex gap-2 pt-2">
                                {onEdit && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEdit(item.data);
                                    }}
                                    className="flex-1"
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Bearbeiten
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(item.data.id);
                                  }}
                                  className="flex-1 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Löschen
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <Card 
                        className="hover:bg-accent/5 transition-colors cursor-pointer"
                        onClick={() => toggleExpanded(item.id)}
                      >
                        <CardContent className="p-4">
                          {/* KOMPAKTE ANSICHT */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {(() => {
                                  const typeInfo = getContextTypeInfo(item.data);
                                  const IconComponent = typeInfo.icon;
                                  return (
                                    <Badge variant="outline" className={cn("text-xs", typeInfo.color)}>
                                      <IconComponent className="h-3 w-3 mr-1" />
                                      {typeInfo.label}
                                    </Badge>
                                  );
                                })()}
                                <span className="text-xs text-muted-foreground">{item.time} Uhr</span>
                              </div>
                              
                              {/* Text (gekürzt wenn zugeklappt) */}
                              <p className="text-sm">
                                {expandedEntries.has(item.id) 
                                  ? item.data.text 
                                  : `${item.data.text.slice(0, 80)}${item.data.text.length > 80 ? '...' : ''}`
                                }
                              </p>
                            </div>
                            
                            {/* Expand/Collapse Icon */}
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(item.id);
                              }}
                            >
                              {expandedEntries.has(item.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>

                          {/* ERWEITERTE ANSICHT */}
                          {expandedEntries.has(item.id) && (
                            <div className="mt-4 pt-4 border-t flex gap-2 animate-in slide-in-from-top-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditContextNote(item.data);
                                }}
                                className="flex-1"
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Bearbeiten
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNote(item.data.id);
                                }}
                                className="flex-1 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Löschen
                              </Button>
                            </div>
                          )}
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

      {/* Mehr laden Button */}
      {hasMore && !loadingEntries && !loadingNotes && totalEntries > 0 && (
        <div className="flex justify-center py-8">
          <Button 
            variant="outline" 
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="gap-2"
          >
            <ArrowDown className="h-4 w-4" />
            Mehr laden ({pageSize} weitere Einträge)
          </Button>
        </div>
      )}

      {/* Loading Indicator beim Nachladen */}
      {loadingEntries && currentPage > 0 && (
        <div className="flex justify-center py-4 text-muted-foreground">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2" />
          <span>Lade weitere Einträge...</span>
        </div>
      )}

      {/* Voice Note Edit Modal (for plain notes) */}
      <VoiceNoteEditModal
        note={editingNote}
        open={!!editingNote}
        onClose={() => setEditingNote(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['voice-notes-timeline'] });
          setEditingNote(null);
        }}
      />

      {/* Tageszustand Edit Modal */}
      <QuickContextNoteModal
        isOpen={!!editingTageszustand}
        onClose={() => setEditingTageszustand(null)}
        editingNote={editingTageszustand}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['voice-notes-timeline'] });
          setEditingTageszustand(null);
        }}
      />
    </div>
  );
};