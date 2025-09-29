import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, X, Clock, Calendar } from "lucide-react";
import { MedicationEffectSlider } from "@/components/ui/medication-effect-slider";
import { useToast } from "@/hooks/use-toast";
import { useCreateMedicationEffect } from "@/features/medication-effects/hooks/useMedicationEffects";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [effectRating, setEffectRating] = useState(existingEffect?.effect_rating === 'none' ? 0 :
    existingEffect?.effect_rating === 'poor' ? 2 :
    existingEffect?.effect_rating === 'moderate' ? 5 :
    existingEffect?.effect_rating === 'good' ? 7 :
    existingEffect?.effect_rating === 'very_good' ? 9 : 0);
  const [sideEffects, setSideEffects] = useState<string[]>(existingEffect?.side_effects || []);
  const [notes, setNotes] = useState(existingEffect?.notes || "");
  const [hasChanges, setHasChanges] = useState(false);

  const handleEffectChange = (value: number) => {
    setEffectRating(value);
    setHasChanges(true);
    saveEffect(value, sideEffects, notes);
  };

  const handleSideEffectAdd = (effect: string) => {
    const newSideEffects = [...sideEffects, effect];
    setSideEffects(newSideEffects);
    setHasChanges(true);
    saveEffect(effectRating, newSideEffects, notes);
  };

  const handleSideEffectRemove = (effect: string) => {
    const newSideEffects = sideEffects.filter(e => e !== effect);
    setSideEffects(newSideEffects);
    setHasChanges(true);
    saveEffect(effectRating, newSideEffects, notes);
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setHasChanges(true);
    // Debounce notes saving
    setTimeout(() => {
      saveEffect(effectRating, sideEffects, value);
    }, 1000);
  };

  const saveEffect = async (rating: number, effects: string[], noteText: string) => {
    const ratingValue = rating === 0 ? 'none' :
      rating <= 2 ? 'poor' :
      rating <= 4 ? 'moderate' :
      rating <= 7 ? 'good' : 'very_good';

    try {
      await createEffect.mutateAsync({
        entry_id: entry.id,
        med_name: medication,
        effect_rating: ratingValue,
        side_effects: effects,
        notes: noteText.trim(),
        method: 'ui',
        confidence: 'high'
      });
      setHasChanges(false);
    } catch (error) {
      toast({
        title: "Fehler beim Speichern",
        description: "Die Bewertung konnte nicht gespeichert werden.",
        variant: "destructive"
      });
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
    const dateObj = new Date(date);
    return {
      date: dateObj.toLocaleDateString('de-DE', { 
        weekday: 'short', 
        day: '2-digit', 
        month: '2-digit' 
      }),
      time: time
    };
  };

  const { date, time } = formatDateTime(entry.selected_date, entry.selected_time);

  return (
    <Card className="mb-3">
      <CardHeader 
        className="pb-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">💊</span>
              <span className="font-medium">{medication}</span>
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
              <div className="text-xs text-primary">Speichert...</div>
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
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function MedicationOverview({ entries }: MedicationOverviewProps) {
  // Flatten medications with their entries
  const medicationList = React.useMemo(() => {
    const list: Array<{ entry: RecentMedicationEntry; medication: string; existingEffect?: MedicationEffect }> = [];
    
    entries.forEach(entry => {
      entry.medications.forEach(med => {
        const existingEffect = entry.medication_effects.find(effect => effect.med_name === med);
        list.push({ entry, medication: med, existingEffect });
      });
    });

    return list;
  }, [entries]);

  const unratedCount = medicationList.filter(item => !item.existingEffect).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">💊 Medikamenten-Übersicht</h2>
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
              <div className="text-4xl mb-2">💊</div>
              <p>Keine Medikamente in den letzten 7 Tagen</p>
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
    </div>
  );
}