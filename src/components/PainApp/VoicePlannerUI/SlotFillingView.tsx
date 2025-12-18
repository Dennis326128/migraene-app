/**
 * SlotFillingView - UI für fehlende Pflichtfelder
 * 
 * Zeigt eine Frage + Vorschläge als Chips an
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { HelpCircle, ChevronLeft } from 'lucide-react';
import type { SlotFillingPlan } from '@/lib/voice/planner/types';

interface SlotFillingViewProps {
  plan: SlotFillingPlan;
  onSelect: (value: string) => void;
  onBack: () => void;
  onCustomInput: (value: string) => void;
}

export function SlotFillingView({ 
  plan, 
  onSelect, 
  onBack,
  onCustomInput 
}: SlotFillingViewProps) {
  const [customValue, setCustomValue] = React.useState('');
  
  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customValue.trim()) {
      onCustomInput(customValue.trim());
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-primary/10">
          <HelpCircle className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">
            Ich brauche noch eine Info:
          </p>
          <p className="font-medium text-foreground">
            {plan.prompt}
          </p>
        </div>
      </div>
      
      {/* Suggestions as chips */}
      <div className="flex flex-wrap gap-2">
        {plan.suggestions.map((suggestion, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            className={cn(
              "rounded-full px-4 py-2 h-auto",
              "hover:bg-primary/10 hover:border-primary",
              "transition-colors"
            )}
            onClick={() => onSelect(suggestion.value)}
          >
            {suggestion.label}
          </Button>
        ))}
      </div>
      
      {/* Custom input */}
      <form onSubmit={handleCustomSubmit} className="flex gap-2">
        <Input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          placeholder="Oder selbst eingeben..."
          className="flex-1"
        />
        <Button 
          type="submit" 
          variant="secondary" 
          size="sm"
          disabled={!customValue.trim()}
        >
          OK
        </Button>
      </form>
      
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={onBack}
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Zurück
      </Button>
    </div>
  );
}
