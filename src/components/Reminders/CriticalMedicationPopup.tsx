import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Check, Clock, Trash2, Pill } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useCriticalReminderPopup, type CriticalReminder } from '@/features/reminders/hooks/useCriticalReminderPopup';
import { cn } from '@/lib/utils';

interface CriticalMedicationPopupProps {
  onClose?: () => void;
}

export const CriticalMedicationPopup: React.FC<CriticalMedicationPopupProps> = ({ onClose }) => {
  const {
    criticalReminders,
    hasReminders,
    markAsDone,
    snoozeForToday,
    cancelReminder,
    snoozeAll,
    isUpdating,
  } = useCriticalReminderPopup();
  
  const [open, setOpen] = useState(false);
  const [hasShownThisSession, setHasShownThisSession] = useState(false);
  
  // Show popup once when critical reminders are detected
  useEffect(() => {
    if (hasReminders && !hasShownThisSession) {
      setOpen(true);
      setHasShownThisSession(true);
    }
  }, [hasReminders, hasShownThisSession]);
  
  const handleClose = async () => {
    // Snooze all reminders for today when closing
    await snoozeAll();
    setOpen(false);
    onClose?.();
  };
  
  const handleMarkDone = async (reminder: CriticalReminder) => {
    markAsDone(reminder.id);
    // If this was the last reminder, close the popup
    if (criticalReminders.length <= 1) {
      setOpen(false);
      onClose?.();
    }
  };
  
  const handleSnooze = async (reminder: CriticalReminder) => {
    snoozeForToday(reminder.id);
    // If this was the last reminder, close the popup
    if (criticalReminders.length <= 1) {
      setOpen(false);
      onClose?.();
    }
  };
  
  const handleCancel = async (reminder: CriticalReminder) => {
    cancelReminder(reminder.id);
    // If this was the last reminder, close the popup
    if (criticalReminders.length <= 1) {
      setOpen(false);
      onClose?.();
    }
  };
  
  const formatReminderDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'd. MMMM yyyy', { locale: de });
    } catch {
      return dateStr;
    }
  };
  
  if (!hasReminders) return null;
  
  const singleReminder = criticalReminders.length === 1;
  const reminder = criticalReminders[0];
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          disabled={isUpdating}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Schließen</span>
        </button>
        
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Pill className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-lg">
              {singleReminder 
                ? `${reminder?.title || 'Medikament'}-Erinnerung`
                : 'Medikamenten-Erinnerungen'
              }
            </DialogTitle>
          </div>
          
          <DialogDescription className="text-foreground/80">
            {singleReminder ? (
              <>
                Die Erinnerung für <strong>{reminder?.title}</strong> vom{' '}
                <strong>{formatReminderDate(reminder?.date_time || '')}</strong> wurde noch nicht als erledigt markiert.
                <br />
                <span className="text-muted-foreground">Wurde das Medikament bereits genommen?</span>
              </>
            ) : (
              <>
                Du hast <strong>{criticalReminders.length} offene Medikamenten-Erinnerungen</strong>, 
                die noch nicht als erledigt markiert wurden.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {singleReminder ? (
            // Single reminder: show action buttons directly
            <div className="space-y-3">
              <Button
                onClick={() => handleMarkDone(reminder)}
                className="w-full gap-2"
                disabled={isUpdating}
              >
                <Check className="h-4 w-4" />
                Genommen / erledigt
              </Button>
              
              <Button
                variant="outline"
                onClick={() => handleSnooze(reminder)}
                className="w-full gap-2"
                disabled={isUpdating}
              >
                <Clock className="h-4 w-4" />
                Später erinnern
              </Button>
              
              <Button
                variant="ghost"
                onClick={() => handleCancel(reminder)}
                className="w-full gap-2 text-muted-foreground hover:text-destructive"
                disabled={isUpdating}
              >
                <Trash2 className="h-4 w-4" />
                Erinnerung löschen
              </Button>
            </div>
          ) : (
            // Multiple reminders: show list with individual actions
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {criticalReminders.map((r) => (
                <div 
                  key={r.id}
                  className="p-3 rounded-lg border border-border bg-card/50 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Fällig: {formatReminderDate(r.date_time)}
                      </p>
                      {r.medications && r.medications.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {r.medications.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleMarkDone(r)}
                      disabled={isUpdating}
                      className="flex-1 gap-1"
                    >
                      <Check className="h-3 w-3" />
                      Erledigt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSnooze(r)}
                      disabled={isUpdating}
                      className="gap-1"
                    >
                      <Clock className="h-3 w-3" />
                      Später
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCancel(r)}
                      disabled={isUpdating}
                      className="text-muted-foreground hover:text-destructive px-2"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer hint */}
        <p className="text-xs text-muted-foreground text-center">
          Dieses Popup erscheint einmal pro Tag, bis die Erinnerung erledigt ist.
        </p>
      </DialogContent>
    </Dialog>
  );
};
