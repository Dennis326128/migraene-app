/**
 * Intelligent, contextual reminder dialog for missing report data
 * 
 * Shows different text based on what's missing:
 * - Personal data only
 * - Doctors only  
 * - Both
 * 
 * UX principles:
 * - Helpful, not pushy
 * - Max 1x per day
 * - Clear options: "Jetzt ergänzen" / "Später" / "Nicht mehr erinnern"
 */

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock } from "lucide-react";
import type { ReminderDialogType, MissingDataAnalysis } from "./types";

interface ReportReminderDialogProps {
  open: boolean;
  dialogType: ReminderDialogType;
  missingData: MissingDataAnalysis;
  onNavigate: (target: 'personal' | 'doctors') => void;
  onLater: () => void;
  onNeverAsk: () => void;
  onClose: () => void;
}

export function ReportReminderDialog({
  open,
  dialogType,
  missingData,
  onNavigate,
  onLater,
  onNeverAsk,
  onClose,
}: ReportReminderDialogProps) {
  if (!dialogType) return null;

  const content = getDialogContent(dialogType, missingData);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            {content.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            {content.description}
          </DialogDescription>
          {content.hint && (
            <p className="text-xs text-muted-foreground mt-1">
              {content.hint}
            </p>
          )}
        </DialogHeader>

        <div className="py-4 space-y-2">
          {/* Primary action buttons based on what's missing */}
          {(dialogType === 'personal' || dialogType === 'both') && (
            <Button 
              onClick={() => onNavigate('personal')} 
              className="w-full justify-start"
              variant={dialogType === 'both' ? 'outline' : 'default'}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Persönliche Daten ergänzen
            </Button>
          )}
          {(dialogType === 'doctors' || dialogType === 'both') && (
            <Button 
              onClick={() => onNavigate('doctors')} 
              className="w-full justify-start"
              variant={dialogType === 'both' ? 'outline' : 'default'}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Behandelnden Arzt hinzufügen
            </Button>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="ghost" 
            onClick={onLater} 
            className="w-full sm:w-auto"
          >
            <Clock className="h-4 w-4 mr-2" />
            Später
          </Button>
        </DialogFooter>

        <div className="text-center mt-2">
          <button
            onClick={onNeverAsk}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Nicht mehr erinnern
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Get dialog content based on what's missing
 */
function getDialogContent(
  dialogType: ReminderDialogType, 
  missingData: MissingDataAnalysis
): { title: string; description: string; hint?: string } {
  switch (dialogType) {
    case 'personal': {
      // Build specific description based on what's missing
      const fields = missingData.missingPersonalFields;
      const examples = buildExampleText(fields);
      
      return {
        title: "Bericht vervollständigen?",
        description: `Für ärztliche Berichte fehlen noch einige persönliche Angaben${examples}.`,
        hint: "Dauert nur ca. 1 Minute.",
      };
    }
    
    case 'doctors':
      return {
        title: "Behandelnden Arzt hinzufügen?",
        description: "So kann der Bericht eindeutig zugeordnet und besser genutzt werden.",
      };
    
    case 'both':
      return {
        title: "Bericht vervollständigen?",
        description: "Für vollständige Berichte fehlen noch persönliche Angaben und der behandelnde Arzt.",
        hint: "Du kannst beides jederzeit in den Einstellungen ergänzen.",
      };
    
    default:
      return {
        title: "Daten ergänzen?",
        description: "Einige Angaben fehlen noch für einen vollständigen Bericht.",
      };
  }
}

/**
 * Build example text for missing personal fields
 */
function buildExampleText(fields: ('name' | 'birthdate' | 'address' | 'insurance')[]): string {
  if (fields.length === 0) return "";
  
  const labels: Record<string, string> = {
    name: "Name",
    birthdate: "Geburtsdatum", 
    address: "Adresse",
    insurance: "Versicherung",
  };

  // Take up to 2 examples
  const examples = fields.slice(0, 2).map(f => labels[f]);
  
  if (examples.length === 1) {
    return ` (z.B. ${examples[0]})`;
  }
  return ` (z.B. ${examples.join(" oder ")})`;
}
