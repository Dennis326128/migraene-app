import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PainSlider } from "@/components/ui/pain-slider";
import { normalizePainLevel } from "@/lib/utils/pain";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Activity, Pill, FileText } from "lucide-react";

interface QuickBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (entry: any) => void;
  availableMeds: Array<{id: string, name: string}>;
}

const painLevels = [
  { value: "2", label: "💚 Leicht (2)", icon: "💚" },
  { value: "4", label: "💛 Mittel (4)", icon: "💛" },
  { value: "6", label: "🟠 Mittel (6)", icon: "🟠" },
  { value: "7", label: "🟠 Stark (7)", icon: "🟠" },
  { value: "8", label: "🔴 Stark (8)", icon: "🔴" },
  { value: "9", label: "🔴 Sehr stark (9)", icon: "🔴" },
  { value: "10", label: "🔴 Sehr stark (10)", icon: "🔴" },
];

const timePresets = [
  { value: 'now', label: '🕐 Jetzt', desc: 'Aktuelle Zeit' },
  { value: '30m', label: '🕐 Vor 30 Min', desc: 'Vor 30 Minuten' },
  { value: '1h', label: '🕐 Vor 1 Std', desc: 'Vor 1 Stunde' },
  { value: '2h', label: '🕐 Vor 2 Std', desc: 'Vor 2 Stunden' },
  { value: 'morning', label: '🌅 Heute Morgen', desc: 'Heute um 8:00' },
  { value: 'yesterday', label: '📅 Gestern', desc: 'Gestern um diese Zeit' },
];

export function QuickBuilderModal({ open, onClose, onComplete, availableMeds }: QuickBuilderModalProps) {
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedPain, setSelectedPain] = useState<number>(7);
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [step, setStep] = useState<'time' | 'pain' | 'meds' | 'review'>('time');

  React.useEffect(() => {
    if (open) {
      setSelectedTime('');
      setSelectedPain(7);
      setSelectedMeds([]);
      setStep('time');
    }
  }, [open]);

  const calculateDateTime = (preset: string) => {
    const now = new Date();
    switch (preset) {
      case 'now':
        return {
          date: now.toISOString().split('T')[0],
          time: now.toTimeString().slice(0, 5)
        };
      case '30m':
        now.setMinutes(now.getMinutes() - 30);
        break;
      case '1h':
        now.setHours(now.getHours() - 1);
        break;
      case '2h':
        now.setHours(now.getHours() - 2);
        break;
      case 'morning':
        now.setHours(8, 0, 0, 0);
        break;
      case 'yesterday':
        now.setDate(now.getDate() - 1);
        break;
    }
    return {
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().slice(0, 5)
    };
  };

  const toggleMedication = (medName: string) => {
    setSelectedMeds(prev => 
      prev.includes(medName) 
        ? prev.filter(m => m !== medName)
        : [...prev, medName]
    );
  };

  const handleNext = () => {
    switch (step) {
      case 'time':
        if (selectedTime) setStep('pain');
        break;
      case 'pain':
        if (selectedPain) setStep('meds');
        break;
      case 'meds':
        setStep('review');
        break;
      case 'review':
        handleComplete();
        break;
    }
  };

  const handleComplete = () => {
    const { date, time } = calculateDateTime(selectedTime);
    
    const entry = {
      selectedDate: date,
      selectedTime: time,
      painLevel: selectedPain,
      medications: selectedMeds,
      notes: 'Schnell-Eingabe',
      isNow: selectedTime === 'now'
    };

    onComplete(entry);
  };

  const canProceed = () => {
    switch (step) {
      case 'time': return selectedTime !== '';
      case 'pain': return selectedPain >= 0;
      case 'meds': return true; // Optional
      case 'review': return true;
      default: return false;
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'time': return '🕐 Zeitpunkt wählen';
      case 'pain': return '🎯 Schmerzstärke wählen';
      case 'meds': return '💊 Medikamente (optional)';
      case 'review': return '👀 Zusammenfassung';
      default: return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress */}
          <div className="flex gap-1">
            {['time', 'pain', 'meds', 'review'].map((s, i) => (
              <div 
                key={s}
                className={`h-1 flex-1 rounded ${
                  step === s ? 'bg-primary' : 
                  ['time', 'pain', 'meds', 'review'].indexOf(step) > i ? 'bg-primary/50' : 'bg-secondary'
                }`}
              />
            ))}
          </div>

          {/* Time Selection */}
          {step === 'time' && (
            <div className="grid gap-2">
              {timePresets.map((preset) => (
                <Button
                  key={preset.value}
                  variant={selectedTime === preset.value ? "default" : "outline"}
                  size="sm"
                  className="justify-between h-auto py-3"
                  onClick={() => setSelectedTime(preset.value)}
                >
                  <span className="text-left">
                    <div className="font-medium">{preset.label}</div>
                    <div className="text-xs text-muted-foreground">{preset.desc}</div>
                  </span>
                </Button>
              ))}
            </div>
          )}

          {/* Pain Level Selection */}
          {step === 'pain' && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground text-center">
                Schieben Sie den Regler zur gewünschten Schmerzstärke:
              </div>
              <PainSlider 
                value={selectedPain} 
                onValueChange={setSelectedPain}
              />
            </div>
          )}

          {/* Medication Selection */}
          {step === 'meds' && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Tippen Sie auf die Medikamente, die Sie genommen haben:
              </div>
              <div className="grid gap-2">
                {availableMeds.slice(0, 6).map((med) => (
                  <Button
                    key={med.id}
                    variant={selectedMeds.includes(med.name) ? "default" : "outline"}
                    size="sm"
                    className="justify-start h-auto py-2"
                    onClick={() => toggleMedication(med.name)}
                  >
                    💊 {med.name}
                  </Button>
                ))}
              </div>
              {selectedMeds.length === 0 && (
                <div className="text-center py-4">
                  <div className="text-sm text-muted-foreground">
                    Keine Medikamente? Das ist auch okay!
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Review */}
          {step === 'review' && (
            <div className="space-y-3">
              <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">
                    {timePresets.find(p => p.value === selectedTime)?.label}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  <span className="text-sm">
                    Schmerzstärke: {selectedPain}/10
                  </span>
                </div>
                
                {selectedMeds.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Pill className="w-4 h-4 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {selectedMeds.map((med) => (
                        <Badge key={med} variant="secondary" className="text-xs">
                          {med}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="text-sm text-muted-foreground text-center">
                Bereit zum Speichern?
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {step !== 'time' && (
              <Button 
                variant="outline" 
                onClick={() => {
                  const steps = ['time', 'pain', 'meds', 'review'];
                  const currentIndex = steps.indexOf(step);
                  if (currentIndex > 0) {
                    setStep(steps[currentIndex - 1] as any);
                  }
                }}
                className="flex-1"
              >
                Zurück
              </Button>
            )}
            <Button 
              onClick={step === 'review' ? handleComplete : handleNext}
              disabled={!canProceed()}
              className="flex-1"
            >
              {step === 'review' ? 'Speichern' : 'Weiter'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}