import React, { useState } from 'react';
import { Clock, Moon, Sunrise, Calendar, X } from 'lucide-react';
import { format, addMinutes, setHours, setMinutes, startOfDay, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { 
  SNOOZE_PRESETS, 
  calculateSnoozeTime, 
  getSmartSnoozeTime,
  formatSnoozeTime,
  type SnoozePresetValue,
} from '@/features/reminders/helpers/snooze';

interface SnoozeOptionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (until: Date) => void;
  reminderTitle?: string;
}

const getIcon = (icon: string) => {
  switch (icon) {
    case 'clock': return Clock;
    case 'moon': return Moon;
    case 'sunrise': return Sunrise;
    case 'calendar': return Calendar;
    default: return Clock;
  }
};

export const SnoozeOptionsSheet: React.FC<SnoozeOptionsSheetProps> = ({
  open,
  onOpenChange,
  onSnooze,
  reminderTitle,
}) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDate, setCustomDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customTime, setCustomTime] = useState(format(addMinutes(new Date(), 30), 'HH:mm'));
  
  const now = new Date();

  const handlePresetClick = (preset: SnoozePresetValue) => {
    if (preset === 'custom') {
      setShowCustomPicker(true);
      return;
    }
    
    const targetTime = calculateSnoozeTime(preset, now);
    onSnooze(targetTime);
    onOpenChange(false);
  };

  const handleSmartSnooze = () => {
    const targetTime = getSmartSnoozeTime(now);
    onSnooze(targetTime);
    onOpenChange(false);
  };

  const handleCustomSnooze = () => {
    const targetTime = new Date(`${customDate}T${customTime}:00`);
    if (targetTime > now) {
      onSnooze(targetTime);
      onOpenChange(false);
      setShowCustomPicker(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Später erinnern"
      description={reminderTitle || "Wähle einen Zeitpunkt"}
    >
      <div className="space-y-4">
        {!showCustomPicker ? (
          <>
            {/* Smart Snooze - Primary Action */}
            <Button
              onClick={handleSmartSnooze}
              className="w-full gap-2 min-h-[52px] text-base"
              size="lg"
            >
              <Clock className="h-5 w-5" />
              <span className="flex-1 text-left">Später erinnern</span>
              <span className="text-xs opacity-80">
                {formatSnoozeTime(getSmartSnoozeTime(now), now)}
              </span>
            </Button>

            <div className="text-xs text-muted-foreground text-center">
              oder wähle einen Zeitpunkt:
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-2 gap-2">
              {SNOOZE_PRESETS.map((preset) => {
                const Icon = getIcon(preset.icon);
                const isCustom = preset.value === 'custom';
                const previewTime = !isCustom 
                  ? formatSnoozeTime(calculateSnoozeTime(preset.value, now), now)
                  : null;
                
                return (
                  <Button
                    key={String(preset.value)}
                    variant="outline"
                    onClick={() => handlePresetClick(preset.value)}
                    className={cn(
                      "flex-col h-auto py-3 gap-1 touch-manipulation",
                      isCustom && "col-span-2"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{preset.label}</span>
                    </div>
                    {previewTime && (
                      <span className="text-xs text-muted-foreground">
                        {previewTime}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </>
        ) : (
          /* Custom Date/Time Picker */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Datum & Uhrzeit wählen</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCustomPicker(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Datum</Label>
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  min={format(now, 'yyyy-MM-dd')}
                  className="touch-manipulation"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Uhrzeit</Label>
                <Input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="touch-manipulation"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowCustomPicker(false)}
                className="flex-1 touch-manipulation"
              >
                Zurück
              </Button>
              <Button
                onClick={handleCustomSnooze}
                className="flex-1 touch-manipulation"
              >
                Erinnern um {customTime}
              </Button>
            </div>
          </div>
        )}

        {!showCustomPicker && (
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full text-muted-foreground touch-manipulation"
          >
            Abbrechen
          </Button>
        )}
      </div>
    </BottomSheet>
  );
};
