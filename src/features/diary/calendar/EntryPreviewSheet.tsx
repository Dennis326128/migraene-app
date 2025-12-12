import React, { useState, useEffect } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Edit2, X, MapPin, Pill, FileText, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColorForPain } from './painColorScale';
import { getEntry } from '@/features/entries/api/entries.api';
import { Skeleton } from '@/components/ui/skeleton';
import type { PainEntry } from '@/types/painApp';

interface EntryPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm
  onEdit: (entry: PainEntry) => void;
  onClose: () => void;
}

const getPainLevelLabel = (level: string | number | null): string => {
  if (level === null || level === undefined) return 'Keine Angabe';
  
  const numLevel = typeof level === 'number' ? level : parseInt(level);
  if (isNaN(numLevel)) {
    // Text-based level
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

export const EntryPreviewSheet: React.FC<EntryPreviewSheetProps> = ({
  open,
  onOpenChange,
  entryId,
  date,
  time,
  onEdit,
  onClose
}) => {
  const [entry, setEntry] = useState<PainEntry | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Load entry details when opened
  useEffect(() => {
    if (open && entryId) {
      setLoading(true);
      getEntry(String(entryId))
        .then((data) => {
          setEntry(data);
        })
        .catch((err) => {
          console.error('Failed to load entry:', err);
          setEntry(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setEntry(null);
    }
  }, [open, entryId]);
  
  const handleClose = () => {
    onOpenChange(false);
    onClose();
  };
  
  const handleEdit = () => {
    if (entry) {
      onEdit(entry);
    }
  };
  
  // Format date for header
  const formattedDate = date 
    ? format(parseISO(date), 'EEEE, d. MMMM yyyy', { locale: de })
    : '';
  
  const formattedTime = formatTime(time);
  
  // Get pain color for accent
  const painLevel = entry?.pain_level;
  let numericPain: number | null = null;
  if (painLevel) {
    if (typeof painLevel === 'number') {
      numericPain = painLevel;
    } else {
      const num = parseInt(painLevel);
      if (!isNaN(num)) {
        numericPain = num;
      } else {
        // Map text to number
        const t = painLevel.toLowerCase();
        if (t.includes('sehr') && t.includes('stark')) numericPain = 9;
        else if (t.includes('stark')) numericPain = 7;
        else if (t.includes('mittel')) numericPain = 5;
        else if (t.includes('leicht')) numericPain = 2;
      }
    }
  }
  const painColor = numericPain !== null ? getColorForPain(numericPain) : undefined;
  
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Eintrag"
      description={`${formattedDate}${formattedTime ? ` • ${formattedTime}` : ''}`}
      className="sm:max-w-md"
    >
      <div className="space-y-4 pb-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-3/4" />
          </div>
        ) : entry ? (
          <>
            {/* Pain Level */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
              <div 
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={painColor ? { backgroundColor: painColor } : { backgroundColor: 'hsl(var(--muted-foreground))' }}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Schmerzstärke: {getPainLevelLabel(entry.pain_level)}
                  {numericPain !== null && ` (${numericPain}/10)`}
                </p>
              </div>
            </div>
            
            {/* Pain Location */}
            {(entry as any).pain_location && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-foreground">
                  {painLocationLabels[(entry as any).pain_location] || (entry as any).pain_location}
                </p>
              </div>
            )}
            
            {/* Aura */}
            {(entry as any).aura_type && (entry as any).aura_type !== 'keine' && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-foreground">
                  {auraLabels[(entry as any).aura_type] || (entry as any).aura_type}
                </p>
              </div>
            )}
            
            {/* Medications */}
            {entry.medications && entry.medications.length > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <Pill className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex flex-wrap gap-1.5">
                  {entry.medications.map((med, idx) => (
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
            
            {/* Notes - truncated */}
            {entry.notes && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {entry.notes}
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
        <div className="flex gap-3 pt-2">
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
            disabled={!entry || loading}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Bearbeiten
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
};
