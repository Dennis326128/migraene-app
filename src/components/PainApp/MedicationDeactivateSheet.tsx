/**
 * MedicationDeactivateSheet
 * Simple bottom sheet for ending medication intake
 * - End date (default: today, editable)
 * - Optional stop reason (dropdown, not required)
 */

import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { Med } from "@/features/meds/hooks/useMeds";

const STOP_REASONS = [
  { value: "keine_wirkung", label: "Keine Wirkung" },
  { value: "nebenwirkungen", label: "Nebenwirkungen" },
  { value: "therapie_gewechselt", label: "Therapie gewechselt" },
  { value: "sonstiges", label: "Sonstiges" },
] as const;

interface MedicationDeactivateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medication: Med | null;
  onConfirm: (endDate: string, stopReason: string | null) => void;
  isLoading?: boolean;
}

export const MedicationDeactivateSheet = ({
  open,
  onOpenChange,
  medication,
  onConfirm,
  isLoading = false,
}: MedicationDeactivateSheetProps) => {
  const today = new Date();
  const [endDate, setEndDate] = useState<Date>(today);
  const [stopReason, setStopReason] = useState<string | null>(null);

  const handleConfirm = () => {
    const dateStr = format(endDate, "yyyy-MM-dd");
    onConfirm(dateStr, stopReason);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state on close
      setEndDate(today);
      setStopReason(null);
    }
    onOpenChange(newOpen);
  };

  if (!medication) return null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[50vh] rounded-t-2xl">
        <SheetHeader className="text-left pb-4">
          <SheetTitle className="text-lg">Einnahme beenden</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {medication.name}
          </p>
        </SheetHeader>

        <div className="space-y-4 py-2">
          {/* End Date */}
          <div className="space-y-2">
            <Label>Enddatum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd.MM.yyyy", { locale: de }) : "Datum wählen"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => date && setEndDate(date)}
                  initialFocus
                  locale={de}
                  disabled={(date) => date > today}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Stop Reason (optional) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Absetzgrund
              <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Select
              value={stopReason || ""}
              onValueChange={(v) => setStopReason(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Grund auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {STOP_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {stopReason && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={() => setStopReason(null)}
              >
                <X className="h-3 w-3 mr-1" />
                Auswahl löschen
              </Button>
            )}
          </div>
        </div>

        <SheetFooter className="pt-4 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Wird gespeichert..." : "Beenden"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
