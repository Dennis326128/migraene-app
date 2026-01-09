import React, { useState, useEffect, useCallback } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronRight, ChevronLeft, Edit2, X, MapPin, Pill, FileText, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColorForPain } from './painColorScale';
import { getEntry } from '@/features/entries/api/entries.api';
import { Skeleton } from '@/components/ui/skeleton';
import type { PainEntry } from '@/types/painApp';

// Types
type SheetView = 'list' | 'preview';

interface EntryPreview {
  id: number;
  painLevel: number | null;
  time: string;
}

interface DaySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null; // YYYY-MM-DD
  entries: EntryPreview[];
  /** Start directly in preview mode with this entry (for single-entry days) */
  initialEntryId?: number | null;
  /** Called when edit is requested */
  onEdit: (entry: PainEntry) => void;
}

// Helpers
const getPainLevelLabel = (level: number | string | null): string => {
  if (level === null || level === undefined) return 'Keine Angabe';
  
  const numLevel = typeof level === 'number' ? level : parseInt(String(level));
  if (isNaN(numLevel)) {
    const t = String(level).toLowerCase();
    if (t.includes('sehr') && t.includes('stark')) return 'Sehr stark';
    if (t.includes('stark')) return 'Stark';
    if (t.includes('mittel')) return 'Mittel';
    if (t.includes('leicht')) return 'Leicht';
    return String(level);
  }
  
  if (numLevel === 0) return 'Keine';
  if (numLevel <= 3) return 'Leicht';
  if (numLevel <= 6) return 'Mittel';
  if (numLevel <= 8) return 'Stark';
  return 'Sehr stark';
};

const formatTime = (time: string | null | undefined): string => {
  if (!time) return '';
  const parts = time.split(':');
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]} Uhr`;
  }
  return time;
};

const painLocationLabels: Record<string, string> = {
  einseitig_links: 'Einseitig links',
  einseitig_rechts: 'Einseitig rechts',
  beidseitig: 'Beidseitig',
  stirn: 'Stirnbereich',
  nacken: 'Nackenbereich',
  schlaefe: 'Schläfenbereich',
};

const auraLabels: Record<string, string> = {
  keine: 'Keine Aura',
  visuell: 'Visuelle Aura',
  sensorisch: 'Sensorische Aura',
  sprachlich: 'Sprachliche Aura',
  gemischt: 'Gemischte Aura',
};

export const DaySheet: React.FC<DaySheetProps> = ({
  open,
  onOpenChange,
  date,
  entries,
  initialEntryId,
  onEdit
}) => {
  // Internal navigation state
  const [view, setView] = useState<SheetView>('list');
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  
  // Full entry data for preview
  const [entryData, setEntryData] = useState<PainEntry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(false);
  
  // Determine if we came directly to preview (single entry day)
  const [cameFromDirect, setCameFromDirect] = useState(false);
  
  // Reset state when sheet closes or date changes
  useEffect(() => {
    if (!open) {
      // Reset after close animation
      const timer = setTimeout(() => {
        setView('list');
        setSelectedEntryId(null);
        setEntryData(null);
        setCameFromDirect(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);
  
  // Handle initial entry (single-entry day) - go directly to preview
  useEffect(() => {
    if (open && initialEntryId && entries.length === 1) {
      setSelectedEntryId(initialEntryId);
      setView('preview');
      setCameFromDirect(true);
    } else if (open && entries.length > 1) {
      setView('list');
      setCameFromDirect(false);
    }
  }, [open, initialEntryId, entries.length]);
  
  // Load full entry when entering preview
  useEffect(() => {
    if (view === 'preview' && selectedEntryId) {
      setLoadingEntry(true);
      getEntry(String(selectedEntryId))
        .then((data) => setEntryData(data))
        .catch((err) => {
          console.error('Failed to load entry:', err);
          setEntryData(null);
        })
        .finally(() => setLoadingEntry(false));
    } else {
      setEntryData(null);
    }
  }, [view, selectedEntryId]);
  
  // Handlers
  const handleEntryClick = useCallback((entryId: number) => {
    setSelectedEntryId(entryId);
    setView('preview');
    setCameFromDirect(false); // Not direct, came from list
  }, []);
  
  const handleBackToList = useCallback(() => {
    setView('list');
    setSelectedEntryId(null);
    setEntryData(null);
  }, []);
  
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  
  const handleEdit = useCallback(() => {
    if (entryData) {
      onEdit(entryData);
    }
  }, [entryData, onEdit]);
  
  if (!date) return null;
  
  const formattedDate = format(parseISO(date), 'EEEE, d. MMMM yyyy', { locale: de });
  const sortedEntries = [...entries].sort((a, b) => a.time.localeCompare(b.time));
  
  // Determine title based on view
  const getTitle = () => {
    if (view === 'preview') return 'Eintrag';
    return formattedDate;
  };
  
  const getDescription = () => {
    if (view === 'preview' && entryData) {
      const time = entryData.selected_time || '';
      return `${formattedDate}${time ? ` • ${formatTime(time)}` : ''}`;
    }
    return `${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'}`;
  };
  
  // Get pain color for preview
  const getNumericPain = (painLevel: string | number | null | undefined): number | null => {
    if (!painLevel) return null;
    if (typeof painLevel === 'number') return painLevel;
    const num = parseInt(String(painLevel));
    if (!isNaN(num)) return num;
    const t = String(painLevel).toLowerCase();
    if (t.includes('sehr') && t.includes('stark')) return 9;
    if (t.includes('stark')) return 7;
    if (t.includes('mittel')) return 5;
    if (t.includes('leicht')) return 2;
    return null;
  };
  
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={getTitle()}
      description={getDescription()}
      className="sm:max-w-md"
    >
      <div className="space-y-2 pb-4">
        {/* LIST VIEW */}
        {view === 'list' && (
          <>
            {sortedEntries.map((entry) => {
              const markerColor = entry.painLevel !== null ? getColorForPain(entry.painLevel) : undefined;
              const painLabel = getPainLevelLabel(entry.painLevel);
              
              return (
                <button
                  key={entry.id}
                  onClick={() => handleEntryClick(entry.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg",
                    "bg-card/50 border border-border/50",
                    "hover:bg-accent/10 active:scale-[0.98]",
                    "transition-all duration-150",
                    "touch-manipulation min-h-[52px]",
                    "text-left"
                  )}
                >
                  <div 
                    className={cn(
                      "w-3 h-3 rounded-full flex-shrink-0",
                      !markerColor && "bg-muted-foreground/30"
                    )}
                    style={markerColor ? { backgroundColor: markerColor } : undefined}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">
                      {formatTime(entry.time)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {painLabel}{entry.painLevel !== null && ` (${entry.painLevel}/10)`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
              );
            })}
            
            {entries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Keine Einträge an diesem Tag
              </div>
            )}
          </>
        )}
        
        {/* PREVIEW VIEW */}
        {view === 'preview' && (
          <>
            {/* Back button - only show if came from list (multiple entries) */}
            {!cameFromDirect && entries.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToList}
                className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Zurück zur Übersicht
              </Button>
            )}
            
            {loadingEntry ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-3/4" />
              </div>
            ) : entryData ? (
              <>
                {/* Pain Level */}
                {(() => {
                  const numericPain = getNumericPain(entryData.pain_level);
                  const painColor = numericPain !== null ? getColorForPain(numericPain) : undefined;
                  return (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
                      <div 
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={painColor ? { backgroundColor: painColor } : { backgroundColor: 'hsl(var(--muted-foreground))' }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          Schmerzstärke: {getPainLevelLabel(entryData.pain_level)}
                          {numericPain !== null && ` (${numericPain}/10)`}
                        </p>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Pain Locations */}
                {(entryData as any).pain_locations && (entryData as any).pain_locations.length > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <p className="text-sm text-foreground">
                      {(entryData as any).pain_locations.map((loc: string) => painLocationLabels[loc] || loc).join(', ')}
                    </p>
                  </div>
                )}
                
                {/* Aura */}
                {(entryData as any).aura_type && (entryData as any).aura_type !== 'keine' && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <p className="text-sm text-foreground">
                      {auraLabels[(entryData as any).aura_type] || (entryData as any).aura_type}
                    </p>
                  </div>
                )}
                
                {/* Medications */}
                {entryData.medications && entryData.medications.length > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <Pill className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1.5">
                      {entryData.medications.map((med, idx) => (
                        <Badge 
                          key={idx} 
                          variant="secondary" 
                          className="text-xs font-normal"
                        >
                          {med}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Notes */}
                {entryData.notes && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {entryData.notes}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Eintrag konnte nicht geladen werden
              </div>
            )}
            
            {/* Footer Buttons */}
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={handleClose}
              >
                <X className="h-4 w-4 mr-2" />
                Schließen
              </Button>
              <Button 
                className="flex-1"
                onClick={handleEdit}
                disabled={!entryData || loadingEntry}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
};
