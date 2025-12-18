import React from "react";
import { Button } from "@/components/ui/button";

export type TimeRangePreset = "1m" | "3m" | "6m" | "12m" | "all" | "custom";

interface TimeRangeButtonsProps {
  value: TimeRangePreset;
  onChange: (value: TimeRangePreset) => void;
  className?: string;
  /** Compact mode for PDF export page */
  compact?: boolean;
}

export function TimeRangeButtons({ value, onChange, className = "", compact = false }: TimeRangeButtonsProps) {
  const presets: { key: TimeRangePreset; label: string }[] = [
    { key: "1m", label: "1 Monat" },
    { key: "3m", label: "3 Monate" },
    { key: "6m", label: "6 Monate" },
    { key: "12m", label: "12 Monate" },
    { key: "all", label: "Alle" },
    { key: "custom", label: "Benutzerdefiniert" }
  ];

  if (compact) {
    // Compact horizontal scroll layout for PDF export
    return (
      <div className={`overflow-x-auto -mx-1 px-1 ${className}`}>
        <div className="flex gap-1.5 whitespace-nowrap pb-1">
          {presets.map(({ key, label }) => (
            <Button
              key={key}
              variant={value === key ? "default" : "outline"}
              onClick={() => onChange(key)}
              className="h-8 px-3 text-xs shrink-0"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Default grid layout
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 ${className}`}>
      {presets.map(({ key, label }) => (
        <Button
          key={key}
          variant={value === key ? "default" : "outline"}
          onClick={() => onChange(key)}
          className="text-xs sm:text-sm"
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
