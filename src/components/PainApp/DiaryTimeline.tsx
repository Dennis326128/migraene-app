import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, Calendar as CalendarIcon, Edit, Trash2, ChevronDown, ChevronUp, ArrowDown, Heart, MessageSquare, List, LayoutGrid, Pill, Activity } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-header';
import { format, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { useEntries } from '@/features/entries/hooks/useEntries';
import { useDeleteEntry } from '@/features/entries/hooks/useEntryMutations';
import { supabase } from '@/integrations/supabase/client';
import type { MigraineEntry } from '@/types/painApp';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/empty-state';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VoiceNoteEditModal } from './VoiceNoteEditModal';
import { QuickContextNoteModal, EditingContextNote } from './QuickContextNoteModal';
import { showSuccessToast, showErrorToast } from '@/lib/toastHelpers';
import type { ContextMetadata } from '@/lib/voice/saveNote';
import { CalendarView } from '@/features/diary/calendar';
import { normalizePainLevel } from '@/lib/utils/pain';
import { MedicationHistoryView } from '@/components/diary/MedicationHistoryView';
import { useTimeRange } from '@/contexts/TimeRangeContext';

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

// Compact Rolling 30d KPI Summary - Info only, not a filter
// This shows a quick snapshot of the last 30 days while the full list shows ALL entries
function CompactKPISummary({ entries }: { entries: any[] }) {
  const { t } = useTranslation();
  const last30Days = useMemo(() => {
    const thirtyDaysAgo = subDays(new Date(), 30);
    return entries.filter(entry => {
      const dateStr = entry.selected_date || entry.timestamp_created?.split('T')[0];
      if (!dateStr) return false;
      return new Date(dateStr) >= thirtyDaysAgo;
    });
  }, [entries]);
  
  const stats = useMemo(() => {
    // Distinct pain days
    const painDaysSet = new Set<string>();
    let triptanCount = 0;
    const painLevels: number[] = [];
    
    last30Days.forEach(entry => {
      const dateKey = entry.selected_date || entry.timestamp_created?.split('T')[0];
      if (dateKey) painDaysSet.add(dateKey);
      
      const level = normalizePainLevel(entry.pain_level);
      if (level !== null && level > 0) painLevels.push(level);
      
      entry.medications?.forEach((med: string) => {
        if (med.toLowerCase().includes('triptan')) triptanCount++;
      });
    });
    
    const avgIntensity = painLevels.length > 0 
      ? (painLevels.reduce((a, b) => a + b, 0) / painLevels.length).toFixed(1)
      : '–';
    
    return {
      painDays: painDaysSet.size,
      triptanCount,
      avgIntensity
    };
  }, [last30Days]);
  
  return (
    <div className="space-y-1">
      {/* Label: Quick 30d snapshot - NOT a filter */}
      <p className="text-xs text-muted-foreground/70 px-1">
        {t('diary.last30DaysInfo', 'Kurzinfo letzte 30 Tage')}
      </p>
      <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/40 border border-border/50">
        <div className="flex items-center gap-2 flex-1">
          <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">{stats.painDays}</span>
            <span className="text-muted-foreground"> {t('diary.painDays')}</span>
          </div>
        </div>
        <div className="w-px h-6 bg-border" />
        <div className="flex items-center gap-2 flex-1">
          <Pill className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">{stats.triptanCount}</span>
            <span className="text-muted-foreground"> {t('diary.triptans')}</span>
          </div>
        </div>
        <div className="w-px h-6 bg-border" />
        <div className="flex items-center gap-2 flex-1">
          <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">Ø {stats.avgIntensity}</span>
            <span className="text-muted-foreground">/10</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DiaryTimelineProps {
  onBack: () => void;
  onNavigate?: (target: 'diary-report') => void;
  onNavigateToLimitEdit?: (medicationName: string, mode: 'create' | 'edit') => void;
  onEdit?: (entry: MigraineEntry) => void;
  /** Deep-link: pre-select medication mode with this medication */
  initialMedication?: string | null;
  /** Deep-link: one-shot range override from statistics */
  initialRangeOverride?: { preset: string; from?: string; to?: string } | null;
}

type TimelineItemType = {
  id: string;
  type: 'pain_entry' | 'context_note';
  timestamp: Date;
  date: string;
  time: string;
  data: any;
};

const DIARY_VIEW_MODE_KEY = 'diaryViewMode';

export const DiaryTimeline: React.FC<DiaryTimelineProps> = ({ onBack, onNavigate, onNavigateToLimitEdit, onEdit, initialMedication, initialRangeOverride }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { applyOneShotRange } = useTimeRange();
  const [filterType, setFilterType] = useState<'all' | 'pain_entry' | 'context_note' | 'medication'>(initialMedication ? 'medication' : 'all');
  const [selectedMedication, setSelectedMedication] = useState<string | null>(initialMedication ?? null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>(() => {
    // Force list mode when deep-linking to medication
    if (initialMedication) return 'list';
    const saved = localStorage.getItem(DIARY_VIEW_MODE_KEY);
    return (saved === 'list' || saved === 'calendar') ? saved : 'list';
  });

  // Apply one-shot range override from statistics deep-link
  useEffect(() => {
    if (initialRangeOverride) {
      applyOneShotRange({
        preset: initialRangeOverride.preset as any,
        customFrom: initialRangeOverride.from,
        customTo: initialRangeOverride.to,
      });
    }
  }, []); // Only on mount

  const handleViewModeChange = (value: string | undefined) => {
    if (value === 'list' || value === 'calendar') {
      setViewMode(value);
      localStorage.setItem(DIARY_VIEW_MODE_KEY, value);
    }
  };
  const [editingNote, setEditingNote] = useState<any>(null);
  const [editingTageszustand, setEditingTageszustand] = useState<EditingContextNote | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [pageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'entry' | 'note' } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
  const { mutate: deleteMutate, isPending: isEntryDeleting } = useDeleteEntry();
  
  const handleDeleteClick = (id: string, type: 'entry' | 'note') => {
    setDeleteTarget({ id, type });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    
    setIsDeleting(true);
    
    if (deleteTarget.type === 'entry') {
      deleteMutate(deleteTarget.id);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      setIsDeleting(false);
    } else {
      // Delete note
      try {
        const { error } = await supabase
          .from('voice_notes')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', deleteTarget.id);
          
        if (error) throw error;
        
        showSuccessToast("Gelöscht", "Notiz wurde gelöscht");
        queryClient.invalidateQueries({ queryKey: ['voice-notes-timeline'] });
        queryClient.invalidateQueries({ queryKey: ['voice-notes-count'] });
      } catch (error) {
        console.error('Delete error:', error);
        showErrorToast("Fehler", error instanceof Error ? error.message : "Löschen fehlgeschlagen");
      } finally {
        setDeleteConfirmOpen(false);
        setDeleteTarget(null);
        setIsDeleting(false);
      }
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
      // Text-Werte — consistent orange→red scale, NO purple
      'keine': { label: 'Keine Schmerzen', numeric: '0/10', color: 'bg-green-500/20 text-green-300' },
      'leicht': { label: 'Leicht', numeric: '1-3/10', color: 'bg-amber-500/20 text-amber-300' },
      'mittel': { label: 'Mittel', numeric: '4-6/10', color: 'bg-orange-500/20 text-orange-300' },
      'stark': { label: 'Stark', numeric: '7-8/10', color: 'bg-red-500/20 text-red-300' },
      'sehr_stark': { label: 'Sehr stark', numeric: '9-10/10', color: 'bg-red-600/25 text-red-300' },
      // Numerische Werte (0-10)
      '0': { label: 'Keine Schmerzen', numeric: '0/10', color: 'bg-green-500/20 text-green-300' },
      '1': { label: 'Leicht', numeric: '1/10', color: 'bg-amber-500/20 text-amber-300' },
      '2': { label: 'Leicht', numeric: '2/10', color: 'bg-amber-500/20 text-amber-300' },
      '3': { label: 'Leicht', numeric: '3/10', color: 'bg-amber-500/20 text-amber-300' },
      '4': { label: 'Mittel', numeric: '4/10', color: 'bg-orange-500/20 text-orange-300' },
      '5': { label: 'Mittel', numeric: '5/10', color: 'bg-orange-500/20 text-orange-300' },
      '6': { label: 'Mittel', numeric: '6/10', color: 'bg-orange-500/20 text-orange-300' },
      '7': { label: 'Stark', numeric: '7/10', color: 'bg-red-500/20 text-red-300' },
      '8': { label: 'Stark', numeric: '8/10', color: 'bg-red-500/20 text-red-300' },
      '9': { label: 'Sehr stark', numeric: '9/10', color: 'bg-red-600/25 text-red-300' },
      '10': { label: 'Sehr stark', numeric: '10/10', color: 'bg-red-600/25 text-red-300' },
    };
    return mapping[level] || { label: 'Unbekannt', numeric: '-', color: 'bg-muted' };
  };

  // Schmerzeinträge laden (mit Pagination)
  const { data: painEntries = [], isLoading: loadingEntries } = useEntries({
    limit: pageSize,
    offset: currentPage * pageSize
  });

  // Gesamtanzahl der Schmerzeinträge laden
  const { data: painEntriesCount = 0 } = useQuery({
    queryKey: ['pain-entries-count'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      
      const { count, error } = await supabase
        .from('pain_entries')
        .select('*', { count: 'exact', head: true });
      
      if (error) return 0;
      return count || 0;
    }
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

  // Gesamtanzahl der Kontext-Notizen laden
  const { data: contextNotesCount = 0 } = useQuery({
    queryKey: ['voice-notes-count'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      
      const { count, error } = await supabase
        .from('voice_notes')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);
      
      if (error) return 0;
      return count || 0;
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

  // Berechne ob es mehr Einträge gibt basierend auf dem aktuellen Filter
  const loadedPainCount = painEntries.length + (currentPage * pageSize);
  const loadedContextCount = contextNotes.length + (currentPage * pageSize);
  
  const remainingPainEntries = Math.max(0, painEntriesCount - loadedPainCount);
  const remainingContextNotes = Math.max(0, contextNotesCount - loadedContextCount);
  
  // hasMore und remainingCount basierend auf dem Filter berechnen
  const { hasMore, remainingCount } = useMemo(() => {
    if (filterType === 'all') {
      const remaining = remainingPainEntries + remainingContextNotes;
      return { hasMore: remaining > 0, remainingCount: remaining };
    } else if (filterType === 'pain_entry') {
      return { hasMore: remainingPainEntries > 0, remainingCount: remainingPainEntries };
    } else {
      return { hasMore: remainingContextNotes > 0, remainingCount: remainingContextNotes };
    }
  }, [filterType, remainingPainEntries, remainingContextNotes]);

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
      {/* Sticky Header with View Toggle */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <AppHeader 
          title={t('mainMenu.historyAndCalendar')} 
          onBack={onBack}
        />
        
        {/* Segmented Control - Always Visible */}
        <div className="px-4 pb-3">
          <ToggleGroup 
            type="single" 
            value={viewMode} 
            onValueChange={handleViewModeChange}
            className="w-full bg-muted/60 p-1 rounded-xl grid grid-cols-2"
          >
            <ToggleGroupItem 
              value="list" 
              className="rounded-lg py-2.5 text-sm font-medium data-[state=on]:bg-background data-[state=on]:shadow-md data-[state=on]:text-foreground data-[state=off]:text-muted-foreground transition-all"
            >
              <List className="h-4 w-4 mr-2" />
              {t('diary.list')}
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="calendar" 
              className="rounded-lg py-2.5 text-sm font-medium data-[state=on]:bg-background data-[state=on]:shadow-md data-[state=on]:text-foreground data-[state=off]:text-muted-foreground transition-all"
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              {t('diary.calendar')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>


      <div className={cn("max-w-4xl mx-auto p-4 space-y-4", isMobile && "px-3")}>

        {/* Filter - only show in list view */}
        {viewMode === 'list' && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('diary.show')}</span>
              </div>
              <ToggleGroup 
                type="single" 
                value={filterType} 
                onValueChange={(value) => value && setFilterType(value as typeof filterType)}
                className="justify-start flex-wrap"
              >
                <ToggleGroupItem value="all" className="flex-1">
                  {t('diary.all')}
                </ToggleGroupItem>
                <ToggleGroupItem value="pain_entry" className="flex-1">
                  {t('diary.pain')}
                </ToggleGroupItem>
                <ToggleGroupItem value="context_note" className="flex-1">
                  {t('diary.context')}
                </ToggleGroupItem>
                <ToggleGroupItem value="medication" className="flex-1">
                  <Pill className="h-3.5 w-3.5 mr-1" />
                  Medikamente
                </ToggleGroupItem>
              </ToggleGroup>
            </CardContent>
          </Card>
        )}

        {/* Medication History View */}
        {viewMode === 'list' && filterType === 'medication' && (
          <MedicationHistoryView
            selectedMedication={selectedMedication}
            onSelectMedication={setSelectedMedication}
            onNavigateToLimitEdit={onNavigateToLimitEdit}
          />
        )}

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <CalendarView 
            onEdit={(entry) => {
              // Trigger edit from calendar view
              if (onEdit) {
                onEdit(entry as any);
              }
            }}
          />
        )}

        {/* List View / Timeline (hidden when medication filter is active) */}
        {viewMode === 'list' && filterType !== 'medication' && (
          <>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Card key={i}><CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-4 rounded bg-muted animate-pulse" />
                      <div className="w-24 h-5 rounded bg-muted animate-pulse" />
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            ) : Object.keys(groupedByDate).length === 0 && !loadingEntries && !loadingNotes ? (
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
                  <Badge className={getPainLevelDisplay(item.data.pain_level).color}>
                    {getPainLevelDisplay(item.data.pain_level).label} ({getPainLevelDisplay(item.data.pain_level).numeric})
                  </Badge>
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
                               
                              {/* Schmerzlokalisation (nur in Details) */}
                              {item.data.pain_locations && item.data.pain_locations.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Lokalisation</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {item.data.pain_locations.map((loc: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        📍 {loc}
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
                                    {item.data.weather.condition_text && isValidWeatherCondition(item.data.weather.condition_text) && (
                                      <div className="flex items-center gap-1.5">
                                        <span>☁️</span>
                                        <span>{item.data.weather.condition_text}</span>
                                        {item.data.weather.temperature_c !== null && (
                                          <span className="text-muted-foreground">· {item.data.weather.temperature_c}°C</span>
                                        )}
                                      </div>
                                    )}
                                    {!isValidWeatherCondition(item.data.weather.condition_text) && item.data.weather.temperature_c !== null && (
                                      <div>🌡️ {item.data.weather.temperature_c}°C</div>
                                    )}
                                    {item.data.weather.pressure_mb !== null && (
                                      <div className="flex items-center gap-1.5">
                                        <span>📊</span>
                                        <span>{item.data.weather.pressure_mb} hPa</span>
                                        {item.data.weather.pressure_change_24h != null && (
                                          <span className={cn(
                                            "text-xs",
                                            item.data.weather.pressure_change_24h > 0 ? "text-green-400" :
                                            item.data.weather.pressure_change_24h < 0 ? "text-red-400" :
                                            "text-muted-foreground"
                                          )}>
                                            (Δ {item.data.weather.pressure_change_24h > 0 ? '+' : ''}{Math.round(item.data.weather.pressure_change_24h)} hPa / 24h)
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {item.data.weather.humidity !== null && (
                                      <div>💧 {item.data.weather.humidity}%</div>
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
                                    handleDeleteClick(item.data.id, 'entry');
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
                                <span className="text-sm font-medium">{item.time} Uhr</span>
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
                                  handleDeleteClick(item.data.id, 'note');
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
          </>
        )}
      </div>

      {/* Mehr laden Button */}
      {hasMore && !loadingEntries && !loadingNotes && filterType !== 'medication' && (
        <div className="flex justify-center py-8">
          <Button 
            variant="outline" 
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="gap-2"
          >
            <ArrowDown className="h-4 w-4" />
            Mehr laden ({remainingCount} weitere {remainingCount === 1 ? 'Eintrag' : 'Einträge'})
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
      
      <DeleteConfirmation
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleDeleteConfirm}
        title={deleteTarget?.type === 'entry' ? 'Eintrag löschen' : 'Notiz löschen'}
        description={deleteTarget?.type === 'entry' 
          ? 'Möchtest du diesen Migräne-Eintrag wirklich löschen?'
          : 'Möchtest du diese Notiz wirklich löschen?'
        }
        isDeleting={isDeleting || isEntryDeleting}
      />
    </div>
  );
};