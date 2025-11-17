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
  onSubmit: (data: CreateReminderInput | UpdateReminderInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export const ReminderForm = ({ reminder, onSubmit, onCancel, onDelete }: ReminderFormProps) => {
  const isEditing = !!reminder;

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

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(reminderSchema),
    defaultValues,
  });

  const type = watch('type');
  const notificationEnabled = watch('notification_enabled');

  const onFormSubmit = (data: FormData) => {
    const dateTime = `${data.date}T${data.time}:00`;
    
    const submitData = {
      type: data.type,
      title: data.title,
      date_time: dateTime,
      repeat: data.repeat,
      notes: data.notes || null,
      notification_enabled: data.notification_enabled,
      ...(isEditing && data.status ? { status: data.status } : {}),
    };

    onSubmit(submitData);
  };

  return (
    <Card className="p-6">
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

        <div className="space-y-2">
          <Label htmlFor="title">
            {type === 'medication' ? 'Name des Medikaments' : 'Terminbezeichnung'}
          </Label>
          <Input
            id="title"
            placeholder={type === 'medication' ? 'z.B. Ibuprofen 400mg' : 'z.B. Hausarzt'}
            {...register('title')}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date">Datum</Label>
            <Input id="date" type="date" {...register('date')} />
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="time">Uhrzeit</Label>
            <Input id="time" type="time" {...register('time')} />
            {errors.time && (
              <p className="text-sm text-destructive">{errors.time.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="repeat">Wiederholung</Label>
          <Select
            value={watch('repeat')}
            onValueChange={(value) => setValue('repeat', value as 'none' | 'daily' | 'weekly' | 'monthly')}
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

        {isEditing && (
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={watch('status')}
              onValueChange={(value) => setValue('status', value as 'pending' | 'done' | 'missed')}
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

        <div className="space-y-2">
          <Label htmlFor="notes">Notizen</Label>
          <Textarea
            id="notes"
            placeholder={type === 'medication' ? 'z.B. 2 Tabletten' : 'z.B. Röntgenbilder mitbringen'}
            rows={3}
            {...register('notes')}
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <Label htmlFor="notification">Benachrichtigung aktivieren</Label>
          <Switch
            id="notification"
            checked={notificationEnabled}
            onCheckedChange={(checked) => setValue('notification_enabled', checked)}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="submit" className="flex-1">
            {isEditing ? 'Speichern' : 'Erstellen'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Abbrechen
          </Button>
        </div>

        {isEditing && onDelete && (
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            className="w-full"
          >
            Löschen
          </Button>
        )}
      </form>
    </Card>
  );
};
