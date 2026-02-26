import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, X, Clock, Calendar } from "lucide-react";
import { formatRelativeDateLabel } from "@/lib/dateUtils";
import { MedicationEffectSlider } from "@/components/ui/medication-effect-slider";
import { useToast } from "@/hooks/use-toast";
import { useCreateMedicationEffect } from "@/features/medication-effects/hooks/useMedicationEffects";
import { useMedicationSave } from "@/contexts/MedicationSaveContext";
import { useTouchClick } from "@/hooks/useTouchClick";
import type { RecentMedicationEntry, MedicationEffect } from "@/features/medication-effects/api/medicationEffects.api";

interface MedicationOverviewProps {
  entries: RecentMedicationEntry[];
}

const commonSideEffects = [
  'Übelkeit', 'Müdigkeit', 'Schwindel', 'Kopfschmerzen', 
  'Magenschmerzen', 'Herzrasen', 'Schwitzen'
];

interface MedicationCardProps {
  entry: RecentMedicationEntry;
  medication: string;
  existingEffect?: MedicationEffect;
}

function MedicationCard({ entry, medication, existingEffect }: MedicationCardProps) {
  const { toast } = useToast();
  const createEffect = useCreateMedicationEffect();
  const { addPendingSave, removePendingSave } = useMedicationSave();
  const [isExpanded, setIsExpanded] = useState(false);
  const [effectRating, setEffectRating] = useState(existingEffect?.effect_rating === 'none' ? 0 :
    existingEffect?.effect_rating === 'poor' ? 2 :
    existingEffect?.effect_rating === 'moderate' ? 5 :
    existingEffect?.effect_rating === 'good' ? 7 :
    existingEffect?.effect_rating === 'very_good' ? 9 : 0);
  const [sideEffects, setSideEffects] = useState<string[]>(existingEffect?.side_effects || []);
  const [notes, setNotes] = useState(existingEffect?.notes || "");
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Touch-safe expand/collapse
  const { handleTouchStart, handleTouchEnd } = useTouchClick(() => {
    setIsExpanded(!isExpanded);
  });
  
  // Store original values for cancel functionality
  const originalValues = React.useRef({
    effectRating: effectRating,
    sideEffects: [...sideEffects],
    notes: notes
  });

  const handleEffectChange = (value: number) => {
    setEffectRating(value);
    setHasChanges(true);
  };

  const handleSideEffectAdd = (effect: string) => {
    const newSideEffects = [...sideEffects, effect];
    setSideEffects(newSideEffects);
    setHasChanges(true);
  };

  const handleSideEffectRemove = (effect: string) => {
    const newSideEffects = sideEffects.filter(e => e !== effect);
    setSideEffects(newSideEffects);
    setHasChanges(true);
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setHasChanges(true);
  };

  const handleCancel = () => {
    setEffectRating(originalValues.current.effectRating);
    setSideEffects([...originalValues.current.sideEffects]);
    setNotes(originalValues.current.notes);
    setHasChanges(false);
  };

  const handleSave = async () => {
    if (!effectRating) {
      toast({
        title: "Wirkung erforderlich",
        description: "Bitte Wirkung bewerten",
        variant: "destructive",
      });
      return;
    }

    // Validate notes length
    if (notes && notes.length > 2000) {
      toast({
        title: "Notizen zu lang",
        description: "Notizen dürfen maximal 2000 Zeichen enthalten",
        variant: "destructive",
      });
      return;
    }

    // Validate side effects count
    if (sideEffects.length > 20) {
      toast({
        title: "Zu viele Nebenwirkungen",
        description: "Maximal 20 Nebenwirkungen können eingetragen werden",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    const saveId = `${entry.id}-${medication}`;
    const ratingValue = effectRating === 0 ? 'none' :
      effectRating <= 2 ? 'poor' :
      effectRating <= 4 ? 'moderate' :
      effectRating <= 7 ? 'good' : 'very_good';

    addPendingSave(saveId);
    
    try {
      await createEffect.mutateAsync({
        entry_id: entry.id,
        med_name: medication,
        effect_rating: ratingValue,
        side_effects: sideEffects.length > 0 ? sideEffects : null,
        notes: notes || null,
        method: 'ui',
        confidence: 'high'
      });

      // Update original values after successful save
      originalValues.current = {
        effectRating,
        sideEffects: [...sideEffects],
        notes
      };

      setHasChanges(false);
      toast({
        title: "✅ Gespeichert",
        description: `Wirkung von ${medication} wurde gespeichert`,
      });
    } catch (error) {
      console.error('Failed to save medication effect:', error);
      toast({
        title: "❌ Fehler",
        description: "Speichern fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
      removePendingSave(saveId);
    }
  };

  const getEffectColor = (rating: number) => {
    if (rating === 0) return "text-destructive";
    if (rating <= 2) return "text-red-500";
    if (rating <= 4) return "text-orange-500";
    if (rating <= 6) return "text-yellow-500";
    if (rating <= 8) return "text-green-500";
    return "text-success";
  };

  const formatDateTime = (date: string, time: string) => {
    return {
      date: formatRelativeDateLabel(date),
      time: time
    };
  };

  const { date, time } = formatDateTime(entry.selected_date, entry.selected_time);

  return (
    <Card className="mb-3 touch-manipulation">
      <CardHeader 
        className="pb-3 cursor-pointer select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">💊</span>
              <span className="font-medium text-sm sm:text-base">{medication}</span>
              {existingEffect && (
                <Badge variant="outline" className={getEffectColor(effectRating)}>
                  {effectRating}/10
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {date}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {time}
              </div>
              <Badge variant="secondary" className="text-xs">
                Schmerz: {entry.pain_level}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="outline" className="text-xs text-warning">
                Ungespeichert
              </Badge>
            )}
            {isSaving && (
              <Badge variant="outline" className="text-xs text-primary">
                Speichert...
              </Badge>
            )}
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Effect Rating Slider */}
            <div>
              <Label className="text-sm font-medium">
                Wie gut hat {medication} geholfen?
              </Label>
              <MedicationEffectSlider
                value={effectRating}
                onValueChange={handleEffectChange}
                className="mt-2"
              />
            </div>

            {/* Side Effects */}
            {effectRating > 0 && (
              <div>
                <Label className="text-sm font-medium">Nebenwirkungen</Label>
                {sideEffects.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 mb-2">
                    {sideEffects.map((effect) => (
                      <Badge key={effect} variant="secondary" className="text-xs">
                        {effect}
                        <button 
                          onClick={() => handleSideEffectRemove(effect)}
                          className="ml-1 text-destructive hover:text-destructive/80"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {commonSideEffects
                    .filter(effect => !sideEffects.includes(effect))
                    .slice(0, 4)
                    .map((effect) => (
                    <Button
                      key={effect}
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => handleSideEffectAdd(effect)}
                    >
                      + {effect}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {effectRating > 0 && (
              <div>
                <Label className="text-sm font-medium">Notizen</Label>
                <Textarea 
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Weitere Details zur Wirkung..."
                  className="text-sm mt-1"
                  rows={2}
                />
              </div>
            )}

            {/* Save and Cancel Buttons */}
            {hasChanges && (
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving}
                  className="flex-1"
                >
                  {isSaving ? "Speichert..." : "Speichern"}
                </Button>
                <Button 
                  onClick={handleCancel}
                  variant="outline"
                  disabled={isSaving}
                  className="flex-1"
                >
                  Abbrechen
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function MedicationOverview({ entries }: MedicationOverviewProps) {
  const [limit, setLimit] = useState(50);
  
  // Flatten medications with their entries (paginated)
  const medicationList = React.useMemo(() => {
    const list: Array<{ entry: RecentMedicationEntry; medication: string; existingEffect?: MedicationEffect }> = [];
    
    const limitedEntries = entries.slice(0, limit);
    limitedEntries.forEach(entry => {
      entry.medications.forEach(med => {
        const existingEffect = entry.medication_effects.find(effect => effect.med_name === med);
        list.push({ entry, medication: med, existingEffect });
      });
    });

    return list;
  }, [entries, limit]);

  const unratedCount = medicationList.filter(item => !item.existingEffect).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <span className="text-xl">💊</span>
            <span>Medikamenten-Wirkung</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Letzte 7 Tage • {medicationList.length} Einnahmen
          </p>
        </div>
        {unratedCount > 0 && (
          <Badge variant="outline" className="text-primary">
            {unratedCount} unbewertet
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {medicationList.length === 0 ? (
          <Card className="p-6 text-center">
            <div className="text-muted-foreground">
              <div className="text-3xl mb-2">💊</div>
              <p className="text-sm sm:text-base">Keine Medikamente in den letzten 7 Tagen</p>
            </div>
          </Card>
        ) : (
          medicationList.map((item, index) => (
            <MedicationCard
              key={`${item.entry.id}-${item.medication}-${index}`}
              entry={item.entry}
              medication={item.medication}
              existingEffect={item.existingEffect}
            />
          ))
        )}
      </div>
      
      {entries.length > limit && (
        <div className="mt-4 text-center">
          <Button 
            variant="outline" 
            onClick={() => setLimit(prev => prev + 50)}
            className="w-full"
          >
            Mehr laden ({entries.length - limit} weitere)
          </Button>
        </div>
      )}
    </div>
  );
}