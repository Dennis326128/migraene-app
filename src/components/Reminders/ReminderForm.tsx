import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { SaveButton } from '@/components/ui/save-button';
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
import type { Reminder, CreateReminderInput, UpdateReminderInput, ReminderPrefill, TimeOfDay } from '@/types/reminder.types';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Clock, Plus, X, CalendarPlus, Info, Bell, ChevronDown, ListTodo, Pill, Calendar, Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import { MedicationSelector } from './MedicationSelector';
import { cloneReminderForCreate, generateSeriesId } from '@/features/reminders/helpers/reminderHelpers';
import { 
  NOTIFY_OFFSET_PRESETS, 
  DEFAULT_APPOINTMENT_OFFSETS,
  formatNotifyOffsets 
} from '@/features/reminders/helpers/attention';
import { WeekdayPicker, type Weekday } from '@/components/ui/weekday-picker';

// Schema - title is optional for medication type (auto-generated from medications)
const reminderSchema = z.object({
  type: z.enum(['medication', 'appointment', 'todo']),
  title: z.string().optional().default(''),
  date: z.string().min(1, 'Datum ist erforderlich'),
  time: z.string().optional(),
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly', 'weekdays']),
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

// Time of day presets with default times
interface TimePreset {
  id: TimeOfDay;
  label: string;
  time: string;
  icon: React.ReactNode;
}

const TIME_PRESETS: TimePreset[] = [
  { id: 'morning', label: 'Morgens', time: '08:00', icon: <Sunrise className="h-4 w-4" /> },
  { id: 'noon', label: 'Mittags', time: '12:00', icon: <Sun className="h-4 w-4" /> },
  { id: 'evening', label: 'Abends', time: '18:00', icon: <Sunset className="h-4 w-4" /> },
  { id: 'night', label: 'Nachts', time: '22:00', icon: <Moon className="h-4 w-4" /> },
];

// Helper functions
const extractDateFromDateTime = (dateTime: string): string => {
  try {
    const date = parseISO(dateTime);
    return format(date, 'yyyy-MM-dd');
  } catch {
    return format(new Date(), 'yyyy-MM-dd');
  }
};

const extractTimeFromDateTime = (dateTime: string): string => {
  try {
    const date = parseISO(dateTime);
    return format(date, 'HH:mm');
  } catch {
    return format(new Date(), 'HH:mm');
  }
};

const getTodayDate = (): string => format(new Date(), 'yyyy-MM-dd');

export const ReminderForm = ({ reminder, prefill, onSubmit, onCancel, onDelete, onCreateAnother }: ReminderFormProps) => {
  const isEditing = !!reminder;
  
  // Selected medications
  const [selectedMedications, setSelectedMedications] = useState<string[]>(
    reminder?.medications || prefill?.medications || []
  );

  // Time of day selections (for daily/weekdays)
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDay[]>(() => {
    if (reminder?.time_of_day) {
      return [reminder.time_of_day];
    }
    // Default: Morgens selected for new medication reminders
    if (!reminder && (!prefill || prefill.type === 'medication')) {
      return ['morning'];
    }
    return [];
  });

  // Custom times per preset (for fine-tuning)
  const [customTimes, setCustomTimes] = useState<Record<TimeOfDay, string>>(() => {
    const times: Record<TimeOfDay, string> = {
      morning: '08:00',
      noon: '12:00',
      evening: '18:00',
      night: '22:00',
    };
    if (reminder?.time_of_day) {
      times[reminder.time_of_day] = extractTimeFromDateTime(reminder.date_time);
    }
    return times;
  });

  // Single time for non-daily reminders
  const [singleTime, setSingleTime] = useState<string>(() => {
    if (reminder) return extractTimeFromDateTime(reminder.date_time);
    if (prefill && (prefill as any).prefill_time) return (prefill as any).prefill_time;
    return format(new Date(), 'HH:mm');
  });

  // Time picker state for inline editing
  const [editingTimeOfDay, setEditingTimeOfDay] = useState<TimeOfDay | null>(null);

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

  // Notify offsets for appointments
  const [notifyOffsets, setNotifyOffsets] = useState<number[]>(() => {
    const existing = (reminder as any)?.notify_offsets_minutes;
    return existing && existing.length > 0 ? existing : DEFAULT_APPOINTMENT_OFFSETS;
  });
  const [notifyOffsetsOpen, setNotifyOffsetsOpen] = useState(false);

  // Weekdays for weekday repeat
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([]);

  // Form setup
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
        date: prefill.prefill_date?.trim() || getTodayDate(),
        time: (prefill as any).prefill_time || format(new Date(), 'HH:mm'),
        repeat: prefill.repeat || 'none',
        notes: prefill.notes || '',
        notification_enabled: prefill.notification_enabled ?? true,
      }
    : {
        type: 'medication',
        title: '',
        date: getTodayDate(),
        time: format(new Date(), 'HH:mm'),
        repeat: 'daily', // Default to daily for new reminders
        notes: '',
        notification_enabled: true,
      };

  const { register, handleSubmit, watch, setValue, reset, formState } = useForm<FormData>({
    resolver: zodResolver(reminderSchema),
    defaultValues,
  });

  const { errors, isSubmitting } = formState;

  // Reset form when switching modes
  useEffect(() => {
    const now = new Date();
    const todayDate = format(now, 'yyyy-MM-dd');
    const currentTime = format(now, 'HH:mm');

    if (!reminder && !prefill) {
      reset({
        type: 'medication',
        title: '',
        date: todayDate,
        time: currentTime,
        repeat: 'daily',
        notes: '',
        notification_enabled: true,
      });
      setSelectedMedications([]);
      setSelectedTimeOfDay([]);
      setSingleTime(currentTime);
      setFollowUpEnabled(false);
      setFollowUpValue(3);
      setFollowUpUnit('months');
      setSeriesId(undefined);
      setNotifyOffsets(DEFAULT_APPOINTMENT_OFFSETS);
      setEditingTimeOfDay(null);
    } else if (reminder) {
      reset({
        type: reminder.type,
        title: reminder.title,
        date: extractDateFromDateTime(reminder.date_time),
        time: extractTimeFromDateTime(reminder.date_time),
        repeat: reminder.repeat,
        notes: reminder.notes || '',
        notification_enabled: reminder.notification_enabled,
        status: reminder.status,
      });
      setSelectedMedications(reminder.medications || []);
      if (reminder.time_of_day) {
        setSelectedTimeOfDay([reminder.time_of_day]);
      }
      setSingleTime(extractTimeFromDateTime(reminder.date_time));
      setFollowUpEnabled((reminder as any).follow_up_enabled || false);
      setFollowUpValue((reminder as any).follow_up_interval_value || 3);
      setFollowUpUnit((reminder as any).follow_up_interval_unit || 'months');
      setSeriesId((reminder as any).series_id);
      setNotifyOffsets((reminder as any).notify_offsets_minutes || DEFAULT_APPOINTMENT_OFFSETS);
    } else if (prefill) {
      reset({
        type: prefill.type,
        title: prefill.title,
        date: prefill.prefill_date?.trim() || todayDate,
        time: (prefill as any).prefill_time || currentTime,
        repeat: prefill.repeat || 'none',
        notes: prefill.notes || '',
        notification_enabled: prefill.notification_enabled ?? true,
      });
      setSelectedMedications(prefill.medications || []);
      setSingleTime((prefill as any).prefill_time || currentTime);
      setFollowUpEnabled(prefill.follow_up_enabled || false);
      setFollowUpValue(prefill.follow_up_interval_value || 3);
      setFollowUpUnit(prefill.follow_up_interval_unit || 'months');
      setSeriesId(prefill.series_id);
    }
  }, [reminder, prefill, reset]);

  const type = watch('type');
  const notificationEnabled = watch('notification_enabled');
  const repeat = watch('repeat');
  const dateValue = watch('date');

  const isMedicationType = type === 'medication';
  const isAppointmentType = type === 'appointment';
  const isTodoType = type === 'todo';
  
  // Show time-of-day presets for daily/weekdays medication reminders
  const showTimeOfDayPresets = isMedicationType && (repeat === 'daily' || repeat === 'weekdays');
  
  // Need at least one time of day selected for daily meds
  const hasValidTimeSelection = !showTimeOfDayPresets || selectedTimeOfDay.length > 0;
  
  // Title validation: required when not using time-of-day presets (which auto-generate title)
  const titleValue = watch('title');
  const hasValidTitle = showTimeOfDayPresets || (titleValue && titleValue.trim().length > 0);
  
  // Combined validation for submit button
  const canSubmit = hasValidTimeSelection && hasValidTitle;

  // Toggle time of day selection
  const toggleTimeOfDay = (tod: TimeOfDay) => {
    setSelectedTimeOfDay(prev => 
      prev.includes(tod) 
        ? prev.filter(t => t !== tod)
        : [...prev, tod]
    );
  };

  // Update custom time for a preset
  const updateCustomTime = (tod: TimeOfDay, time: string) => {
    setCustomTimes(prev => ({ ...prev, [tod]: time }));
  };

  // Handle form submit
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
      
      if (!finalSeriesId) {
        finalSeriesId = generateSeriesId();
        setSeriesId(finalSeriesId);
      }
    }

    // EDITING MODE
    if (isEditing) {
      const effectiveTime = showTimeOfDayPresets && selectedTimeOfDay.length > 0
        ? customTimes[selectedTimeOfDay[0]]
        : singleTime || '09:00';
      const dateTime = `${data.date}T${effectiveTime}:00`;
      
      const submitData: UpdateReminderInput = {
        type: data.type,
        title: data.title,
        date_time: dateTime,
        repeat: data.repeat,
        notes: data.notes || undefined,
        notification_enabled: data.notification_enabled,
        ...(isMedicationType && selectedMedications.length > 0 ? { medications: selectedMedications } : {}),
        ...(data.status ? { status: data.status } : {}),
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

    // CREATE MODE with time-of-day presets (daily medication)
    if (showTimeOfDayPresets && selectedTimeOfDay.length > 0) {
      const medsList = selectedMedications.length > 0 ? selectedMedications.join(', ') : 'Medikamente';
      
      const reminders: CreateReminderInput[] = selectedTimeOfDay.map((tod) => {
        const preset = TIME_PRESETS.find(p => p.id === tod)!;
        const time = customTimes[tod];
        const dateTime = `${data.date}T${time}:00`;
        
        return {
          type: data.type,
          title: `${medsList} (${preset.label})`,
          date_time: dateTime,
          repeat: data.repeat,
          notes: data.notes || undefined,
          notification_enabled: data.notification_enabled,
          medications: selectedMedications,
          time_of_day: tod,
        };
      });

      onSubmit(reminders);
      return;
    }

    // CREATE MODE with single time
    const effectiveTime = singleTime || '09:00';
    const dateTime = `${data.date}T${effectiveTime}:00`;
    
    // Generate title if empty (for medication type)
    const effectiveTitle = data.title?.trim() 
      || (isMedicationType && selectedMedications.length > 0 
          ? selectedMedications.join(', ') 
          : 'Erinnerung');
    
    const submitData: CreateReminderInput = {
      type: data.type,
      title: effectiveTitle,
      date_time: dateTime,
      repeat: data.repeat,
      notes: data.notes || undefined,
      notification_enabled: data.notification_enabled,
      ...(isMedicationType && selectedMedications.length > 0 ? { medications: selectedMedications } : {}),
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
  };

  const canCreateAnother = isAppointmentType && dateValue && onCreateAnother;

  const handleCreateAnotherAppointment = () => {
    if (!onCreateAnother) return;

    const currentFormState = {
      type: type as 'medication' | 'appointment' | 'todo',
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
      { ...currentFormState, date: dateValue, times: [singleTime] } as any,
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

  return (
    <div className="px-3 sm:px-4 py-4 sm:py-6 pb-safe">
      {/* Header */}
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
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
          
          {/* 1️⃣ TYPE SELECTION */}
          <div className="space-y-2">
            <Label htmlFor="type">Typ</Label>
            <Select
              value={type}
              onValueChange={(value) => {
                setValue('type', value as 'medication' | 'appointment' | 'todo');
                // Set smart defaults based on type
                if (value === 'medication') {
                  setValue('repeat', 'daily');
                } else {
                  setValue('repeat', 'none');
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medication">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4" />
                    Medikament
                  </div>
                </SelectItem>
                <SelectItem value="appointment">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Termin
                  </div>
                </SelectItem>
                <SelectItem value="todo">
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4" />
                    To-do
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 2️⃣ MEDICATION SELECTOR (only for medication type) */}
          {isMedicationType && (
            <MedicationSelector
              selectedMedications={selectedMedications}
              onSelectionChange={setSelectedMedications}
            />
          )}

          {/* 3️⃣ REPEAT SELECTION - NOW FIRST AFTER TYPE! */}
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
            <Label className="text-base font-medium">Wie oft erinnern?</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { value: 'none', label: 'Einmal' },
                { value: 'daily', label: 'Täglich' },
                { value: 'weekdays', label: 'Wochentage' },
                { value: 'weekly', label: 'Wöchentlich' },
                { value: 'monthly', label: 'Monatlich' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setValue('repeat', option.value as any)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all touch-manipulation ${
                    repeat === option.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Weekday picker when weekdays selected */}
            {repeat === 'weekdays' && (
              <div className="pt-3 space-y-2">
                <Label className="text-sm">An welchen Tagen?</Label>
                <WeekdayPicker
                  value={selectedWeekdays}
                  onChange={setSelectedWeekdays}
                  size="sm"
                />
                {selectedWeekdays.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Mindestens ein Tag erforderlich
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 4️⃣ TIME OF DAY PRESETS (for daily/weekdays medication) */}
          {showTimeOfDayPresets && (
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
              <Label className="text-base font-medium">Zu welchen Tageszeiten?</Label>
              <p className="text-sm text-muted-foreground -mt-1">
                Wähle eine oder mehrere Zeiten
              </p>
              
              <div className="grid grid-cols-2 gap-2">
                {TIME_PRESETS.map((preset) => {
                  const isSelected = selectedTimeOfDay.includes(preset.id);
                  const isEditing = editingTimeOfDay === preset.id;
                  
                  return (
                    <div
                      key={preset.id}
                      className={`relative flex flex-col rounded-lg border text-sm transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {/* Main button for toggle */}
                      <button
                        type="button"
                        onClick={() => toggleTimeOfDay(preset.id)}
                        className="flex items-center gap-2 px-3 py-3 touch-manipulation"
                      >
                        {preset.icon}
                        <span className="font-medium">{preset.label}</span>
                      </button>
                      
                      {/* Time display/edit - tappable */}
                      {isSelected && (
                        <div className="px-3 pb-3 pt-0">
                          {isEditing ? (
                            <Input
                              type="time"
                              value={customTimes[preset.id]}
                              onChange={(e) => updateCustomTime(preset.id, e.target.value)}
                              onBlur={() => setEditingTimeOfDay(null)}
                              autoFocus
                              className="h-8 text-sm bg-primary-foreground text-primary touch-manipulation"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTimeOfDay(preset.id);
                              }}
                              className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors touch-manipulation"
                            >
                              <Clock className="h-3 w-3" />
                              <span className="text-sm font-medium">{customTimes[preset.id]}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {selectedTimeOfDay.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Mindestens eine Tageszeit auswählen
                </p>
              )}

              {/* Summary */}
              {selectedTimeOfDay.length > 0 && (
                <p className="text-sm text-muted-foreground pt-2 border-t">
                  {selectedTimeOfDay.length === 1 
                    ? `1 Erinnerung wird erstellt (${customTimes[selectedTimeOfDay[0]]})`
                    : `${selectedTimeOfDay.length} Erinnerungen werden erstellt`
                  }
                </p>
              )}
            </div>
          )}

          {/* 5️⃣ SINGLE TIME + DATE (for non-daily or non-medication) */}
          {!showTimeOfDayPresets && (
            <>
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">{isTodoType ? 'Text' : 'Titel'}</Label>
                <Input
                  id="title"
                  {...register('title')}
                  placeholder={isTodoType ? 'z. B. Rezept abholen' : 'Titel eingeben...'}
                  className="touch-manipulation"
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              {/* Date */}
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

              {/* Time */}
              <div className="space-y-2">
                <Label htmlFor="time">
                  Uhrzeit {isTodoType && <span className="text-muted-foreground font-normal">(optional)</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    type="time"
                    value={singleTime}
                    onChange={(e) => setSingleTime(e.target.value)}
                    className="touch-manipulation flex-1"
                  />
                </div>
              </div>
            </>
          )}

          {/* Start date for time-of-day mode */}
          {showTimeOfDayPresets && selectedTimeOfDay.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="date">Ab wann?</Label>
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
          )}

          {/* 6️⃣ FOLLOW-UP FOR APPOINTMENTS */}
          {isAppointmentType && (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
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
            </div>
          )}

          {/* 7️⃣ NOTIFICATION OFFSETS FOR APPOINTMENTS */}
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
                    Wähle bis zu 4 Erinnerungszeitpunkte
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

          {/* Create another appointment button */}
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

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notizen (optional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              rows={3}
              className="touch-manipulation resize-none"
            />
          </div>

          {/* Notifications toggle */}
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

          {/* Status (only when editing) */}
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

          {/* Action buttons */}
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
            <SaveButton
              type="submit"
              loading={isSubmitting}
              disabled={!canSubmit}
              className="touch-manipulation min-h-11 min-w-[120px]"
            />
          </div>
        </form>
      </Card>
    </div>
  );
};
