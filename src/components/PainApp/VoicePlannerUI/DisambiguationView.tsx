/**
 * DisambiguationView - Shows 2 options when intent scores are close
 * 
 * "Meintest du: [Intent1] oder [Intent2]?"
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { HelpCircle, ChevronLeft } from 'lucide-react';
import { getIntentLabel, getIntentIcon } from '@/lib/voice/intentLabels';
import { cn } from '@/lib/utils';

export interface DisambiguationOption {
  intent: string;
  score: number;
}

interface DisambiguationViewProps {
  options: [DisambiguationOption, DisambiguationOption];
  transcript: string;
  onSelect: (intent: string) => void;
  onBack: () => void;
  onShowAll: () => void;
}

export function DisambiguationView({
  options,
  transcript,
  onSelect,
  onBack,
  onShowAll,
}: DisambiguationViewProps) {
  const [option1, option2] = options;
  const Icon1 = getIntentIcon(option1.intent);
  const Icon2 = getIntentIcon(option2.intent);
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-primary/10">
          <HelpCircle className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">
            Ich bin mir nicht ganz sicher:
          </p>
          <p className="font-medium text-foreground">
            Was meintest du?
          </p>
        </div>
      </div>
      
      {/* Transcript preview */}
      {transcript && (
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-sm text-muted-foreground italic">
            "{transcript.length > 60 ? transcript.substring(0, 60) + '...' : transcript}"
          </p>
        </div>
      )}
      
      {/* Two options as large buttons */}
      <div className="grid grid-cols-1 gap-3">
        <Button
          variant="outline"
          className={cn(
            "h-auto flex items-center gap-3 p-4 text-left",
            "hover:bg-primary/5 hover:border-primary",
            "transition-colors"
          )}
          onClick={() => onSelect(option1.intent)}
        >
          <div className="p-2 rounded-full bg-primary/10">
            <Icon1 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium">{getIntentLabel(option1.intent)}</p>
            <p className="text-xs text-muted-foreground">
              {Math.round(option1.score * 100)}% Sicherheit
            </p>
          </div>
        </Button>
        
        <Button
          variant="outline"
          className={cn(
            "h-auto flex items-center gap-3 p-4 text-left",
            "hover:bg-primary/5 hover:border-primary",
            "transition-colors"
          )}
          onClick={() => onSelect(option2.intent)}
        >
          <div className="p-2 rounded-full bg-muted">
            <Icon2 className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-medium">{getIntentLabel(option2.intent)}</p>
            <p className="text-xs text-muted-foreground">
              {Math.round(option2.score * 100)}% Sicherheit
            </p>
          </div>
        </Button>
      </div>
      
      {/* Bottom actions */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-muted-foreground"
          onClick={onBack}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Zurück
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-muted-foreground"
          onClick={onShowAll}
        >
          Alle Optionen
        </Button>
      </div>
    </div>
  );
}
