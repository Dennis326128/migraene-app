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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
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
  /** All reminders in the group (for editing multi-time series) */
  groupedReminders?: Reminder[];
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

/**
 * Auto-generate a sensible title based on reminder type and context
 */
function generateAutoTitle(
  type: 'medication' | 'appointment' | 'todo',
  medications: string[],
  timeOfDay?: TimeOfDay | null
): string {
  switch (type) {
    case 'medication':
      if (medications.length === 1) {
        return `${medications[0]} einnehmen`;
      } else if (medications.length > 1) {
        return 'Medikamente einnehmen';
      }
      return 'Medikament einnehmen';
    case 'appointment':
      return 'Arzttermin';
    case 'todo':
      return 'Erinnerung';
    default:
      return 'Erinnerung';
  }
}

export const ReminderForm = ({ reminder, groupedReminders, prefill, onSubmit, onCancel, onDelete, onCreateAnother }: ReminderFormProps) => {
  const isEditing = !!reminder;
  
  // Selected medications
  const [selectedMedications, setSelectedMedications] = useState<string[]>(
    reminder?.medications || prefill?.medications || []
  );

  // Time of day selections (for daily/weekdays)
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDay[]>(() => {
    // Load all time-of-day selections from grouped reminders
    if (groupedReminders && groupedReminders.length > 0) {
      const times = groupedReminders
        .map(r => r.time_of_day)
        .filter((t): t is TimeOfDay => !!t);
      if (times.length > 0) return times;
    }
    if (reminder?.time_of_day) {
      return [reminder.time_of_day];
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
    // Load actual times from all grouped reminders
    if (groupedReminders && groupedReminders.length > 0) {
      for (const r of groupedReminders) {
        if (r.time_of_day) {
          times[r.time_of_day] = extractTimeFromDateTime(r.date_time);
        }
      }
    } else if (reminder?.time_of_day) {
      times[reminder.time_of_day] = extractTimeFromDateTime(reminder.date_time);
    }
    return times;
  });

  // Single time for non-daily reminders
  const [singleTime, setSingleTime] = useState<string>(() => {
    if (reminder) return extractTimeFromDateTime(reminder.date_time);
    if (prefill && (prefill as any).prefill_time) return (prefill as any).prefill_time;
    return '09:00';
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

  // Friendly hint dialog for missing medication
  const [showMedHintDialog, setShowMedHintDialog] = useState(false);

  // Title field removed from UI — auto-title only

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
        time: (prefill as any).prefill_time || '09:00',
        repeat: prefill.repeat || 'none',
        notes: prefill.notes || '',
        notification_enabled: prefill.notification_enabled ?? true,
      }
    : {
        type: 'medication',
        title: '',
        date: getTodayDate(),
        time: '09:00',
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
    const defaultTime = '09:00';

    if (!reminder && !prefill) {
      reset({
        type: 'medication',
        title: '',
        date: todayDate,
        time: defaultTime,
        repeat: 'daily',
        notes: '',
        notification_enabled: true,
      });
      setSelectedMedications([]);
      setSelectedTimeOfDay([]);
      setSingleTime(defaultTime);
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
      // Load all time-of-day selections from grouped reminders
      if (groupedReminders && groupedReminders.length > 0) {
        const allTods = groupedReminders
          .map(r => r.time_of_day)
          .filter((t): t is TimeOfDay => !!t);
        setSelectedTimeOfDay(allTods.length > 0 ? allTods : reminder.time_of_day ? [reminder.time_of_day] : []);
        // Also update custom times from group
        const newCustomTimes: Record<TimeOfDay, string> = { morning: '08:00', noon: '12:00', evening: '18:00', night: '22:00' };
        for (const r of groupedReminders) {
          if (r.time_of_day) {
            newCustomTimes[r.time_of_day] = extractTimeFromDateTime(r.date_time);
          }
        }
        setCustomTimes(newCustomTimes);
      } else if (reminder.time_of_day) {
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
        time: (prefill as any).prefill_time || defaultTime,
        repeat: prefill.repeat || 'none',
        notes: prefill.notes || '',
        notification_enabled: prefill.notification_enabled ?? true,
      });
      setSelectedMedications(prefill.medications || []);
      setSingleTime((prefill as any).prefill_time || defaultTime);
      setFollowUpEnabled(prefill.follow_up_enabled || false);
      setFollowUpValue(prefill.follow_up_interval_value || 3);
      setFollowUpUnit(prefill.follow_up_interval_unit || 'months');
      setSeriesId(prefill.series_id);
    }
  }, [reminder, groupedReminders, prefill, reset]);

  const type = watch('type');
  const notificationEnabled = watch('notification_enabled');
  const repeat = watch('repeat');
  const dateValue = watch('date');

  const isMedicationType = type === 'medication';
  const isAppointmentType = type === 'appointment';
  const isTodoType = type === 'todo';
  
  // Show time-of-day presets for daily/weekdays medication reminders
  const showTimeOfDayPresets = isMedicationType && (repeat === 'daily' || repeat === 'weekdays');
  
  // Time of day is now fully optional — no validation needed
  const hasValidTimeSelection = true;
  
  // Auto-title is always generated internally
  const autoTitle = generateAutoTitle(type as any, selectedMedications, selectedTimeOfDay[0] || null);
  
  // Combined validation for submit button
  const canSubmit = true;

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

  // Intercept form submit to show friendly hint if no medication selected
  const onFormSubmitGuarded = (data: FormData) => {
    if (isMedicationType && selectedMedications.length === 0 && !isEditing) {
      setShowMedHintDialog(true);
      return;
    }
    onFormSubmit(data);
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
      // Multi-time edit: if multiple time-of-day selected, return array for group reconciliation
      if (showTimeOfDayPresets && selectedTimeOfDay.length > 0) {
        const reminders: CreateReminderInput[] = selectedTimeOfDay.map((tod) => {
          const time = customTimes[tod];
          const dateTime = `${data.date}T${time}:00`;
          return {
            type: data.type,
            title: autoTitle,
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

      // Single time edit
      const effectiveTime = singleTime || '09:00';
      const dateTime = `${data.date}T${effectiveTime}:00`;
      
      const submitData: UpdateReminderInput = {
        type: data.type,
        title: autoTitle,
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

    // CREATE MODE with time-of-day presets (daily medication) — only if user selected any
    if (showTimeOfDayPresets && selectedTimeOfDay.length > 0) {
      const reminders: CreateReminderInput[] = selectedTimeOfDay.map((tod) => {
        const time = customTimes[tod];
        const dateTime = `${data.date}T${time}:00`;
        
        return {
          type: data.type,
          title: autoTitle,
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

    // CREATE MODE with single time (no time-of-day selected → default 09:00)
    const effectiveTime = showTimeOfDayPresets ? '09:00' : (singleTime || '09:00');
    const dateTime = `${data.date}T${effectiveTime}:00`;
    
    const submitData: CreateReminderInput = {
      type: data.type,
      title: autoTitle,
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
        <form onSubmit={handleSubmit(onFormSubmitGuarded)} className="space-y-5">
          
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
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
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
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation ${
                    repeat === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-foreground hover:bg-muted'
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

          {/* 4️⃣ TIME OF DAY PRESETS (for daily/weekdays medication) — optional */}
          {showTimeOfDayPresets && (
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
              <Label className="text-base font-medium">Tageszeit</Label>
              
              <div className="grid grid-cols-2 gap-2">
                {TIME_PRESETS.map((preset) => {
                  const isSelected = selectedTimeOfDay.includes(preset.id);
                  const isEditingTime = editingTimeOfDay === preset.id;
                  
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => toggleTimeOfDay(preset.id)}
                      className={`flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-medium transition-all touch-manipulation ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 text-foreground hover:bg-muted'
                      }`}
                    >
                      {preset.icon}
                      <span>{preset.label}</span>
                      {/* Inline time display — only when selected */}
                      {isSelected && (
                        <span
                          className="ml-auto flex items-center gap-1 text-xs opacity-80"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTimeOfDay(preset.id);
                          }}
                        >
                          <Clock className="h-3 w-3" />
                          {isEditingTime ? (
                            <Input
                              type="time"
                              value={customTimes[preset.id]}
                              onChange={(ev) => updateCustomTime(preset.id, ev.target.value)}
                              onBlur={() => setEditingTimeOfDay(null)}
                              onClick={(ev) => ev.stopPropagation()}
                              autoFocus
                              className="h-6 w-20 text-xs bg-primary-foreground text-primary px-1 touch-manipulation"
                            />
                          ) : (
                            customTimes[preset.id]
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Summary — only when selections exist */}
              {selectedTimeOfDay.length > 0 && (
                <p className="text-sm text-muted-foreground pt-2 border-t">
                  {selectedTimeOfDay.length === 1 
                    ? `1 Erinnerung (${customTimes[selectedTimeOfDay[0]]})`
                    : `${selectedTimeOfDay.length} Erinnerungen`
                  }
                </p>
              )}
            </div>
          )}

          {/* 5️⃣ SINGLE TIME + DATE (for non-daily or non-medication) */}
          {!showTimeOfDayPresets && (
            <>
              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="date">
                  {repeat !== 'none' ? 'Startdatum' : 'Datum'}
                </Label>
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

          {/* Title is auto-generated internally — no UI field */}

          {/* 6️⃣ FOLLOW-UP FOR APPOINTMENTS */}
          {isAppointmentType && (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
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

      {/* Friendly hint dialog when no medication selected */}
      <AlertDialog open={showMedHintDialog} onOpenChange={setShowMedHintDialog}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">
              Du hast noch kein Medikament ausgewählt.
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Möchtest du eines hinzufügen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="bg-success hover:bg-success/90 text-success-foreground">
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
