import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Star, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MedicationEffectModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (effect: MedicationEffect) => void;
  medicationEntry?: {
    id: number;
    medications: string[];
    selected_date: string;
    selected_time: string;
    pain_level: string;
  };
}

export interface MedicationEffect {
  entry_id: number;
  med_name: string;
  effect_rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good';
  side_effects: string[];
  notes: string;
  method: 'ui' | 'voice';
  confidence: 'high' | 'medium';
}

const effectRatings = [
  { value: 'none', label: '❌ Gar nicht geholfen', color: 'bg-red-100 text-red-800' },
  { value: 'poor', label: '🔴 Schlecht geholfen', color: 'bg-red-50 text-red-700' },
  { value: 'moderate', label: '🟡 Mittel geholfen', color: 'bg-yellow-50 text-yellow-700' },
  { value: 'good', label: '🟢 Gut geholfen', color: 'bg-green-50 text-green-700' },
  { value: 'very_good', label: '✅ Sehr gut geholfen', color: 'bg-green-100 text-green-800' },
];

const commonSideEffects = [
  'Übelkeit', 'Müdigkeit', 'Schwindel', 'Kopfschmerzen', 
  'Magenschmerzen', 'Herzrasen', 'Schwitzen'
];

export function MedicationEffectModal({ 
  open, 
  onClose, 
  onSave, 
  medicationEntry 
}: MedicationEffectModalProps) {
  const { toast } = useToast();
  const [selectedMed, setSelectedMed] = useState<string>('');
  const [effectRating, setEffectRating] = useState<string>('');
  const [sideEffects, setSideEffects] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (open && medicationEntry) {
      // Auto-select first medication if only one
      if (medicationEntry.medications.length === 1) {
        setSelectedMed(medicationEntry.medications[0]);
      }
      // Reset form
      setEffectRating('');
      setSideEffects([]);
      setNotes('');
    }
  }, [open, medicationEntry]);

  const addSideEffect = (effect: string) => {
    if (!sideEffects.includes(effect)) {
      setSideEffects(prev => [...prev, effect]);
    }
  };

  const removeSideEffect = (effect: string) => {
    setSideEffects(prev => prev.filter(e => e !== effect));
  };

  const handleSave = () => {
    if (!medicationEntry || !selectedMed || !effectRating) {
      toast({
        title: "Eingabe unvollständig",
        description: "Bitte wählen Sie ein Medikament und eine Bewertung.",
        variant: "destructive"
      });
      return;
    }

    const effect: MedicationEffect = {
      entry_id: medicationEntry.id,
      med_name: selectedMed,
      effect_rating: effectRating as any,
      side_effects: sideEffects,
      notes: notes.trim(),
      method: 'ui',
      confidence: 'high'
    };

    onSave(effect);
    onClose();
    
    toast({
      title: "✅ Wirkung gespeichert",
      description: `Bewertung für ${selectedMed} wurde erfasst.`
    });
  };

  if (!medicationEntry) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md mx-auto max-h-[90vh] overflow-y-auto overflow-x-hidden modern-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            💊 Medikamenten-Wirkung
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entry Info */}
          <Card className="p-3 bg-secondary/50">
            <div className="text-sm">
              <div className="font-medium">
                {medicationEntry.selected_date} um {medicationEntry.selected_time}
              </div>
              <div className="text-muted-foreground">
                Schmerzstärke: {medicationEntry.pain_level}
              </div>
            </div>
          </Card>

          {/* Medication Selection */}
          <div>
            <Label className="text-sm font-medium">Welches Medikament bewerten?</Label>
            <div className="grid gap-2 mt-2">
              {medicationEntry.medications.map((med) => (
                <Button
                  key={med}
                  variant={selectedMed === med ? "default" : "outline"}
                  size="sm"
                  className="justify-start h-auto py-2"
                  onClick={() => setSelectedMed(med)}
                >
                  💊 {med}
                </Button>
              ))}
            </div>
          </div>

          {/* Effect Rating */}
          {selectedMed && (
            <div>
              <Label className="text-sm font-medium">
                Wie gut hat {selectedMed} geholfen?
              </Label>
              <div className="grid gap-2 mt-2">
                {effectRatings.map((rating) => (
                  <Button
                    key={rating.value}
                    variant={effectRating === rating.value ? "default" : "outline"}
                    size="sm"
                    className="justify-start h-auto py-2 text-left"
                    onClick={() => setEffectRating(rating.value)}
                  >
                    {rating.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Side Effects */}
          {effectRating && (
            <div>
              <Label className="text-sm font-medium">Nebenwirkungen (optional)</Label>
              <div className="flex flex-wrap gap-1 mt-2 mb-2">
                {sideEffects.map((effect) => (
                  <Badge key={effect} variant="secondary" className="text-xs">
                    {effect}
                    <button 
                      onClick={() => removeSideEffect(effect)}
                      className="ml-1 text-red-500 hover:text-red-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
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
                    onClick={() => addSideEffect(effect)}
                  >
                    + {effect}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {effectRating && (
            <div>
              <Label className="text-sm font-medium">Zusätzliche Notizen</Label>
              <Textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Weitere Details zur Wirkung..."
                className="text-sm"
                rows={2}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
            >
              Abbrechen
            </Button>
            <SaveButton 
              onClick={handleSave}
              disabled={!selectedMed || !effectRating}
              className="flex-1"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}