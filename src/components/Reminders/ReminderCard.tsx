import { Pill, Calendar, Edit2, AlertTriangle, Check, CalendarPlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isToday, isTomorrow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import type { Reminder, ReminderPrefill } from '@/types/reminder.types';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { hasFollowUpConfigured, formatFollowUpDate, cloneReminderForCreate } from '@/features/reminders/helpers/reminderHelpers';
import { isReminderOverdue } from '@/features/reminders/helpers/attention';
import type { GroupedReminder } from '@/features/reminders/helpers/groupReminders';
import { formatNextOccurrence } from '@/features/reminders/helpers/groupReminders';

interface ReminderCardProps {
  /** Grouped reminder data (series-based display) */
  grouped: GroupedReminder;
  onEdit: (reminder: Reminder, allReminders: Reminder[]) => void;
  onMarkDone: (id: string) => void;
  onPlanFollowUp?: (prefill: ReminderPrefill) => void;
}

// Safe date extraction helpers
const extractTimeFromDateTime = (dateTime: string): string => {
  try {
    const date = parseISO(dateTime);
    return format(date, 'HH:mm');
  } catch {
    return '09:00';
  }
};

export const ReminderCard = ({ grouped, onEdit, onMarkDone, onPlanFollowUp }: ReminderCardProps) => {
  const { reminder, nextOccurrence, frequencyLabel, isRecurring, displayTitle } = grouped;
  const isOverdue = isReminderOverdue(reminder);
  const showFollowUp = hasFollowUpConfigured(reminder) && onPlanFollowUp;
  const nextFollowUpDate = (reminder as any).next_follow_up_date;
  
  // Relative time removed for cleaner medical UX

  const handlePlanFollowUp = () => {
    if (!onPlanFollowUp) return;

    const originalTime = extractTimeFromDateTime(reminder.date_time);

    const cloned = cloneReminderForCreate(reminder, {
      clearDateTime: true,
      prefillDate: nextFollowUpDate,
      preserveSeriesId: true,
    });

    onPlanFollowUp({
      type: cloned.type || 'appointment',
      title: cloned.title || reminder.title,
      notes: cloned.notes,
      notification_enabled: cloned.notification_enabled,
      medications: cloned.medications,
      repeat: cloned.repeat,
      follow_up_enabled: cloned.follow_up_enabled,
      follow_up_interval_value: cloned.follow_up_interval_value,
      follow_up_interval_unit: cloned.follow_up_interval_unit,
      series_id: cloned.series_id,
      prefill_date: nextFollowUpDate,
      prefill_time: originalTime,
    } as ReminderPrefill & { prefill_time?: string });
  };
  
  const TypeIcon = reminder.type === 'medication' ? Pill : Calendar;

  return (
    <Card className={cn(
      "p-4 hover:shadow-md transition-shadow touch-manipulation",
      isOverdue && "border-destructive/50 bg-destructive/5"
    )}>
      <div className="flex items-start justify-between gap-3">
        {/* Linke Seite */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className={cn(
            "p-2.5 rounded-lg shrink-0",
            isOverdue 
              ? "bg-destructive/10 text-destructive"
              : reminder.type === 'medication' 
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
          )}>
            {isOverdue ? <AlertTriangle className="h-5 w-5" /> : <TypeIcon className="h-5 w-5" />}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate text-base">
                {displayTitle}
              </h3>
              {isOverdue && (
                <Badge variant="destructive" className="text-xs">
                  Überfällig
                </Badge>
              )}
            </div>
            
            {/* Frequency label for recurring reminders */}
            {isRecurring && frequencyLabel && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {frequencyLabel}
              </div>
            )}

            {/* Next occurrence */}
            <div className="flex flex-col gap-0.5 mt-1">
              <div className={cn(
                "text-sm font-medium",
                isOverdue ? "text-destructive" : "text-foreground"
              )}>
                {isRecurring
                  ? formatNextOccurrence(nextOccurrence, reminder.type)
                  : (() => {
                      const time = format(nextOccurrence, 'HH:mm', { locale: de });
                      let dateLabel = '';
                      if (isToday(nextOccurrence)) {
                        dateLabel = 'Heute';
                      } else if (isTomorrow(nextOccurrence)) {
                        dateLabel = 'Morgen';
                      } else {
                        dateLabel = format(nextOccurrence, 'EEE, dd.MM.', { locale: de });
                      }
                      return `${dateLabel}, ${time} Uhr`;
                    })()
                }
              </div>
              {/* Relative time removed — cleaner medical UX */}
            </div>

            {reminder.notes && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {reminder.notes}
              </p>
            )}

            {/* Follow-up suggestion */}
            {showFollowUp && nextFollowUpDate && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Folgetermin</span> empfohlen ab {formatFollowUpDate(nextFollowUpDate)}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handlePlanFollowUp}
                    className="touch-manipulation gap-1.5 h-8 text-xs"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Planen
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rechte Seite: Action Buttons */}
        <div className="flex flex-col gap-2 shrink-0">
          {reminder.status === 'pending' && (
            <Button
              size="sm"
              onClick={() => onMarkDone(reminder.id)}
              className="whitespace-nowrap touch-manipulation gap-1.5"
              variant={isOverdue ? "destructive" : "default"}
            >
              <Check className="h-4 w-4" />
              Erledigt
            </Button>
          )}
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(reminder, grouped.allReminders)}
            className="touch-manipulation"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
