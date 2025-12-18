/**
 * NotSupportedView - UI wenn der Befehl nicht verstanden wurde
 * 
 * Zeigt eine freundliche Nachricht + Vorschläge für mögliche Aktionen
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  HelpCircle, 
  ChevronLeft,
  Lightbulb,
  ArrowRight
} from 'lucide-react';
import type { NotSupportedPlan, VoicePlan } from '@/lib/voice/planner/types';

interface NotSupportedViewProps {
  plan: NotSupportedPlan;
  onSelectSuggestion: (plan: VoicePlan | undefined, label: string) => void;
  onBack: () => void;
  onShowHelp: () => void;
}

export function NotSupportedView({ 
  plan, 
  onSelectSuggestion, 
  onBack,
  onShowHelp 
}: NotSupportedViewProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-muted">
          <HelpCircle className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-foreground mb-1">
            {plan.reason}
          </p>
          <p className="text-sm text-muted-foreground">
            Vielleicht meintest du:
          </p>
        </div>
      </div>
      
      {/* Suggestions */}
      <div className="space-y-2">
        {plan.suggestions.map((suggestion, index) => (
          <Button
            key={index}
            variant="outline"
            className={cn(
              "w-full justify-between h-auto py-3 px-4",
              "hover:bg-primary/5 hover:border-primary/50",
              "transition-colors"
            )}
            onClick={() => onSelectSuggestion(suggestion.plan, suggestion.label)}
          >
            <span className="font-medium">{suggestion.label}</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Button>
        ))}
      </div>
      
      {/* Help hint */}
      <div 
        className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
        onClick={onShowHelp}
      >
        <Lightbulb className="w-4 h-4 text-warning" />
        <span className="text-sm text-muted-foreground">
          Tipp: Sage z.B. "Hilfe" für alle Befehle
        </span>
      </div>
      
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={onBack}
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Zurück zur Eingabe
      </Button>
    </div>
  );
}
