/**
 * DoseBottomSheet
 * Mobile-friendly bottom sheet for selecting medication dose
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  formatDoseFromQuarters,
  DOSE_QUICK_OPTIONS,
  DEFAULT_DOSE_QUARTERS,
  MIN_DOSE_QUARTERS,
  MAX_DOSE_QUARTERS,
} from "@/lib/utils/doseFormatter";

interface DoseBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicationName: string;
  currentDose: number;
  onDoseChange: (doseQuarters: number) => void;
}

export const DoseBottomSheet: React.FC<DoseBottomSheetProps> = ({
  open,
  onOpenChange,
  medicationName,
  currentDose,
  onDoseChange,
}) => {
  const handleQuickSelect = (quarters: number) => {
    onDoseChange(quarters);
  };

  const handleIncrement = () => {
    if (currentDose < MAX_DOSE_QUARTERS) {
      onDoseChange(currentDose + 1);
    }
  };

  const handleDecrement = () => {
    if (currentDose > MIN_DOSE_QUARTERS) {
      onDoseChange(currentDose - 1);
    }
  };

  const handleReset = () => {
    onDoseChange(DEFAULT_DOSE_QUARTERS);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-center pb-2">
          <DrawerTitle className="text-lg">Dosis</DrawerTitle>
          <p className="text-sm text-muted-foreground truncate">{medicationName}</p>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-6">
          {/* Current dose display */}
          <div className="text-center">
            <div className="text-5xl font-bold text-primary">
              {formatDoseFromQuarters(currentDose)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {currentDose === 4 ? "Tablette" : "Tabletten"}
            </div>
          </div>

          {/* Quick select buttons */}
          <div className="grid grid-cols-6 gap-2">
            {DOSE_QUICK_OPTIONS.map((option) => (
              <Button
                key={option.quarters}
                variant={currentDose === option.quarters ? "default" : "outline"}
                size="lg"
                className="h-12 text-lg font-semibold"
                onClick={() => handleQuickSelect(option.quarters)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {/* Stepper for fine-grained control */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={handleDecrement}
              disabled={currentDose <= MIN_DOSE_QUARTERS}
            >
              <Minus className="h-5 w-5" />
            </Button>
            
            <div className="w-24 text-center">
              <span className="text-2xl font-semibold">
                {formatDoseFromQuarters(currentDose)}
              </span>
            </div>
            
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={handleIncrement}
              disabled={currentDose >= MAX_DOSE_QUARTERS}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          {/* Reset button */}
          {currentDose !== DEFAULT_DOSE_QUARTERS && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-muted-foreground"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Auf 1 zurücksetzen
              </Button>
            </div>
          )}
        </div>

        <DrawerFooter className="pt-2">
          <Button onClick={() => onOpenChange(false)} className="w-full">
            Fertig
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
