import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import type { TimeOfDay } from '@/types/reminder.types';

export interface TimeSlot {
  timeOfDay: TimeOfDay;
  time: string; // HH:mm
  enabled: boolean;
  label: string;
  icon: React.ReactNode;
}

interface TimeOfDaySelectorProps {
  timeSlots: TimeSlot[];
  onSlotsChange: (slots: TimeSlot[]) => void;
}

const DEFAULT_TIME_SLOTS: Omit<TimeSlot, 'enabled'>[] = [
  { timeOfDay: 'morning', time: '08:00', label: 'Morgens', icon: <Sunrise className="h-4 w-4" /> },
  { timeOfDay: 'noon', time: '12:00', label: 'Mittags', icon: <Sun className="h-4 w-4" /> },
  { timeOfDay: 'evening', time: '18:00', label: 'Abends', icon: <Sunset className="h-4 w-4" /> },
  { timeOfDay: 'night', time: '22:00', label: 'Nachts', icon: <Moon className="h-4 w-4" /> },
];

export const TimeOfDaySelector = ({ timeSlots, onSlotsChange }: TimeOfDaySelectorProps) => {
  const handleToggleSlot = (timeOfDay: TimeOfDay) => {
    const updatedSlots = timeSlots.map((slot) =>
      slot.timeOfDay === timeOfDay ? { ...slot, enabled: !slot.enabled } : slot
    );
    onSlotsChange(updatedSlots);
  };

  const handleTimeChange = (timeOfDay: TimeOfDay, newTime: string) => {
    const updatedSlots = timeSlots.map((slot) =>
      slot.timeOfDay === timeOfDay ? { ...slot, time: newTime } : slot
    );
    onSlotsChange(updatedSlots);
  };

  return (
    <div className="space-y-3">
      <Label className="text-base">Tageszeiten</Label>
      <div className="space-y-3 border rounded-md p-4">
        {timeSlots.map((slot) => (
          <div key={slot.timeOfDay} className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-2 flex-1">
              <Checkbox
                id={`time-${slot.timeOfDay}`}
                checked={slot.enabled}
                onCheckedChange={() => handleToggleSlot(slot.timeOfDay)}
              />
              <Label
                htmlFor={`time-${slot.timeOfDay}`}
                className="text-sm font-normal cursor-pointer flex items-center gap-2"
              >
                {slot.icon}
                {slot.label}
              </Label>
            </div>
            <Input
              type="time"
              value={slot.time}
              onChange={(e) => handleTimeChange(slot.timeOfDay, e.target.value)}
              disabled={!slot.enabled}
              className="w-32"
            />
          </div>
        ))}
      </div>
      {timeSlots.filter(s => s.enabled).length > 0 && (
        <div className="text-sm text-muted-foreground">
          {timeSlots.filter(s => s.enabled).length} Tageszeit(en) ausgewählt
        </div>
      )}
    </div>
  );
};

export const getDefaultTimeSlots = (): TimeSlot[] => {
  return DEFAULT_TIME_SLOTS.map(slot => ({ ...slot, enabled: false }));
};