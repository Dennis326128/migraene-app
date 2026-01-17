import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type Doctor = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  specialty?: string | null;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
};

interface DoctorSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  doctors: Doctor[];
  onConfirm: (selectedDoctors: Doctor[]) => void;
  title?: string;
  description?: string;
  preSelectedIds?: string[];
}

export const DoctorSelectionDialog: React.FC<DoctorSelectionDialogProps> = ({
  open,
  onClose,
  doctors,
  onConfirm,
  title = "Arzt auswählen",
  preSelectedIds,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pre-select doctors when dialog opens - use preSelectedIds if provided, otherwise all
  useEffect(() => {
    if (open) {
      if (preSelectedIds && preSelectedIds.length > 0) {
        const validIds = preSelectedIds.filter(id => 
          doctors.some(d => d.id === id)
        );
        setSelectedIds(new Set(validIds.length > 0 ? validIds : doctors.map(d => d.id || `doctor-${doctors.indexOf(d)}`)));
      } else {
        setSelectedIds(new Set(doctors.map(d => d.id || `doctor-${doctors.indexOf(d)}`)));
      }
    }
  }, [open, doctors, preSelectedIds]);

  const getDoctorKey = (doctor: Doctor, index: number) => doctor.id || `doctor-${index}`;

  const handleToggle = (key: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const handleConfirm = () => {
    const selectedDoctors = doctors.filter((d, i) => selectedIds.has(getDoctorKey(d, i)));
    onConfirm(selectedDoctors);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(doctors.map((d, i) => getDoctorKey(d, i))));
  };

  const handleSelectNone = () => {
    setSelectedIds(new Set());
  };

  const formatDoctorName = (doctor: Doctor): string => {
    const parts = [doctor.title, doctor.first_name, doctor.last_name].filter(Boolean);
    return parts.join(" ") || "Unbekannt";
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-semibold">
            {title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Dieser Arzt erscheint im PDF.
          </p>
        </DialogHeader>

        <div className="px-6 pb-4">
          {/* Subtle quick actions */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={handleSelectAll}
                className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                Alle
              </button>
              <span className="text-border">·</span>
              <button
                type="button"
                onClick={handleSelectNone}
                className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                Keine
              </button>
            </div>
            {doctors.length > 1 && (
              <span className="text-xs text-muted-foreground/70">
                {selectedIds.size}/{doctors.length}
              </span>
            )}
          </div>

          {/* Doctor selection cards */}
          <div className="space-y-2 max-h-[280px] overflow-y-auto modern-scrollbar -mx-1 px-1">
            {doctors.map((doctor, index) => {
              const key = getDoctorKey(doctor, index);
              const isSelected = selectedIds.has(key);
              
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleToggle(key)}
                  className={cn(
                    "w-full text-left p-4 rounded-xl transition-all duration-200",
                    "border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border/50 bg-secondary/20 hover:bg-secondary/40 hover:border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">
                        {formatDoctorName(doctor)}
                      </p>
                      {doctor.specialty && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {doctor.specialty}
                        </p>
                      )}
                      {doctor.city && (
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {doctor.city}
                        </p>
                      )}
                    </div>
                    
                    {/* Selection indicator */}
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-200",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/50 text-transparent"
                      )}
                    >
                      <Check className="w-4 h-4" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Status text - only show when none selected */}
          {selectedIds.size === 0 && (
            <p className="text-xs text-muted-foreground/70 mt-3 text-center">
              PDF wird ohne Arztdaten erstellt
            </p>
          )}
        </div>

        <DialogFooter className="px-6 py-4 bg-secondary/20 border-t border-border/50">
          <div className="flex gap-3 w-full sm:w-auto">
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="flex-1 sm:flex-none"
            >
              Abbrechen
            </Button>
            <Button 
              onClick={handleConfirm}
              className="flex-1 sm:flex-none min-w-[120px]"
            >
              PDF erstellen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
