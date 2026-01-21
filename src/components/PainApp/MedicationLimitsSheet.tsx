import React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MedicationLimitsSettings } from "./MedicationLimitsSettings";

interface MedicationLimitsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToMedications?: () => void;
}

/**
 * Bottom sheet containing the full MedicationLimitsSettings component.
 * Opens from the compact card for 1-tap access to manage limits.
 */
export function MedicationLimitsSheet({ 
  open, 
  onOpenChange,
  onNavigateToMedications 
}: MedicationLimitsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-[85vh] overflow-hidden flex flex-col"
      >
        <SheetHeader className="shrink-0 pb-4 border-b">
          <SheetTitle className="text-xl">Einnahme-Limits</SheetTitle>
          <SheetDescription>
            Verwalte deine individuellen Limits, um Medikamenten-Übergebrauch zu vermeiden.
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6">
          <MedicationLimitsSettings onNavigateToMedications={onNavigateToMedications} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
