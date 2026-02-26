import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRelativeDateLabel } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { X, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCreateMedicationEffects } from "@/features/medication-effects/hooks/useMedicationEffects";
import type { UnratedMedicationEntry, MedicationEffectPayload } from "@/features/medication-effects/api/medicationEffects.api";

interface MedicationEffectRatingModalProps {
  open: boolean;
  onClose: () => void;
  unratedEntries: UnratedMedicationEntry[];
}

const effectRatings = [
  { value: 'none', label: '❌ Gar nicht geholfen', color: 'destructive' },
  { value: 'poor', label: '🔴 Schlecht geholfen', color: 'destructive' },
  { value: 'moderate', label: '🟡 Mittel geholfen', color: 'secondary' },
  { value: 'good', label: '🟢 Gut geholfen', color: 'default' },
  { value: 'very_good', label: '✅ Sehr gut geholfen', color: 'default' },
] as const;

const commonSideEffects = [
  'Übelkeit', 'Müdigkeit', 'Schwindel', 'Kopfschmerzen', 
  'Magenschmerzen', 'Herzrasen', 'Schwitzen'
];

interface MedicationRating {
  entryId: number;
  medName: string;
  rating: string;
  sideEffects: string[];
  notes: string;
}

export function MedicationEffectRatingModal({ 
  open, 
  onClose, 
  unratedEntries 
}: MedicationEffectRatingModalProps) {
  const { toast } = useToast();
  const createEffects = useCreateMedicationEffects();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratings, setRatings] = useState<MedicationRating[]>([]);

  // Flatten all unrated medications
  const allUnratedMeds = React.useMemo(() => {
    const meds: Array<{ entryId: number; medName: string; entryInfo: UnratedMedicationEntry }> = [];
    unratedEntries.forEach(entry => {
      const unratedMeds = entry.medications.filter(med => 
        !entry.rated_medications.includes(med)
      );
      unratedMeds.forEach(med => {
        meds.push({ entryId: entry.id, medName: med, entryInfo: entry });
      });
    });
    return meds;
  }, [unratedEntries]);

  const currentMed = allUnratedMeds[currentIndex];
  const currentRating = ratings.find(r => 
    r.entryId === currentMed?.entryId && r.medName === currentMed?.medName
  );

  React.useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setRatings([]);
    }
  }, [open]);

  const updateRating = (field: keyof MedicationRating, value: any) => {
    if (!currentMed) return;
    
    setRatings(prev => {
      const existing = prev.find(r => 
        r.entryId === currentMed.entryId && r.medName === currentMed.medName
      );
      
      if (existing) {
        return prev.map(r => 
          r.entryId === currentMed.entryId && r.medName === currentMed.medName
            ? { ...r, [field]: value }
            : r
        );
      } else {
        return [...prev, {
          entryId: currentMed.entryId,
          medName: currentMed.medName,
          rating: '',
          sideEffects: [],
          notes: '',
          [field]: value
        }];
      }
    });
  };

  const addSideEffect = (effect: string) => {
    const current = currentRating?.sideEffects || [];
    if (!current.includes(effect)) {
      updateRating('sideEffects', [...current, effect]);
    }
  };

  const removeSideEffect = (effect: string) => {
    const current = currentRating?.sideEffects || [];
    updateRating('sideEffects', current.filter(e => e !== effect));
  };

  const handleNext = () => {
    if (currentIndex < allUnratedMeds.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSave = async () => {
    const validRatings = ratings.filter(r => r.rating);
    
    if (validRatings.length === 0) {
      toast({
        title: "Keine Bewertungen",
        description: "Bitte bewerten Sie mindestens ein Medikament.",
        variant: "destructive"
      });
      return;
    }

    const payloads: MedicationEffectPayload[] = validRatings.map(rating => ({
      entry_id: rating.entryId,
      med_name: rating.medName,
      effect_rating: rating.rating as any,
      side_effects: rating.sideEffects,
      notes: rating.notes.trim(),
      method: 'ui',
      confidence: 'high'
    }));

    try {
      await createEffects.mutateAsync(payloads);
      onClose();
      toast({
        title: "Bewertungen gespeichert",
        description: `${validRatings.length} Medikamenten-Bewertung${validRatings.length > 1 ? 'en' : ''} wurden erfasst.`
      });
    } catch (error) {
      toast({
        title: "Fehler beim Speichern",
        description: "Die Bewertungen konnten nicht gespeichert werden.",
        variant: "destructive"
      });
    }
  };

  if (!currentMed) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md mx-auto max-h-[90vh] overflow-y-auto overflow-x-hidden modern-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>💊 Medikamenten-Wirkung</span>
            <Badge variant="outline" className="text-xs">
              {currentIndex + 1} / {allUnratedMeds.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entry Info */}
          <Card className="p-3 bg-muted/50">
            <div className="text-sm">
              <div className="font-medium">
                {formatRelativeDateLabel(currentMed.entryInfo.selected_date)} um {currentMed.entryInfo.selected_time}
              </div>
              <div className="text-muted-foreground">
                Schmerzstärke: {currentMed.entryInfo.pain_level}
              </div>
              <div className="font-medium text-primary mt-1">
                💊 {currentMed.medName}
              </div>
            </div>
          </Card>

          {/* Effect Rating */}
          <div>
            <Label className="text-sm font-medium">
              Wie gut hat {currentMed.medName} geholfen?
            </Label>
            <div className="grid gap-2 mt-2">
              {effectRatings.map((rating) => (
                <Button
                  key={rating.value}
                  variant={currentRating?.rating === rating.value ? "default" : "outline"}
                  size="sm"
                  className="justify-start h-auto py-2 text-left"
                  onClick={() => updateRating('rating', rating.value)}
                >
                  {rating.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Side Effects */}
          {currentRating?.rating && (
            <div>
              <Label className="text-sm font-medium">Nebenwirkungen (optional)</Label>
              <div className="flex flex-wrap gap-1 mt-2 mb-2">
                {(currentRating.sideEffects || []).map((effect) => (
                  <Badge key={effect} variant="secondary" className="text-xs">
                    {effect}
                    <button 
                      onClick={() => removeSideEffect(effect)}
                      className="ml-1 text-destructive hover:text-destructive/80"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {commonSideEffects
                  .filter(effect => !(currentRating.sideEffects || []).includes(effect))
                  .slice(0, 4)
                  .map((effect) => (
                  <Button
                    key={effect}
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => addSideEffect(effect)}
                  >
                    + {effect}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {currentRating?.rating && (
            <div>
              <Label className="text-sm font-medium">Zusätzliche Notizen</Label>
              <Textarea 
                value={currentRating.notes || ''}
                onChange={(e) => updateRating('notes', e.target.value)}
                placeholder="Weitere Details zur Wirkung..."
                className="text-sm"
                rows={2}
              />
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="flex-1"
            >
              ← Zurück
            </Button>
            {currentIndex < allUnratedMeds.length - 1 ? (
              <Button 
                onClick={handleNext}
                className="flex-1"
              >
                Weiter →
              </Button>
            ) : (
              <Button 
                onClick={handleSave}
                disabled={createEffects.isPending}
                className="flex-1"
              >
                {createEffects.isPending ? "Speichere..." : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Fertig
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Progress indicator */}
          <div className="text-xs text-muted-foreground text-center">
            {ratings.filter(r => r.rating).length} von {allUnratedMeds.length} bewertet
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}