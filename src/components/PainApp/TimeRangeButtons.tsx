import React from "react";
import { Button } from "@/components/ui/button";

export type TimeRangePreset = "3m" | "6m" | "12m" | "custom";

interface TimeRangeButtonsProps {
  value: TimeRangePreset;
  onChange: (value: TimeRangePreset) => void;
  className?: string;
}

export function TimeRangeButtons({ value, onChange, className = "" }: TimeRangeButtonsProps) {
  const presets: { key: TimeRangePreset; label: string }[] = [
    { key: "3m", label: "3 Monate" },
    { key: "6m", label: "6 Monate" },
    { key: "12m", label: "12 Monate" },
    { key: "custom", label: "Benutzerdefiniert" }
  ];

  return (
    <div className={`grid grid-cols-4 gap-2 ${className}`}>
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
