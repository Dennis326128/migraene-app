import * as React from "react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type Weekday = "Mo" | "Di" | "Mi" | "Do" | "Fr" | "Sa" | "So";

export const WEEKDAYS: readonly Weekday[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

// For reminder compatibility (English keys)
export const WEEKDAY_MAP_EN: Record<Weekday, string> = {
  Mo: "monday",
  Di: "tuesday",
  Mi: "wednesday",
  Do: "thursday",
  Fr: "friday",
  Sa: "saturday",
  So: "sunday",
};

export const WEEKDAY_MAP_DE: Record<string, Weekday> = {
  monday: "Mo",
  tuesday: "Di",
  wednesday: "Mi",
  thursday: "Do",
  friday: "Fr",
  saturday: "Sa",
  sunday: "So",
};

interface WeekdayPickerProps {
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
}

/**
 * Reusable WeekdayPicker component for medications and reminders.
 * Multi-select chips for Mo-So.
 */
export const WeekdayPicker = ({ 
  value, 
  onChange, 
  disabled = false, 
  className,
  size = "default"
}: WeekdayPickerProps) => {
  const handleValueChange = (newValue: string[]) => {
    onChange(newValue as Weekday[]);
  };

  return (
    <ToggleGroup
      type="multiple"
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled}
      className={cn("flex flex-wrap gap-1", className)}
    >
      {WEEKDAYS.map((day) => (
        <ToggleGroupItem
          key={day}
          value={day}
          aria-label={day}
          className={cn(
            "rounded-full font-medium transition-colors",
            size === "sm" 
              ? "h-8 w-8 text-xs" 
              : "h-10 w-10 text-sm",
            value.includes(day)
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted/50 hover:bg-muted"
          )}
        >
          {day}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};

/**
 * Format weekdays for display
 */
export const formatWeekdays = (days: Weekday[]): string => {
  if (!days || days.length === 0) return "";
  if (days.length === 7) return "Täglich";
  if (days.length === 5 && !days.includes("Sa") && !days.includes("So")) {
    return "Mo–Fr";
  }
  return days.join(", ");
};

/**
 * Convert German weekdays to English for DB storage (reminders)
 */
export const weekdaysToEnglish = (days: Weekday[]): string[] => {
  return days.map(d => WEEKDAY_MAP_EN[d]);
};

/**
 * Convert English weekdays from DB to German for UI
 */
export const weekdaysToGerman = (days: string[]): Weekday[] => {
  return days.map(d => WEEKDAY_MAP_DE[d]).filter(Boolean);
};
