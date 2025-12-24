import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronRight, Clock, CheckCircle, ChevronDown, ChevronUp, X, ArrowLeft } from 'lucide-react';
import { getEffectLabel, getEffectEmoji, getEffectiveScore, COMMON_SIDE_EFFECTS } from '@/lib/utils/medicationEffects';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { MedicationEffectSlider } from '@/components/ui/medication-effect-slider';
import { normalizePainLevel } from '@/lib/utils/pain';
import { useUpdateMedicationEffect } from '../hooks/useMedicationEffects';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { RecentMedicationEntry, MedicationEffect } from '../api/medicationEffects.api';

interface RatedEffectCardProps {
  entry: RecentMedicationEntry;
  effect: MedicationEffect;
}

/** Format date/time to German format: "12.12.2025, 12:05 Uhr" */
function formatGermanDateTime(date: string | null, time: string | null): string {
  if (!date) return '';
  
  // Parse date (expected: YYYY-MM-DD)
  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year}`;
  
  // Format time without seconds
  let formattedTime = '';
  if (time) {
    const timeParts = time.split(':');
    formattedTime = `${timeParts[0]}:${timeParts[1]}`;
  }
  
  return formattedTime ? `${formattedDate}, ${formattedTime} Uhr` : formattedDate;
}

/** Get pain severity level for color coding */
function getPainSeverityLevel(score: number): 'mild' | 'moderate' | 'severe' {
  if (score <= 3) return 'mild';
  if (score <= 6) return 'moderate';
  return 'severe';
}

/** Get pain dot color based on severity */
function getPainDotColor(level: 'mild' | 'moderate' | 'severe'): string {
  switch (level) {
    case 'mild':
      return 'bg-emerald-400';
    case 'moderate':
      return 'bg-amber-400';
    case 'severe':
      return 'bg-rose-400';
  }
}

/** Convert DB score (0-10) to slider scale (0-5) */
function dbScoreToSlider(dbScore: number | null): number {
  if (dbScore === null || dbScore === undefined) return 0;
  return Math.round(dbScore / 2);
}

/** Convert slider scale (0-5) to DB score (0-10) */
function sliderToDbScore(sliderValue: number): number {
  return sliderValue * 2;
}

/** Convert slider value to effect_rating for backwards compatibility */
function sliderToEffectRating(sliderValue: number): 'none' | 'poor' | 'moderate' | 'good' | 'very_good' {
  if (sliderValue <= 0) return 'none';
  if (sliderValue <= 1) return 'poor';
  if (sliderValue <= 2) return 'moderate';
  if (sliderValue <= 3) return 'good';
  return 'very_good';
}

export function RatedEffectCard({ entry, effect }: RatedEffectCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const updateEffect = useUpdateMedicationEffect();
  
  // Get the initial DB score (0-10) and convert to slider scale (0-5)
  const initialDbScore = getEffectiveScore(effect.effect_score, effect.effect_rating);
  const initialSliderValue = dbScoreToSlider(initialDbScore);
  
  // Local state for editing - uses slider scale (0-5)
  const [sliderValue, setSliderValue] = useState(initialSliderValue);
  const [sideEffects, setSideEffects] = useState<string[]>(effect.side_effects || []);
  const [notes, setNotes] = useState(effect.notes || '');
  const [isSideEffectsOpen, setIsSideEffectsOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  
  // Reset state when sheet opens with current effect values
  useEffect(() => {
    if (detailsOpen) {
      const dbScore = getEffectiveScore(effect.effect_score, effect.effect_rating);
      setSliderValue(dbScoreToSlider(dbScore));
      setSideEffects(effect.side_effects || []);
      setNotes(effect.notes || '');
    }
  }, [detailsOpen, effect]);
  
  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    const originalSliderValue = dbScoreToSlider(getEffectiveScore(effect.effect_score, effect.effect_rating));
    const originalSideEffects = effect.side_effects || [];
    const originalNotes = effect.notes || '';
    
    return (
      sliderValue !== originalSliderValue ||
      JSON.stringify(sideEffects.sort()) !== JSON.stringify([...originalSideEffects].sort()) ||
      notes !== originalNotes
    );
  }, [sliderValue, sideEffects, notes, effect]);
  
  // Normalize pain level to numeric (0-10)
  const painScore = normalizePainLevel(entry.pain_level);
  const painSeverity = getPainSeverityLevel(painScore);

  const toggleSideEffect = (sideEffect: string) => {
    if (sideEffects.includes(sideEffect)) {
      setSideEffects(sideEffects.filter(e => e !== sideEffect));
    } else {
      setSideEffects([...sideEffects, sideEffect]);
    }
  };

  const handleSave = async () => {
    try {
      await updateEffect.mutateAsync({
        effectId: effect.id,
        payload: {
          effect_score: sliderToDbScore(sliderValue),
          effect_rating: sliderToEffectRating(sliderValue),
          side_effects: sideEffects,
          notes: notes.trim()
        }
      });
      toast.success('Wirkung gespeichert');
      setDetailsOpen(false);
    } catch (error) {
      console.error('Failed to update effect:', error);
      toast.error('Fehler beim Speichern');
    }
  };

  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const handleBack = () => {
    if (hasChanges) {
      setShowDiscardDialog(true);
    } else {
      setDetailsOpen(false);
    }
  };

  const handleDiscard = () => {
    setShowDiscardDialog(false);
    setDetailsOpen(false);
  };

  const handleSaveAndClose = async () => {
    setShowDiscardDialog(false);
    await handleSave();
  };

  // For card display, use the original effect score
  const displayScore = initialDbScore;

  return (
    <>
      <Card 
        className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setDetailsOpen(true)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Row 1: Medication Name */}
            <div className="font-medium truncate mb-1.5">💊 {effect.med_name}</div>
            
            {/* Row 2: Effect Badge + Pain Badge side by side */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge 
                variant={displayScore !== null && displayScore >= 5 ? 'default' : 'secondary'}
                className="text-xs shrink-0"
              >
                {getEffectEmoji(displayScore)} {getEffectLabel(displayScore)}
              </Badge>
              <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 bg-slate-800 text-slate-100 text-xs font-medium shrink-0 whitespace-nowrap">
                <span className={`h-2 w-2 rounded-full ${getPainDotColor(painSeverity)}`} />
                <span>Schmerz {painScore}/10</span>
              </div>
            </div>
            
            {/* Row 3: Date/Time */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatGermanDateTime(entry.selected_date, entry.selected_time)}
            </div>
          </div>

          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </div>
      </Card>

      {/* Detail Sheet - Editable */}
      <Sheet open={detailsOpen} onOpenChange={(open) => {
        if (!open && hasChanges) {
          setShowDiscardDialog(true);
        } else {
          setDetailsOpen(open);
        }
      }}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
          {/* Sticky Header with Back Button */}
          <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleBack}
              disabled={updateEffect.isPending}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-lg truncate">💊 {effect.med_name}</h2>
              <p className="text-xs text-muted-foreground">
                {formatGermanDateTime(entry.selected_date, entry.selected_time)}
              </p>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
            <div className="space-y-4">
              {/* Entry Info */}
              <Card className="p-3 bg-muted/50">
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Schmerzstärke:</span>
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 bg-slate-800 text-slate-100 text-xs font-medium">
                      <span className={`h-2 w-2 rounded-full ${getPainDotColor(painSeverity)}`} />
                      <span>{painScore}/10</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Effect Score - EDITABLE */}
              <div className="space-y-2">
                <Label className="text-base font-medium">Wirkung</Label>
                <MedicationEffectSlider
                  value={sliderValue}
                  onValueChange={setSliderValue}
                  disabled={updateEffect.isPending}
                />
              </div>

              {/* Collapsible: Side Effects */}
              <Collapsible open={isSideEffectsOpen} onOpenChange={setIsSideEffectsOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-auto py-2 px-3 hover:bg-muted/50"
                  >
                    <span className="text-sm font-medium">
                      Nebenwirkungen {sideEffects.length > 0 && `(${sideEffects.length})`}
                    </span>
                    {isSideEffectsOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {/* Selected side effects */}
                  {sideEffects.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sideEffects.map((sideEffect) => (
                        <Badge key={sideEffect} variant="secondary" className="text-xs pr-1">
                          {sideEffect}
                          <button 
                            onClick={() => toggleSideEffect(sideEffect)}
                            className="ml-1 hover:text-destructive"
                            disabled={updateEffect.isPending}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {/* Available side effects chips */}
                  <div className="flex flex-wrap gap-1">
                    {COMMON_SIDE_EFFECTS
                      .filter(se => !sideEffects.includes(se))
                      .slice(0, 8)
                      .map((sideEffect) => (
                        <Button
                          key={sideEffect}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => toggleSideEffect(sideEffect)}
                          disabled={updateEffect.isPending}
                        >
                          + {sideEffect}
                        </Button>
                      ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Collapsible: Notes */}
              <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-auto py-2 px-3 hover:bg-muted/50"
                  >
                    <span className="text-sm font-medium">
                      Notizen {notes.trim() && "(vorhanden)"}
                    </span>
                    {isNotesOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <Textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Weitere Details..."
                    className="text-sm resize-none"
                    rows={2}
                    disabled={updateEffect.isPending}
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Metadata */}
              <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                <div>Erfasst: {new Date(effect.created_at).toLocaleDateString('de-DE')} um {new Date(effect.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</div>
                <div>Eingabeart: {effect.method === 'voice' ? '🎤 Sprache' : '✍️ Manuell'}</div>
              </div>
            </div>
          </div>

          {/* Sticky Footer with Save Button */}
          <div className="sticky bottom-0 z-10 bg-background border-t px-4 py-3 safe-area-pb">
            <Button
              onClick={handleSave}
              disabled={updateEffect.isPending || !hasChanges}
              className="w-full"
              size="lg"
            >
              {updateEffect.isPending ? (
                'Speichert...'
              ) : hasChanges ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Änderungen speichern
                </>
              ) : (
                'Keine Änderungen'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog for Unsaved Changes */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Änderungen speichern?</AlertDialogTitle>
            <AlertDialogDescription>
              Du hast ungespeicherte Änderungen. Möchtest du diese speichern?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscard}>
              Verwerfen
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndClose}>
              Speichern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
