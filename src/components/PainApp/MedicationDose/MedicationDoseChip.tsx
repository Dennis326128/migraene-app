/**
 * MedicationDoseChip
 * Small chip showing medication dose, clickable to open DoseBottomSheet
 */

import React from "react";
import { formatDoseFromQuarters, DEFAULT_DOSE_QUARTERS } from "@/lib/utils/doseFormatter";
import { cn } from "@/lib/utils";

interface MedicationDoseChipProps {
  doseQuarters: number;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export const MedicationDoseChip: React.FC<MedicationDoseChipProps> = ({
  doseQuarters,
  onClick,
  disabled = false,
  className,
  size = "sm",
}) => {
  const displayValue = formatDoseFromQuarters(doseQuarters);
  const isDefault = doseQuarters === DEFAULT_DOSE_QUARTERS;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors",
        "bg-secondary/80 text-secondary-foreground border border-border/50",
        "hover:bg-secondary hover:border-primary/30",
        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1",
        "disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" && "min-w-[2rem] h-7 px-2 text-sm",
        size === "md" && "min-w-[2.5rem] h-8 px-3 text-base",
        !isDefault && "border-primary/40 bg-primary/10",
        className
      )}
      aria-label={`Dosis: ${displayValue} Tabletten`}
    >
      {displayValue}
    </button>
  );
};
