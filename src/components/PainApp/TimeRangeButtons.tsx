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

  // TEIL A: Single row horizontal scrollable chip bar
  // Works on all screen sizes - scrolls on small screens, fits on large
  return (
    <div className={`overflow-x-auto -mx-1 px-1 ${className}`}>
      <div className="flex gap-2 pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        {presets.map(({ key, label }) => (
          <Button
            key={key}
            variant={value === key ? "default" : "outline"}
            onClick={() => onChange(key)}
            className={`
              shrink-0 whitespace-nowrap touch-manipulation
              ${compact 
                ? "h-8 px-3 text-xs" 
                : "h-11 px-4 text-sm min-w-[80px]"
              }
            `}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
