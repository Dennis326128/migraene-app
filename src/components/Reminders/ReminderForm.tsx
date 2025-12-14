import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Reminder, CreateReminderInput, UpdateReminderInput, ReminderPrefill } from '@/types/reminder.types';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Clock, Plus, X, CalendarPlus, Info, Bell, ChevronDown } from 'lucide-react';
import { MedicationSelector } from './MedicationSelector';
import { TimeOfDaySelector, getDefaultTimeSlots, type TimeSlot } from './TimeOfDaySelector';
import { cloneReminderForCreate, generateSeriesId } from '@/features/reminders/helpers/reminderHelpers';
import { 
  NOTIFY_OFFSET_PRESETS, 
  DEFAULT_APPOINTMENT_OFFSETS,
  formatNotifyOffsets 
} from '@/features/reminders/helpers/attention';

const reminderSchema = z.object({
  type: z.enum(['medication', 'appointment']),
  title: z.string().min(1, 'Titel ist erforderlich'),
  date: z.string().min(1, 'Datum ist erforderlich'),
  time: z.string().min(1, 'Uhrzeit ist erforderlich'),
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly']),
  notes: z.string().optional(),
  notification_enabled: z.boolean(),
  status: z.enum(['pending', 'done', 'missed', 'cancelled', 'processing', 'completed', 'failed']).optional(),
});

type FormData = z.infer<typeof reminderSchema>;

interface ReminderFormProps {
  reminder?: Reminder;
  prefill?: ReminderPrefill;
  onSubmit: (data: CreateReminderInput | CreateReminderInput[] | UpdateReminderInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onCreateAnother?: (prefill: ReminderPrefill) => void;
}

// Intelligente Standard-Uhrzeiten für zusätzliche Zeitslots
const getDefaultTimeForSlot = (index: number): string => {
  const defaultTimes = ['08:00', '12:00', '18:00', '21:00'];
  return defaultTimes[index] || '12:00';
};

// Helper to safely parse and format date from date_time
const extractDateFromDateTime = (dateTime: string): string => {
  try {
    const date = parseISO(dateTime);
    return format(date, 'yyyy-MM-dd');
  } catch {
    return format(new Date(), 'yyyy-MM-dd');
  }
};

// Helper to safely parse and format time from date_time
const extractTimeFromDateTime = (dateTime: string): string => {
  try {
    const date = parseISO(dateTime);
    return format(date, 'HH:mm');
  } catch {
    return format(new Date(), 'HH:mm');
  }
};

export const ReminderForm = ({ reminder, prefill, onSubmit, onCancel, onDelete, onCreateAnother }: ReminderFormProps) => {
  const isEditing = !!reminder;
  const dateInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedMedications, setSelectedMedications] = useState<string[]>(
    reminder?.medications || prefill?.medications || []
  );
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(() => {
    if (reminder && reminder.time_of_day) {
      const slots = getDefaultTimeSlots();
      return slots.map(slot => 
        slot.timeOfDay === reminder.time_of_day 
          ? { ...slot, enabled: true, time: extractTimeFromDateTime(reminder.date_time) }
          : slot
      );
    }
    return getDefaultTimeSlots();
  });

  // Dynamische Uhrzeiten (max 4 für medication, max 1 für appointment)
  // BUGFIX: Proper prefilling of time when editing or using prefill
  const [times, setTimes] = useState<string[]>(() => {
    if (reminder) {
      return [extractTimeFromDateTime(reminder.date_time)];
    }
    if (prefill?.prefill_date) {
      // For follow-up, we suggest the original time as a starting point
      // This is passed via the prefill mechanism
      return [(prefill as any).prefill_time || format(new Date(), 'HH:mm')];
    }
    return [format(new Date(), 'HH:mm')];
  });

  // Follow-up settings for appointments
  const [followUpEnabled, setFollowUpEnabled] = useState(
    (reminder as any)?.follow_up_enabled || prefill?.follow_up_enabled || false
  );
  const [followUpValue, setFollowUpValue] = useState<number>(
    (reminder as any)?.follow_up_interval_value || prefill?.follow_up_interval_value || 3
  );
  const [followUpUnit, setFollowUpUnit] = useState<'weeks' | 'months'>(
    (reminder as any)?.follow_up_interval_unit || prefill?.follow_up_interval_unit || 'months'
  );
  const [seriesId, setSeriesId] = useState<string | undefined>(
    (reminder as any)?.series_id || prefill?.series_id
  );

  // Notify offsets for appointments (iPhone-style)
  const [notifyOffsets, setNotifyOffsets] = useState<number[]>(() => {
    const existing = (reminder as any)?.notify_offsets_minutes;
    return existing && existing.length > 0 ? existing : DEFAULT_APPOINTMENT_OFFSETS;
  });
  const [notifyOffsetsOpen, setNotifyOffsetsOpen] = useState(false);

  // Focus date input when prefill mode (for "Weiteren Termin anlegen")
  useEffect(() => {
    if (prefill && !prefill.prefill_date && dateInputRef.current) {
      setTimeout(() => dateInputRef.current?.focus(), 100);
    }
  }, [prefill]);

  const handleAddTime = () => {
    if (times.length < 4) {
      const nextTime = getDefaultTimeForSlot(times.length);
      setTimes([...times, nextTime]);
    }
  };

  const handleRemoveTime = (index: number) => {
    if (times.length > 1) {
      setTimes(times.filter((_, i) => i !== index));
    }
  };

  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...times];
    newTimes[index] = value;
    setTimes(newTimes);
  };

  // BUGFIX: Proper date/time extraction for editing
  const defaultValues: FormData = reminder
    ? {
        type: reminder.type,
        title: reminder.title,
        date: extractDateFromDateTime(reminder.date_time),
        time: extractTimeFromDateTime(reminder.date_time),
        repeat: reminder.repeat,
        notes: reminder.notes || '',
        notification_enabled: reminder.notification_enabled,
        status: reminder.status,
      }
    : prefill
    ? {
        type: prefill.type,
        title: prefill.title,
        date: prefill.prefill_date || '',
        time: (prefill as any).prefill_time || '',
        repeat: prefill.repeat || 'none',
        notes: prefill.notes || '',
        notification_enabled: prefill.notification_enabled ?? true,
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
  const dateValue = watch('date');

  const isMedicationType = type === 'medication';
  const isAppointmentType = type === 'appointment';
  const enabledTimeSlots = timeSlots.filter(slot => slot.enabled);
  const useMultipleTimeSlots = isMedicationType && repeat === 'daily' && enabledTimeSlots.length > 0;

  // For appointments, limit to 1 time
  const maxTimes = isAppointmentType ? 1 : 4;

  const handleCreateAnotherAppointment = () => {
    if (!onCreateAnother) return;

    const currentFormState = {
      type: type as 'medication' | 'appointment',
      title: watch('title'),
      notes: watch('notes') || '',
      notification_enabled: notificationEnabled,
      repeat: repeat as any,
      medications: selectedMedications,
      follow_up_enabled: followUpEnabled,
      follow_up_interval_value: followUpValue,
      follow_up_interval_unit: followUpUnit,
      series_id: seriesId || generateSeriesId(),
    };

    const cloned = cloneReminderForCreate(
      { ...currentFormState, date: dateValue, times } as any,
      { clearDateTime: true, preserveSeriesId: true }
    );

    onCreateAnother({
      type: cloned.type || 'appointment',
      title: cloned.title || '',
      notes: cloned.notes,
      notification_enabled: cloned.notification_enabled,
      medications: cloned.medications,
      repeat: cloned.repeat,
      follow_up_enabled: cloned.follow_up_enabled,
      follow_up_interval_value: cloned.follow_up_interval_value,
      follow_up_interval_unit: cloned.follow_up_interval_unit,
      series_id: cloned.series_id,
    });
  };

  const onFormSubmit = (data: FormData) => {
    // Calculate next_follow_up_date for appointments
    let next_follow_up_date: string | undefined;
    let finalSeriesId = seriesId;

    if (isAppointmentType && followUpEnabled && followUpValue && followUpUnit && data.date) {
      const baseDate = new Date(data.date);
      if (followUpUnit === 'weeks') {
        baseDate.setDate(baseDate.getDate() + followUpValue * 7);
      } else {
        baseDate.setMonth(baseDate.getMonth() + followUpValue);
      }
      next_follow_up_date = format(baseDate, 'yyyy-MM-dd');
      
      // Generate series_id if not exists
      if (!finalSeriesId) {
        finalSeriesId = generateSeriesId();
        setSeriesId(finalSeriesId);
      }
    }

    // For editing, use single reminder
    if (isEditing) {
      const dateTime = `${data.date}T${times[0]}:00`;
      
      const submitData: UpdateReminderInput = {
        type: data.type,
        title: data.title,
        date_time: dateTime,
        repeat: data.repeat,
        notes: data.notes || undefined,
        notification_enabled: data.notification_enabled,
        ...(isMedicationType && selectedMedications.length > 0 ? { medications: selectedMedications } : {}),
        ...(data.status ? { status: data.status } : {}),
        // Follow-up fields for appointments
        ...(isAppointmentType ? {
          follow_up_enabled: followUpEnabled,
          follow_up_interval_value: followUpEnabled ? followUpValue : undefined,
          follow_up_interval_unit: followUpEnabled ? followUpUnit : undefined,
          next_follow_up_date: next_follow_up_date,
          series_id: finalSeriesId,
          notify_offsets_minutes: notifyOffsets,
        } : {}),
      };

      onSubmit(submitData);
      return;
    }

    // Use TimeOfDaySelector slots for daily medication reminders
    if (useMultipleTimeSlots) {
      const reminders: CreateReminderInput[] = enabledTimeSlots.map((slot) => {
        const dateTime = `${data.date}T${slot.time}:00`;
        const medsList = selectedMedications.length > 0 ? selectedMedications.join(', ') : 'Medikamente';
        
        return {
          type: data.type,
          title: `${medsList} (${slot.label})`,
          date_time: dateTime,
          repeat: data.repeat,
          notes: data.notes || undefined,
          notification_enabled: data.notification_enabled,
          medications: selectedMedications,
          time_of_day: slot.timeOfDay,
        };
      });

      onSubmit(reminders);
      return;
    }

    // Create reminders for each dynamic time
    if (times.length === 1) {
      const dateTime = `${data.date}T${times[0]}:00`;
      
      const submitData: CreateReminderInput = {
        type: data.type,
        title: data.title,
        date_time: dateTime,
        repeat: data.repeat,
        notes: data.notes || undefined,
        notification_enabled: data.notification_enabled,
        ...(isMedicationType && selectedMedications.length > 0 ? { medications: selectedMedications } : {}),
        // Follow-up fields for appointments
        ...(isAppointmentType ? {
          follow_up_enabled: followUpEnabled,
          follow_up_interval_value: followUpEnabled ? followUpValue : undefined,
          follow_up_interval_unit: followUpEnabled ? followUpUnit : undefined,
          next_follow_up_date: next_follow_up_date,
          series_id: finalSeriesId,
          notify_offsets_minutes: notifyOffsets,
        } : {}),
      };

      onSubmit(submitData);
    } else {
      // Multiple times -> create multiple reminders (medication only)
      const reminders: CreateReminderInput[] = times.map((time, index) => {
        const dateTime = `${data.date}T${time}:00`;
        
        return {
          type: data.type,
          title: times.length > 1 ? `${data.title} (${index + 1})` : data.title,
          date_time: dateTime,
          repeat: data.repeat,
          notes: data.notes || undefined,
          notification_enabled: data.notification_enabled,
          ...(isMedicationType && selectedMedications.length > 0 ? { medications: selectedMedications } : {}),
        };
      });

      onSubmit(reminders);
    }
  };

  // Show "Weiteren Termin anlegen" button for appointments when date is set
  const canCreateAnother = isAppointmentType && dateValue && onCreateAnother;

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
          {isEditing ? 'Erinnerung bearbeiten' : prefill ? 'Folgetermin anlegen' : 'Neue Erinnerung'}
        </h1>
      </div>

      <Card className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto modern-scrollbar">
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

              <div className="space-y-2">
                <Label htmlFor="date">Datum</Label>
                <Input
                  id="date"
                  type="date"
                  {...register('date')}
                  ref={dateInputRef}
                  className="touch-manipulation"
                />
                {errors.date && (
                  <p className="text-sm text-destructive">{errors.date.message}</p>
                )}
              </div>

              {/* Dynamische Uhrzeiten */}
              <div className="space-y-3">
                <Label>Uhrzeit{times.length > 1 ? 'en' : ''}</Label>
                
                <div className="space-y-2">
                  {times.map((time, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <Input
                        type="time"
                        value={time}
                        onChange={(e) => handleTimeChange(index, e.target.value)}
                        className="touch-manipulation flex-1"
                      />
                      {index > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveTime(index)}
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {times.length < maxTimes && isMedicationType && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddTime}
                    className="w-full touch-manipulation"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Uhrzeit hinzufügen ({times.length}/{maxTimes})
                  </Button>
                )}

                {times.length > 1 && (
                  <p className="text-sm text-muted-foreground">
                    Es werden {times.length} Erinnerungen erstellt
                  </p>
                )}
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

          {/* Repeat dropdown - hidden for appointments */}
          {isMedicationType && (
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
          )}

          {/* Follow-up section for appointments */}
          {isAppointmentType && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="follow-up" className="cursor-pointer font-medium">
                    Folgetermin vorschlagen
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Erinnerung für den nächsten Termin
                  </p>
                </div>
                <Switch
                  id="follow-up"
                  checked={followUpEnabled}
                  onCheckedChange={setFollowUpEnabled}
                />
              </div>

              {followUpEnabled && (
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Nach</span>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={followUpValue}
                    onChange={(e) => setFollowUpValue(parseInt(e.target.value) || 3)}
                    className="w-20 touch-manipulation"
                  />
                  <Select
                    value={followUpUnit}
                    onValueChange={(v) => setFollowUpUnit(v as 'weeks' | 'months')}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weeks">Wochen</SelectItem>
                      <SelectItem value="months">Monaten</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {followUpEnabled && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-background/50 p-2 rounded">
                  <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>Du wählst Datum und Uhrzeit für jeden Folgetermin individuell.</span>
                </div>
              )}
            </div>
          )}

          {/* iPhone-style notification offsets for appointments */}
          {isAppointmentType && (
            <Collapsible open={notifyOffsetsOpen} onOpenChange={setNotifyOffsetsOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between touch-manipulation"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <span className="font-medium">Hinweise</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground max-w-[180px] truncate">
                      {formatNotifyOffsets(notifyOffsets)}
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${notifyOffsetsOpen ? 'rotate-180' : ''}`} />
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Wähle bis zu 4 Erinnerungszeitpunkte (wie beim iPhone)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {NOTIFY_OFFSET_PRESETS.map((preset) => {
                      const isSelected = notifyOffsets.includes(preset.value);
                      const canSelect = isSelected || notifyOffsets.length < 4;
                      
                      return (
                        <div
                          key={preset.value}
                          className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-primary/10 border-primary' 
                              : canSelect 
                                ? 'hover:bg-muted' 
                                : 'opacity-50 cursor-not-allowed'
                          }`}
                          onClick={() => {
                            if (isSelected) {
                              setNotifyOffsets(notifyOffsets.filter(v => v !== preset.value));
                            } else if (canSelect) {
                              setNotifyOffsets([...notifyOffsets, preset.value].sort((a, b) => b - a));
                            }
                          }}
                        >
                          <Checkbox 
                            checked={isSelected} 
                            disabled={!canSelect && !isSelected}
                            className="pointer-events-none"
                          />
                          <span className="text-sm">{preset.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  {notifyOffsets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {notifyOffsets.sort((a, b) => b - a).map((offset) => {
                        const preset = NOTIFY_OFFSET_PRESETS.find(p => p.value === offset);
                        return (
                          <Badge 
                            key={offset} 
                            variant="secondary"
                            className="gap-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setNotifyOffsets(notifyOffsets.filter(v => v !== offset))}
                          >
                            {preset?.label || `${offset} Min`}
                            <X className="h-3 w-3" />
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* "Weiteren Termin anlegen" button */}
          {canCreateAnother && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCreateAnotherAppointment}
              className="w-full touch-manipulation gap-2"
            >
              <CalendarPlus className="h-4 w-4" />
              Weiteren Termin anlegen
            </Button>
          )}

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

          <div className="flex gap-3 pt-4 items-center">
            {isEditing && onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                Löschen
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
              className="touch-manipulation min-h-11"
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              variant="success"
              disabled={isSubmitting}
              className="touch-manipulation min-h-11 min-w-[120px]"
            >
              {isSubmitting ? 'Speichern...' : '💾 Speichern'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
