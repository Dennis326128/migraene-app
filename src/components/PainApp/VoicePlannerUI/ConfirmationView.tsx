/**
 * ConfirmationView - Bestätigungs-UI für erkannte Befehle
 * 
 * Zeigt was erkannt wurde + Bestätigen/Ändern Buttons
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Check, 
  X,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  Navigation,
  Search,
  Edit,
  Trash2,
  Star
} from 'lucide-react';
import type { VoicePlan, ConfirmPlan } from '@/lib/voice/planner/types';

interface ConfirmationViewProps {
  plan: VoicePlan | ConfirmPlan;
  onConfirm: () => void;
  onChange: () => void;
  onCancel: () => void;
}

export function ConfirmationView({ 
  plan, 
  onConfirm, 
  onChange,
  onCancel 
}: ConfirmationViewProps) {
  // Get the actual plan to display (unwrap confirm if needed)
  const displayPlan = plan.kind === 'confirm' ? plan.pending : plan;
  const isConfirmWrapper = plan.kind === 'confirm';
  const confirmPlan = isConfirmWrapper ? plan as ConfirmPlan : null;
  
  // Icon based on plan kind
  const getIcon = () => {
    switch (displayPlan.kind) {
      case 'navigate': return Navigation;
      case 'query': return Search;
      case 'mutation': {
        const mutType = displayPlan.mutationType;
        if (mutType?.includes('delete')) return Trash2;
        if (mutType?.includes('rate')) return Star;
        return Edit;
      }
      default: return HelpCircle;
    }
  };
  
  const Icon = getIcon();
  
  // Risk indicator
  const getRiskColor = () => {
    if (displayPlan.kind === 'mutation') {
      switch (displayPlan.risk) {
        case 'high': return 'text-destructive';
        case 'medium': return 'text-warning';
        default: return 'text-success';
      }
    }
    return 'text-primary';
  };
  
  // Confidence display
  const confidencePercent = Math.round(plan.confidence * 100);
  const confidenceLabel = 
    confidencePercent >= 90 ? 'Sehr sicher' :
    confidencePercent >= 75 ? 'Sicher' :
    confidencePercent >= 60 ? 'Wahrscheinlich' : 'Unsicher';
  
  return (
    <div className="space-y-4">
      {/* Header - what was recognized */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        {/* Icon + Summary */}
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-full bg-background", getRiskColor())}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground">
              {displayPlan.summary}
            </p>
            {confirmPlan?.question && (
              <p className="text-sm text-muted-foreground mt-1">
                {confirmPlan.question}
              </p>
            )}
          </div>
        </div>
        
        {/* Confidence indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all",
                confidencePercent >= 80 ? "bg-success" :
                confidencePercent >= 60 ? "bg-warning" : "bg-destructive"
              )}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span>{confidenceLabel} ({confidencePercent}%)</span>
        </div>
        
        {/* Risk warning for dangerous actions */}
        {displayPlan.kind === 'mutation' && displayPlan.risk === 'high' && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded p-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Diese Aktion kann nicht rückgängig gemacht werden.</span>
          </div>
        )}
      </div>
      
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onChange}
        >
          Ändern
        </Button>
        <Button
          variant={confirmPlan?.confirmType === 'danger' ? 'destructive' : 'default'}
          className={cn(
            "flex-1",
            confirmPlan?.confirmType !== 'danger' && "bg-success hover:bg-success/90 text-success-foreground"
          )}
          onClick={onConfirm}
        >
          <Check className="w-4 h-4 mr-2" />
          {confirmPlan?.confirmType === 'danger' ? 'Ja, löschen' : 'Bestätigen'}
        </Button>
      </div>
      
      {/* Cancel */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={onCancel}
      >
        <X className="w-4 h-4 mr-1" />
        Abbrechen
      </Button>
    </div>
  );
}
