import { Bell, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import type { Reminder } from '@/types/reminder.types';

interface UpcomingWarningBannerProps {
  reminders: Reminder[];
  onShow: () => void;
}

export const UpcomingWarningBanner = ({ reminders, onShow }: UpcomingWarningBannerProps) => {
  const [dismissed, setDismissed] = useState(false);
  
  if (dismissed || reminders.length === 0) return null;
  
  const count = reminders.length;
  const hasAppointment = reminders.some(r => r.type === 'appointment');
  const hasMedication = reminders.some(r => r.type === 'medication');
  
  let typeLabel = 'Erinnerung';
  if (hasAppointment && hasMedication) {
    typeLabel = 'Termin/Medikament';
  } else if (hasAppointment) {
    typeLabel = count > 1 ? 'Termine' : 'Termin';
  } else if (hasMedication) {
    typeLabel = count > 1 ? 'Medikamente' : 'Medikament';
  }

  return (
    <div className="bg-warning/15 border border-warning/30 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 bg-warning/20 rounded-full shrink-0">
            <Bell className="h-4 w-4 text-warning-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {count} wichtige{count > 1 ? '' : 'r'} {typeLabel} in den nächsten 24h
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={onShow}
          >
            Anzeigen
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
