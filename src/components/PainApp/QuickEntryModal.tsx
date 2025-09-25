import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Pill, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useCreateQuickPainEvent } from "@/features/events/hooks/useEvents";
import { useCheckMedicationLimits, type LimitCheck } from "@/features/medication-limits/hooks/useMedicationLimits";
import { MedicationLimitWarning } from "./MedicationLimitWarning";

interface QuickEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SelectedMedication {
  med_id: string;
  name: string;
  dose_mg: number;
  units: string;
  was_default: boolean;
}

const intensityLabels = [
  "Keine Schmerzen",
  "Sehr leicht", 
  "Leicht",
  "Leicht-mittel",
  "Mittel", 
  "Mittel-stark",
  "Stark",
  "Sehr stark",
  "Extrem stark",
  "Unerträglich",
  "Maximal"
];

export const QuickEntryModal: React.FC<QuickEntryModalProps> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const { data: medications = [] } = useMeds();
  const createQuickEvent = useCreateQuickPainEvent();

  const [intensity, setIntensity] = useState([7]); // 0-10 scale, default 7
  const [selectedMeds, setSelectedMeds] = useState<Record<string, SelectedMedication>>({});
  const [takenTime, setTakenTime] = useState<"now" | "15min" | "custom">("now");
  const [customTime, setCustomTime] = useState("");

  // Medication limit checking
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [limitChecks, setLimitChecks] = useState<LimitCheck[]>([]);
  const [pendingSave, setPendingSave] = useState(false);
  
  const checkLimits = useCheckMedicationLimits();

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setIntensity([7]);
      setSelectedMeds({});
      setTakenTime("now");
      setCustomTime("");
      setShowLimitWarning(false);
      setPendingSave(false);
    }
  }, [open]);

  const handleMedToggle = (medId: string, checked: boolean) => {
    if (checked) {
      const med = medications.find(m => m.id === medId);
      if (med) {
        setSelectedMeds(prev => ({
          ...prev,
          [medId]: {
            med_id: medId,
            name: med.name,
            dose_mg: 1, // Default dose
            units: "Stück",
            was_default: false
          }
        }));
      }
    } else {
      setSelectedMeds(prev => {
        const { [medId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleDoseChange = (medId: string, dose: number) => {
    setSelectedMeds(prev => ({
      ...prev,
      [medId]: {
        ...prev[medId],
        dose_mg: dose
      }
    }));
  };

  const handleUnitsChange = (medId: string, units: string) => {
    setSelectedMeds(prev => ({
      ...prev,
      [medId]: {
        ...prev[medId],
        units
      }
    }));
  };

  const getIntensityColor = (value: number) => {
    if (value <= 2) return "hsl(var(--success))";
    if (value <= 4) return "hsl(var(--warning))";
    if (value <= 6) return "hsl(var(--orange))";
    if (value <= 8) return "hsl(var(--destructive))";
    return "hsl(var(--danger))";
  };

  const handleSave = async () => {
    const selectedMedsList = Object.values(selectedMeds);
    const medicationNames = selectedMedsList.map(med => med.name).filter(Boolean);
    
    // Check medication limits before saving
    if (medicationNames.length > 0 && !pendingSave) {
      try {
        const limitResults = await checkLimits.mutateAsync(medicationNames);
        const warningNeeded = limitResults.some(result => 
          result.status === 'warning' || result.status === 'reached' || result.status === 'exceeded'
        );
        
        if (warningNeeded) {
          setLimitChecks(limitResults);
          setShowLimitWarning(true);
          return;
        }
      } catch (error) {
        console.error('Error checking medication limits:', error);
      }
    }

    await performSave();
  };

  const performSave = async () => {
    setPendingSave(false);
    try {
      const selectedMedsList = Object.values(selectedMeds);
      
      await createQuickEvent.mutateAsync({
        intensity_0_10: intensity[0],
        medications: selectedMedsList
      });

      toast({
        title: "✅ Schnelleintrag gespeichert",
        description: "Medikamenteneinnahme wurde erfolgreich dokumentiert. Reminder für Wirksamkeit in 2h gesetzt."
      });
      
      // Success animation delay
      setTimeout(() => {
        onOpenChange(false);
      }, 1000);

      onOpenChange(false);
    } catch (error) {
      toast({
        title: "❌ Fehler beim Speichern",
        description: "Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    }
  };

  const selectedMedCount = Object.keys(selectedMeds).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="w-5 h-5 text-destructive" />
            Schnelleintrag - Tabletteneinnahme
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Schmerzintensität */}
          <Card>
            <CardContent className="pt-6">
              <Label className="text-base font-medium mb-4 block">
                🩺 Aktuelle Schmerzintensität
              </Label>
              
              <div className="space-y-4">
                <div className="px-4">
                  <Slider
                    value={intensity}
                    onValueChange={setIntensity}
                    max={10}
                    min={0}
                    step={1}
                    className="w-full"
                  />
                </div>
                
                <div className="text-center">
                  <div 
                    className="text-2xl font-bold mb-1"
                    style={{ color: getIntensityColor(intensity[0]) }}
                  >
                    {intensity[0]}/10
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {intensityLabels[intensity[0]]}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timing */}
          <Card>
            <CardContent className="pt-6">
              <Label className="text-base font-medium mb-4 block flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Einnahmezeitpunkt
              </Label>
              
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={takenTime === "now" ? "default" : "outline"}
                  onClick={() => setTakenTime("now")}
                  className="text-sm"
                >
                  Jetzt
                </Button>
                <Button
                  type="button"
                  variant={takenTime === "15min" ? "default" : "outline"}
                  onClick={() => setTakenTime("15min")}
                  className="text-sm"
                >
                  Vor 15 Min
                </Button>
                <Button
                  type="button"
                  variant={takenTime === "custom" ? "default" : "outline"}
                  onClick={() => setTakenTime("custom")}
                  className="text-sm"
                >
                  Zeit wählen
                </Button>
              </div>
              
              {takenTime === "custom" && (
                <div className="mt-3">
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Medikamente */}
          <Card>
            <CardContent className="pt-6">
              <Label className="text-base font-medium mb-4 block">
                💊 Eingenommene Medikamente ({selectedMedCount})
              </Label>
              
              {medications.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">
                  Keine Medikamente gespeichert. Gehen Sie zu Einstellungen → Medikamente.
                </div>
              ) : (
                <div className="space-y-3">
                  {medications.map((med) => {
                    const isSelected = selectedMeds[med.id];
                    return (
                      <div key={med.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <Switch
                              checked={!!isSelected}
                              onCheckedChange={(checked) => handleMedToggle(med.id, checked)}
                              aria-label={`${med.name} auswählen`}
                            />
                            <span className="font-medium">{med.name}</span>
                          </div>
                        </div>
                        
                        {isSelected && (
                          <div className="ml-8 grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">Dosis</Label>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="number"
                                  min="0.5"
                                  max="10"
                                  step="0.5"
                                  value={isSelected.dose_mg}
                                  onChange={(e) => handleDoseChange(med.id, parseFloat(e.target.value) || 1)}
                                  className="w-20 px-2 py-1 text-sm border rounded"
                                />
                                <Select
                                  value={isSelected.units}
                                  onValueChange={(value) => handleUnitsChange(med.id, value)}
                                >
                                  <SelectTrigger className="w-24 h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Stück">Stück</SelectItem>
                                    <SelectItem value="mg">mg</SelectItem>
                                    <SelectItem value="ml">ml</SelectItem>
                                    <SelectItem value="Tropfen">Tropfen</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Aktionsbuttons */}
          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createQuickEvent.isPending}
            >
              Abbrechen
            </Button>
            
            <Button
              onClick={handleSave}
              disabled={createQuickEvent.isPending}
              className="min-w-32"
            >
              {createQuickEvent.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Speichern...
                </>
              ) : (
                <>
                  💾 Speichern
                </>
              )}
            </Button>
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground text-center bg-muted/30 rounded-lg p-3">
            ℹ️ Nach der Einnahme erhalten Sie in 2h eine Erinnerung zur Wirkungsdokumentation
          </div>
        </div>
      </DialogContent>

      {/* Medication Limit Warning Dialog */}
      <MedicationLimitWarning
        isOpen={showLimitWarning}
        onOpenChange={setShowLimitWarning}
        limitChecks={limitChecks}
        onContinue={() => {
          setPendingSave(true);
          setShowLimitWarning(false);
          performSave();
        }}
        onCancel={() => {
          setShowLimitWarning(false);
          setPendingSave(false);
        }}
      />
    </Dialog>
  );
};