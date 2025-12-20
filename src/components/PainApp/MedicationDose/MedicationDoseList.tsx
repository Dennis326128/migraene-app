/**
 * MedicationDoseList
 * Complete medication selection list with dose chips
 * Handles "Keine Medikamente" logic and multi-select
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { MedicationWithDose, useMedicationDoseStates } from "./MedicationWithDose";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_DOSE_QUARTERS } from "@/lib/utils/doseFormatter";

interface Medication {
  id: string;
  name: string;
}

interface MedicationDoseListProps {
  medications: Medication[];
  selectedMedications: Map<string, { doseQuarters: number; medicationId?: string }>;
  onSelectionChange: (
    medications: Map<string, { doseQuarters: number; medicationId?: string }>
  ) => void;
  disabled?: boolean;
  recentMedications?: Array<{ id: string; name: string; use_count: number }>;
  showRecent?: boolean;
  className?: string;
}

export const MedicationDoseList: React.FC<MedicationDoseListProps> = ({
  medications,
  selectedMedications,
  onSelectionChange,
  disabled = false,
  recentMedications = [],
  showRecent = true,
  className,
}) => {
  const [showAllMedications, setShowAllMedications] = useState(false);

  const handleMedicationToggle = (med: Medication) => {
    const newMap = new Map(selectedMedications);
    
    if (newMap.has(med.name)) {
      // Deselect
      newMap.delete(med.name);
    } else {
      // Select with default dose
      newMap.set(med.name, {
        doseQuarters: DEFAULT_DOSE_QUARTERS,
        medicationId: med.id,
      });
    }
    
    onSelectionChange(newMap);
  };

  const handleDoseChange = (medName: string, doseQuarters: number) => {
    const newMap = new Map(selectedMedications);
    const existing = newMap.get(medName);
    if (existing) {
      newMap.set(medName, { ...existing, doseQuarters });
      onSelectionChange(newMap);
    }
  };

  // Separate recent from other medications
  const recentIds = new Set(recentMedications.map((m) => m.id));
  const otherMedications = medications.filter((m) => !recentIds.has(m.id));

  return (
    <div className={cn("space-y-3", className)}>
      {/* Recent Medications */}
      {showRecent && recentMedications.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium px-1">
            Zuletzt verwendet
          </div>
          <div className="space-y-1.5">
            {recentMedications.map((med) => (
              <MedicationWithDose
                key={med.id}
                medication={med}
                selected={selectedMedications.has(med.name)}
                doseQuarters={
                  selectedMedications.get(med.name)?.doseQuarters ?? DEFAULT_DOSE_QUARTERS
                }
                onToggle={() => handleMedicationToggle(med)}
                onDoseChange={(dose) => handleDoseChange(med.name, dose)}
                disabled={disabled}
                showUsageCount={med.use_count}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Other Medications */}
      {otherMedications.length > 0 && (
        <div className="space-y-2">
          {showRecent && recentMedications.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAllMedications(!showAllMedications)}
              className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
            >
              <span>Alle Medikamente ({otherMedications.length})</span>
              <span>{showAllMedications ? "▲" : "▼"}</span>
            </Button>
          )}

          {(showAllMedications || !showRecent || recentMedications.length === 0) && (
            <div className="space-y-1.5">
              {otherMedications.map((med) => (
                <MedicationWithDose
                  key={med.id}
                  medication={med}
                  selected={selectedMedications.has(med.name)}
                  doseQuarters={
                    selectedMedications.get(med.name)?.doseQuarters ?? DEFAULT_DOSE_QUARTERS
                  }
                  onToggle={() => handleMedicationToggle(med)}
                  onDoseChange={(dose) => handleDoseChange(med.name, dose)}
                  disabled={disabled}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Re-export the hook
export { useMedicationDoseStates };
