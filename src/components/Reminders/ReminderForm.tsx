import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Reminder, CreateReminderInput, UpdateReminderInput } from '@/types/reminder.types';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { MedicationSelector } from './MedicationSelector';
import { TimeOfDaySelector, getDefaultTimeSlots, type TimeSlot } from './TimeOfDaySelector';

const reminderSchema = z.object({
  type: z.enum(['medication', 'appointment']),
  title: z.string().min(1, 'Titel ist erforderlich'),
  date: z.string().min(1, 'Datum ist erforderlich'),
  time: z.string().min(1, 'Uhrzeit ist erforderlich'),
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly']),
  notes: z.string().optional(),
  notification_enabled: z.boolean(),
  status: z.enum(['pending', 'done', 'missed']).optional(),
});

type FormData = z.infer<typeof reminderSchema>;

interface ReminderFormProps {
  reminder?: Reminder;
  onSubmit: (data: CreateReminderInput | CreateReminderInput[] | UpdateReminderInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export const ReminderForm = ({ reminder, onSubmit, onCancel, onDelete }: ReminderFormProps) => {
  const isEditing = !!reminder;
  const [selectedMedications, setSelectedMedications] = useState<string[]>(reminder?.medications || []);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(() => {
    if (reminder && reminder.time_of_day) {
      const slots = getDefaultTimeSlots();
      return slots.map(slot => 
        slot.timeOfDay === reminder.time_of_day 
          ? { ...slot, enabled: true, time: format(new Date(reminder.date_time), 'HH:mm') }
          : slot
      );
    }
    return getDefaultTimeSlots();
  });

  const defaultValues: FormData = reminder
    ? {
        type: reminder.type,
        title: reminder.title,
        date: format(new Date(reminder.date_time), 'yyyy-MM-dd'),
        time: format(new Date(reminder.date_time), 'HH:mm'),
        repeat: reminder.repeat,
        notes: reminder.notes || '',
        notification_enabled: reminder.notification_enabled,
        status: reminder.status,
      }
    : {
        type: 'medication',
        title: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm'),
        repeat: 'none',
        notes: '',
        notification_enabled: true,
      };

  const { register, handleSubmit, watch, setValue, formState } = useForm<FormData>({
    resolver: zodResolver(reminderSchema),
    defaultValues,
  });

  const { errors, isSubmitting } = formState;

  const type = watch('type');
  const notificationEnabled = watch('notification_enabled');
  const repeat = watch('repeat');

  const isMedicationType = type === 'medication';
  const enabledTimeSlots = timeSlots.filter(slot => slot.enabled);
  const useMultipleTimeSlots = isMedicationType && repeat === 'daily' && enabledTimeSlots.length > 0;

  const onFormSubmit = (data: FormData) => {
    // For editing or non-medication types, use single reminder
    if (isEditing || !useMultipleTimeSlots) {
      const dateTime = `${data.date}T${data.time}:00`;
      
      const submitData: CreateReminderInput | UpdateReminderInput = {
        type: data.type,
        title: data.title,
        date_time: dateTime,
        repeat: data.repeat,
        notes: data.notes || null,
        notification_enabled: data.notification_enabled,
        ...(isMedicationType && selectedMedications.length > 0 ? { medications: selectedMedications } : {}),
        ...(isEditing && data.status ? { status: data.status } : {}),
      };

      onSubmit(submitData);
      return;
    }

    // Create multiple reminders for each time slot
    const reminders: CreateReminderInput[] = enabledTimeSlots.map((slot) => {
      const dateTime = `${data.date}T${slot.time}:00`;
      const medsList = selectedMedications.length > 0 ? selectedMedications.join(', ') : 'Medikamente';
      
      return {
        type: data.type,
        title: `${medsList} (${slot.label})`,
        date_time: dateTime,
        repeat: data.repeat,
        notes: data.notes || null,
        notification_enabled: data.notification_enabled,
        medications: selectedMedications,
        time_of_day: slot.timeOfDay,
      };
    });

    onSubmit(reminders);
  };

  return (
    <div className="px-3 sm:px-4 py-4 sm:py-6 pb-safe">
      <div className="flex items-center gap-3 mb-6">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="touch-manipulation min-h-11 min-w-11"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        <h1 className="text-2xl font-bold text-foreground">
          {isEditing ? 'Erinnerung bearbeiten' : 'Neue Erinnerung'}
        </h1>
      </div>

      <Card className="p-4 sm:p-6">
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="type">Typ</Label>
            <Select
              value={type}
              onValueChange={(value) => setValue('type', value as 'medication' | 'appointment')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medication">Medikament</SelectItem>
                <SelectItem value="appointment">Termin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isMedicationType && (
            <MedicationSelector
              selectedMedications={selectedMedications}
              onSelectionChange={setSelectedMedications}
            />
          )}

          {!isEditing && isMedicationType && repeat === 'daily' && (
            <TimeOfDaySelector
              timeSlots={timeSlots}
              onSlotsChange={setTimeSlots}
            />
          )}

          {(!useMultipleTimeSlots || isEditing) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">Titel</Label>
                <Input
                  id="title"
                  {...register('title')}
                  className="touch-manipulation"
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Datum</Label>
                  <Input
                    id="date"
                    type="date"
                    {...register('date')}
                    className="touch-manipulation"
                  />
                  {errors.date && (
                    <p className="text-sm text-destructive">{errors.date.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="time">Uhrzeit</Label>
                  <Input
                    id="time"
                    type="time"
                    {...register('time')}
                    className="touch-manipulation"
                  />
                  {errors.time && (
                    <p className="text-sm text-destructive">{errors.time.message}</p>
                  )}
                </div>
              </div>
            </>
          )}

          {useMultipleTimeSlots && !isEditing && (
            <div className="space-y-2">
              <Label htmlFor="date">Startdatum</Label>
              <Input
                id="date"
                type="date"
                {...register('date')}
                className="touch-manipulation"
              />
              {errors.date && (
                <p className="text-sm text-destructive">{errors.date.message}</p>
              )}
              <p className="text-sm text-muted-foreground">
                Es werden {enabledTimeSlots.length} Erinnerungen erstellt
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="repeat">Wiederholung</Label>
            <Select
              value={repeat}
              onValueChange={(value) => setValue('repeat', value as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine</SelectItem>
                <SelectItem value="daily">Täglich</SelectItem>
                <SelectItem value="weekly">Wöchentlich</SelectItem>
                <SelectItem value="monthly">Monatlich</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notizen (optional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              rows={3}
              className="touch-manipulation resize-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="notifications" className="cursor-pointer">
              Benachrichtigungen
            </Label>
            <Switch
              id="notifications"
              checked={notificationEnabled}
              onCheckedChange={(checked) => setValue('notification_enabled', checked)}
            />
          </div>

          {isEditing && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={watch('status')}
                onValueChange={(value) => setValue('status', value as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="done">Erledigt</SelectItem>
                  <SelectItem value="missed">Verpasst</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1 touch-manipulation min-h-11"
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 touch-manipulation min-h-11"
            >
              {isSubmitting ? 'Speichern...' : 'Speichern'}
            </Button>
          </div>

          {isEditing && onDelete && (
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
              className="w-full touch-manipulation min-h-11"
            >
              Löschen
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
};