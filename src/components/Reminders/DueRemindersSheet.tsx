import React, { useState } from 'react';
import { Check, Clock, X, Pill, Calendar, AlertTriangle, ListTodo, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useInAppDueReminders,
  type DueReminder,
} from '@/features/reminders/hooks/useInAppDueReminders';
import { SnoozeOptionsSheet } from './SnoozeOptionsSheet';
import { getSmartSnoozeTime, formatSnoozeTime } from '@/features/reminders/helpers/snooze';

interface DueRemindersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DueRemindersSheet: React.FC<DueRemindersSheetProps> = ({
  open,
  onOpenChange,
}) => {
  const {
    overdueReminders,
    upcomingReminders,
    closeSheet,
    completeReminder,
    snoozeReminderUntil,
    isUpdating,
    dueReminders,
  } = useInAppDueReminders();

  const [snoozeSheetOpen, setSnoozeSheetOpen] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<DueReminder | null>(null);

  const handleClose = async () => {
    await closeSheet();
    onOpenChange(false);
  };

  const handleComplete = (reminder: DueReminder) => {
    completeReminder(reminder);
    // Close if last reminder
    if (dueReminders.length <= 1) {
      onOpenChange(false);
    }
  };

  // Smart snooze - one tap, no decisions
  const handleSmartSnooze = (reminder: DueReminder) => {
    const targetTime = getSmartSnoozeTime();
    snoozeReminderUntil(reminder.id, targetTime);
    // Close if last reminder
    if (dueReminders.length <= 1) {
      onOpenChange(false);
    }
  };

  // Open snooze options for more control
  const handleOpenSnoozeOptions = (reminder: DueReminder) => {
    setSelectedReminder(reminder);
    setSnoozeSheetOpen(true);
  };

  const handleSnoozeWithTime = (until: Date) => {
    if (selectedReminder) {
      snoozeReminderUntil(selectedReminder.id, until);
      setSelectedReminder(null);
      // Close if last reminder
      if (dueReminders.length <= 1) {
        onOpenChange(false);
      }
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'HH:mm', { locale: de });
    } catch {
      return '';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'd. MMM', { locale: de });
    } catch {
      return '';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'medication':
        return <Pill className="h-4 w-4 text-primary shrink-0" />;
      case 'appointment':
        return <Calendar className="h-4 w-4 text-primary shrink-0" />;
      case 'todo':
        return <ListTodo className="h-4 w-4 text-primary shrink-0" />;
      default:
        return <Clock className="h-4 w-4 text-primary shrink-0" />;
    }
  };

  const ReminderItem = ({ reminder }: { reminder: DueReminder }) => {
    const now = new Date();
    const smartSnoozePreview = formatSnoozeTime(getSmartSnoozeTime(now), now);
    
    return (
      <div
        className={cn(
          'p-3 rounded-lg border space-y-2',
          reminder.isOverdue
            ? 'border-destructive/30 bg-destructive/5'
            : 'border-border bg-card/50'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getTypeIcon(reminder.type)}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{reminder.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(reminder.date_time)} • {formatTime(reminder.date_time)}
              </p>
            </div>
          </div>
          {reminder.isOverdue && (
            <Badge variant="destructive" className="text-xs shrink-0">
              Überfällig
            </Badge>
          )}
        </div>

        {reminder.medications && reminder.medications.length > 0 && (
          <p className="text-xs text-muted-foreground pl-6">
            {reminder.medications.join(', ')}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          {/* Primary: Smart Snooze (one tap) */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSmartSnooze(reminder)}
            disabled={isUpdating}
            className="flex-1 gap-1.5 min-h-[40px] touch-manipulation"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden xs:inline">Später</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              ({smartSnoozePreview})
            </span>
          </Button>

          {/* Secondary: Complete */}
          <Button
            size="sm"
            onClick={() => handleComplete(reminder)}
            disabled={isUpdating}
            className="flex-1 gap-1.5 min-h-[40px] touch-manipulation"
          >
            <Check className="h-4 w-4" />
            {reminder.type === 'medication' ? 'Eingenommen' : 'Erledigt'}
          </Button>

          {/* More snooze options */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleOpenSnoozeOptions(reminder)}
            disabled={isUpdating}
            className="px-2 min-h-[40px] touch-manipulation"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleClose();
        }}
        title="Erinnerungen"
        description={`${dueReminders.length} ${dueReminders.length === 1 ? 'Erinnerung' : 'Erinnerungen'} fällig`}
        className="max-h-[85vh]"
      >
        <div className="space-y-4">
          {/* Overdue Section */}
          {overdueReminders.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <h3 className="font-semibold text-sm">Überfällig</h3>
              </div>
              <div className="space-y-2">
                {overdueReminders.map((reminder) => (
                  <ReminderItem key={reminder.id} reminder={reminder} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          {upcomingReminders.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground">
                Heute / Nächste 24h
              </h3>
              <div className="space-y-2">
                {upcomingReminders.map((reminder) => (
                  <ReminderItem key={reminder.id} reminder={reminder} />
                ))}
              </div>
            </div>
          )}

          {/* Close all / snooze all button */}
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isUpdating}
            className="w-full gap-2 text-muted-foreground min-h-[44px] touch-manipulation"
          >
            <X className="h-4 w-4" />
            Alle für heute ausblenden
          </Button>

          <p className="text-xs text-muted-foreground text-center pb-2">
            Diese Mitteilung erscheint einmal pro Tag beim Öffnen der App.
          </p>
        </div>
      </BottomSheet>

      {/* Snooze Options Sub-Sheet */}
      <SnoozeOptionsSheet
        open={snoozeSheetOpen}
        onOpenChange={setSnoozeSheetOpen}
        onSnooze={handleSnoozeWithTime}
        reminderTitle={selectedReminder?.title}
      />
    </>
  );
};
