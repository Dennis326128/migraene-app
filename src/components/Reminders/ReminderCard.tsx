import { Pill, Calendar, Edit2, AlertTriangle, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Reminder } from '@/types/reminder.types';
import { formatDistance, isToday, isTomorrow, format, isPast, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ReminderCardProps {
  reminder: Reminder;
  onEdit: (reminder: Reminder) => void;
  onMarkDone: (id: string) => void;
}

export const ReminderCard = ({ reminder, onEdit, onMarkDone }: ReminderCardProps) => {
  const reminderDate = new Date(reminder.date_time);
  const isOverdue = isPast(reminderDate) && reminder.status === 'pending';
  
  const getFormattedDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    const time = format(date, 'HH:mm', { locale: de });
    
    let dateLabel = '';
    if (isToday(date)) {
      dateLabel = 'Heute';
    } else if (isTomorrow(date)) {
      dateLabel = 'Morgen';
    } else {
      dateLabel = format(date, 'EEE, dd.MM.', { locale: de });
    }
    
    const relative = formatDistance(date, new Date(), { 
      addSuffix: true, 
      locale: de 
    });
    
    return {
      primary: `${dateLabel}, ${time} Uhr`,
      secondary: relative,
    };
  };
  
  const TypeIcon = reminder.type === 'medication' ? Pill : Calendar;
  const formattedTime = getFormattedDateTime(reminder.date_time);

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
                {reminder.title}
              </h3>
              {isOverdue && (
                <Badge variant="destructive" className="text-xs">
                  Überfällig
                </Badge>
              )}
            </div>
            
            <div className="flex flex-col gap-0.5 mt-1">
              <div className={cn(
                "text-sm font-medium",
                isOverdue ? "text-destructive" : "text-foreground"
              )}>
                {formattedTime.primary}
              </div>
              <div className="text-xs text-muted-foreground">
                {formattedTime.secondary}
              </div>
            </div>

            {reminder.notes && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {reminder.notes}
              </p>
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
            onClick={() => onEdit(reminder)}
            className="touch-manipulation"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
