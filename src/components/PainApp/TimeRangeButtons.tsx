import React from "react";
import { Button } from "@/components/ui/button";
import { getAvailablePresets } from "@/lib/dateRange/rangeResolver";

export type TimeRangePreset = "1m" | "3m" | "6m" | "12m" | "all" | "custom";

interface TimeRangeButtonsProps {
  value: TimeRangePreset;
  onChange: (value: TimeRangePreset) => void;
  className?: string;
  /** Compact mode for PDF export page */
  compact?: boolean;
  /** Documentation span in days — controls which presets are shown.
   *  If omitted, all presets are shown (backwards compatible). */
  documentationSpanDays?: number;
}

/** Static fallback when documentationSpanDays is not provided */
const ALL_PRESETS: { key: TimeRangePreset; label: string }[] = [
  { key: "all", label: "Seit Beginn" },
  { key: "1m", label: "1 Monat" },
  { key: "3m", label: "3 Monate" },
  { key: "6m", label: "6 Monate" },
  { key: "12m", label: "12 Monate" },
  { key: "custom", label: "Benutzerdefiniert" },
];

export function TimeRangeButtons({
  value,
  onChange,
  className = "",
  compact = false,
  documentationSpanDays,
}: TimeRangeButtonsProps) {
  const presets =
    documentationSpanDays !== undefined
      ? getAvailablePresets(documentationSpanDays)
      : ALL_PRESETS;

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
