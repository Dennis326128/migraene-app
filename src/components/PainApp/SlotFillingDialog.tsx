import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Volume2, Clock, Pill, Activity } from "lucide-react";

interface SlotFillingDialogProps {
  currentSlot: 'time' | 'pain' | 'meds';
  progress: number;
  totalSlots: number;
  isSpeaking: boolean;
  spokenText: string;
  onQuickSelect: (slot: string, value: string) => void;
  onManualInput: () => void;
  onSkip: () => void;
  onCancel: () => void;
  availableMeds?: string[];
}

export function SlotFillingDialog({
  currentSlot,
  progress,
  totalSlots,
  isSpeaking,
  spokenText,
  onQuickSelect,
  onManualInput,
  onSkip,
  onCancel,
  availableMeds = []
}: SlotFillingDialogProps) {
  const getSlotIcon = () => {
    switch (currentSlot) {
      case 'time': return <Clock className="h-5 w-5" />;
      case 'pain': return <Activity className="h-5 w-5" />;
      case 'meds': return <Pill className="h-5 w-5" />;
    }
  };

  const getSlotTitle = () => {
    switch (currentSlot) {
      case 'time': return 'Zeitpunkt';
      case 'pain': return 'Schmerzstufe';
      case 'meds': return 'Medikament';
    }
  };

  const getQuickOptions = () => {
    switch (currentSlot) {
      case 'time':
        return [
          { label: 'Jetzt', value: 'now' },
          { label: 'Vor 30 Min', value: '30min_ago' },
          { label: 'Vor 1 Std', value: '1hour_ago' },
          { label: 'Vor 2 Std', value: '2hours_ago' },
          { label: 'Gestern 17:00', value: 'yesterday_17' }
        ];
      
      case 'pain':
        return [
          { label: '3 (Leicht)', value: '3' },
          { label: '4', value: '4' },
          { label: '5 (Mittel)', value: '5' },
          { label: '6', value: '6' },
          { label: '7 (Stark)', value: '7' },
          { label: '8', value: '8' },
          { label: '9 (Sehr stark)', value: '9' }
        ];
      
      case 'meds':
        const commonMeds = [
          { label: 'Sumatriptan 50mg', value: 'Sumatriptan 50mg' },
          { label: 'Ibuprofen 600mg', value: 'Ibuprofen 600mg' },
          { label: 'Aspirin', value: 'Aspirin' },
          { label: 'Keine Medikamente', value: 'none' }
        ];
        
        // Add user's medications if available
        const userMedOptions = availableMeds.slice(0, 3).map(med => ({
          label: med,
          value: med
        }));
        
        return [...userMedOptions, ...commonMeds];
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with progress */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getSlotIcon()}
            <h3 className="text-lg font-semibold">{getSlotTitle()}</h3>
          </div>
          <Badge variant="outline">
            {progress}/{totalSlots} komplett
          </Badge>
        </div>
        
        <Progress value={(progress / totalSlots) * 100} className="h-2" />
      </div>

      {/* Speaking indicator and subtitle */}
      {isSpeaking && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border">
          <Volume2 className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-sm text-muted-foreground">{spokenText}</span>
        </div>
      )}

      {/* Quick selection options */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Wähle eine Option oder antworte mit der Stimme:
        </p>
        
        <div className="grid grid-cols-2 gap-2">
          {getQuickOptions().map((option, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className="h-auto p-3 text-left justify-start"
              onClick={() => onQuickSelect(currentSlot, option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={onManualInput}
          className="flex-1"
        >
          Tippen
        </Button>
        
        {currentSlot === 'meds' && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSkip}
            className="flex-1"
          >
            Überspringen
          </Button>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
}