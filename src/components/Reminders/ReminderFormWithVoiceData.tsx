import React from 'react';
import { ReminderForm } from './ReminderForm';
import { Reminder, CreateReminderInput } from '@/types/reminder.types';
import { Info } from 'lucide-react';

interface ReminderData {
  type: 'medication' | 'appointment';
  title: string;
  medications?: string[];
  date: string;
  time: string;
  timeOfDay?: 'morning' | 'noon' | 'evening' | 'night';
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  notes: string;
  notification_enabled: boolean;
}

interface ReminderFormWithVoiceDataProps {
  initialData: ReminderData | null;
  onSubmit: (data: CreateReminderInput | CreateReminderInput[]) => void;
  onCancel: () => void;
}

export const ReminderFormWithVoiceData: React.FC<ReminderFormWithVoiceDataProps> = ({
  initialData,
  onSubmit,
  onCancel
}) => {
  // Convert ReminderData to partial Reminder for form initialization
  const formReminder: Partial<Reminder> | undefined = initialData ? {
    id: '', // Will be generated on save
    user_id: '',
    type: initialData.type,
    title: initialData.title,
    date_time: `${initialData.date}T${initialData.time}:00`,
    repeat: initialData.repeat,
    notes: initialData.notes || '',
    notification_enabled: initialData.notification_enabled,
    medications: initialData.medications || [],
    time_of_day: initialData.timeOfDay || null,
    status: 'pending',
    created_at: '',
    updated_at: '',
  } : undefined;
  
  return (
    <div className="space-y-4">
      {/* Info-Banner */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Aus Spracheingabe erkannt
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Bitte überprüfe die Daten und klicke auf Speichern.
          </p>
        </div>
      </div>
      
      <ReminderForm
        reminder={formReminder as Reminder}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </div>
  );
};
