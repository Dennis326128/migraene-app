/**
 * ReminderTimePresets
 * 
 * Simple multi-select preset buttons for medication reminder times.
 * Morgens/Mittags/Abends/Nachts with configurable times.
 * 
 * Design: Minimal decisions, sensible defaults, "einmal einstellen, dann läuft's"
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Sun, Sunrise, Sunset, Moon } from 'lucide-react';

export interface TimePreset {
  id: 'morning' | 'noon' | 'evening' | 'night';
  label: string;
  time: string;
  icon: React.ReactNode;
}

// Default preset times - could be user-configurable in future
export const DEFAULT_TIME_PRESETS: TimePreset[] = [
  { id: 'morning', label: 'Morgens', time: '08:00', icon: <Sunrise className="h-4 w-4" /> },
  { id: 'noon', label: 'Mittags', time: '12:00', icon: <Sun className="h-4 w-4" /> },
  { id: 'evening', label: 'Abends', time: '18:00', icon: <Sunset className="h-4 w-4" /> },
  { id: 'night', label: 'Nachts', time: '22:00', icon: <Moon className="h-4 w-4" /> },
];

interface ReminderTimePresetsProps {
  /** Selected preset IDs */
  selected: string[];
  /** Callback when selection changes */
  onSelectionChange: (selected: string[]) => void;
  /** Whether to allow multiple selections (default: true) */
  multiSelect?: boolean;
  /** Optional custom presets */
  presets?: TimePreset[];
  /** Compact mode for inline use */
  compact?: boolean;
}

export const ReminderTimePresets: React.FC<ReminderTimePresetsProps> = ({
  selected,
  onSelectionChange,
  multiSelect = true,
  presets = DEFAULT_TIME_PRESETS,
  compact = false,
}) => {
  const handleToggle = (presetId: string) => {
    if (multiSelect) {
      // Toggle in/out of selection
      if (selected.includes(presetId)) {
        onSelectionChange(selected.filter(id => id !== presetId));
      } else {
        onSelectionChange([...selected, presetId]);
      }
    } else {
      // Single select - replace selection
      if (selected.includes(presetId)) {
        onSelectionChange([]);
      } else {
        onSelectionChange([presetId]);
      }
    }
  };

  return (
    <div className={cn(
      "flex flex-wrap gap-2",
      compact && "gap-1.5"
    )}>
      {presets.map((preset) => {
        const isSelected = selected.includes(preset.id);
        
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleToggle(preset.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border transition-all",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              compact 
                ? "px-2.5 py-1 text-xs" 
                : "px-3 py-1.5 text-sm",
              isSelected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            {!compact && preset.icon}
            <span>{preset.label}</span>
            {!compact && (
              <span className={cn(
                "text-xs",
                isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
              )}>
                {preset.time}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Get the times for selected presets
 */
export function getTimesForPresets(
  selectedIds: string[],
  presets: TimePreset[] = DEFAULT_TIME_PRESETS
): string[] {
  return presets
    .filter(p => selectedIds.includes(p.id))
    .map(p => p.time)
    .sort(); // Sort times chronologically
}

/**
 * Format selected presets for display
 */
export function formatSelectedPresets(
  selectedIds: string[],
  presets: TimePreset[] = DEFAULT_TIME_PRESETS
): string {
  if (selectedIds.length === 0) return 'Keine Erinnerung';
  
  const selectedPresets = presets.filter(p => selectedIds.includes(p.id));
  
  if (selectedPresets.length === 1) {
    return `${selectedPresets[0].time} (${selectedPresets[0].label})`;
  }
  
  // Multiple: "08:00, 18:00"
  return selectedPresets.map(p => p.time).sort().join(', ');
}

export default ReminderTimePresets;
