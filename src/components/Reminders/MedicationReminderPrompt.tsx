/**
 * MedicationReminderPrompt
 * 
 * Shows a subtle prompt after saving a medication to offer creating a reminder.
 * Only shown for scheduled/prophylaxis medications (not PRN/as-needed).
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Bell, X, Pill } from 'lucide-react';

interface MedicationReminderPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicationName: string;
  medicationId: string;
  onCreateReminder: () => void;
  onSkip: () => void;
}

export const MedicationReminderPrompt: React.FC<MedicationReminderPromptProps> = ({
  open,
  onOpenChange,
  medicationName,
  medicationId,
  onCreateReminder,
  onSkip,
}) => {
  const handleCreateReminder = () => {
    onCreateReminder();
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSkip();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-success/10">
              <Pill className="h-5 w-5 text-success" />
            </div>
            <span>Medikament gespeichert</span>
          </DialogTitle>
          <DialogDescription className="pt-2">
            Möchtest du für <span className="font-medium text-foreground">{medicationName}</span> eine Erinnerung einrichten?
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Bell className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            Erinnerungen helfen dir, regelmäßige Medikamente nicht zu vergessen.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="sm:mr-auto"
          >
            Nicht jetzt
          </Button>
          <Button
            onClick={handleCreateReminder}
            className="bg-primary hover:bg-primary/90"
          >
            <Bell className="h-4 w-4 mr-2" />
            Erinnerung anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MedicationReminderPrompt;
