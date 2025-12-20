/**
 * MedicationWithDose
 * A medication list item with integrated dose selection
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { MedicationDoseChip } from "./MedicationDoseChip";
import { DoseBottomSheet } from "./DoseBottomSheet";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_DOSE_QUARTERS } from "@/lib/utils/doseFormatter";

export interface MedicationDoseState {
  name: string;
  selected: boolean;
  doseQuarters: number;
  medicationId?: string;
}

interface MedicationWithDoseProps {
  medication: {
    id?: string;
    name: string;
  };
  selected: boolean;
  doseQuarters: number;
  onToggle: () => void;
  onDoseChange: (doseQuarters: number) => void;
  disabled?: boolean;
  showUsageCount?: number;
  className?: string;
}

export const MedicationWithDose: React.FC<MedicationWithDoseProps> = ({
  medication,
  selected,
  doseQuarters,
  onToggle,
  onDoseChange,
  disabled = false,
  showUsageCount,
  className,
}) => {
  const [doseSheetOpen, setDoseSheetOpen] = useState(false);

  const handleDoseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDoseSheetOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant={selected ? "secondary" : "outline"}
        className={cn(
          "h-auto min-h-[2.75rem] py-2 px-3 justify-between w-full",
          selected && "ring-1 ring-primary/50",
          className
        )}
        onClick={onToggle}
        disabled={disabled}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selected && (
            <Check className="h-4 w-4 text-primary flex-shrink-0" />
          )}
          <span className="truncate text-left">{medication.name}</span>
          {showUsageCount !== undefined && showUsageCount > 0 && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              ({showUsageCount}×)
            </span>
          )}
        </div>

        {selected && (
          <MedicationDoseChip
            doseQuarters={doseQuarters}
            onClick={handleDoseClick}
            disabled={disabled}
          />
        )}
      </Button>

      <DoseBottomSheet
        open={doseSheetOpen}
        onOpenChange={setDoseSheetOpen}
        medicationName={medication.name}
        currentDose={doseQuarters}
        onDoseChange={onDoseChange}
      />
    </>
  );
};

/**
 * Hook to manage medication dose states
 */
export function useMedicationDoseStates(
  initialMedications?: Array<{ name: string; doseQuarters?: number }>
) {
  const [states, setStates] = useState<Map<string, MedicationDoseState>>(
    () => {
      const map = new Map<string, MedicationDoseState>();
      initialMedications?.forEach((med) => {
        map.set(med.name, {
          name: med.name,
          selected: true,
          doseQuarters: med.doseQuarters ?? DEFAULT_DOSE_QUARTERS,
        });
      });
      return map;
    }
  );

  const toggleMedication = (name: string, medicationId?: string) => {
    setStates((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(name);
      
      if (existing) {
        // Toggle off
        newMap.delete(name);
      } else {
        // Toggle on with default dose
        newMap.set(name, {
          name,
          selected: true,
          doseQuarters: DEFAULT_DOSE_QUARTERS,
          medicationId,
        });
      }
      return newMap;
    });
  };

  const setDose = (name: string, doseQuarters: number) => {
    setStates((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(name);
      if (existing) {
        newMap.set(name, { ...existing, doseQuarters });
      }
      return newMap;
    });
  };

  const isSelected = (name: string) => states.has(name);
  
  const getDose = (name: string) => states.get(name)?.doseQuarters ?? DEFAULT_DOSE_QUARTERS;

  const getSelectedMedications = () => 
    Array.from(states.values()).filter((s) => s.selected);

  const getSelectedNames = () => 
    Array.from(states.values())
      .filter((s) => s.selected)
      .map((s) => s.name);

  const reset = () => setStates(new Map());

  const initializeFromEntry = (
    medications: string[],
    intakes?: Array<{ medication_name: string; dose_quarters: number }>
  ) => {
    const intakeMap = new Map(intakes?.map((i) => [i.medication_name, i.dose_quarters]));
    
    const newMap = new Map<string, MedicationDoseState>();
    medications.forEach((name) => {
      newMap.set(name, {
        name,
        selected: true,
        doseQuarters: intakeMap.get(name) ?? DEFAULT_DOSE_QUARTERS,
      });
    });
    setStates(newMap);
  };

  return {
    states,
    toggleMedication,
    setDose,
    isSelected,
    getDose,
    getSelectedMedications,
    getSelectedNames,
    reset,
    initializeFromEntry,
  };
}
