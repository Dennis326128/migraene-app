import { Clock, Pill, Calendar, Check, Edit2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Reminder } from '@/types/reminder.types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface ReminderCardProps {
  reminder: Reminder;
  onEdit: (reminder: Reminder) => void;
  onMarkDone: (id: string) => void;
  showDate?: boolean;
}

export const ReminderCard = ({ reminder, onEdit, onMarkDone, showDate = false }: ReminderCardProps) => {
  const time = format(new Date(reminder.date_time), 'HH:mm', { locale: de });
  const date = format(new Date(reminder.date_time), 'dd.MM.yyyy', { locale: de });
  
  const TypeIcon = reminder.type === 'medication' ? Pill : Calendar;
  const typeLabel = reminder.type === 'medication' ? 'Medikament' : 'Termin';

  const getStatusColor = () => {
    switch (reminder.status) {
      case 'done':
        return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'missed':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      default:
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    }
  };

  const getStatusText = () => {
    switch (reminder.status) {
      case 'done':
        return 'Erledigt';
      case 'missed':
        return 'Verpasst';
      default:
        return 'Ausstehend';
    }
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow touch-manipulation">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <TypeIcon className="h-5 w-5" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{reminder.title}</h3>
            
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{time}</span>
              {showDate && <span>• {date}</span>}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {typeLabel}
              </Badge>
              <Badge className={`text-xs ${getStatusColor()}`}>
                {getStatusText()}
              </Badge>
            </div>

            {reminder.notes && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {reminder.notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {reminder.status === 'pending' && (
            <Button
              size="icon"
              variant="outline"
              onClick={() => onMarkDone(reminder.id)}
              className="h-11 w-11 touch-manipulation"
            >
              <Check className="h-5 w-5" />
            </Button>
          )}
          
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(reminder)}
            className="h-11 w-11 touch-manipulation"
          >
            <Edit2 className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
