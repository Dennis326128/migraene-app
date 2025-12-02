import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText, User } from "lucide-react";

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
}

export const DoctorSelectionDialog: React.FC<DoctorSelectionDialogProps> = ({
  open,
  onClose,
  doctors,
  onConfirm,
  title = "Arzt auswählen",
  description = "Wählen Sie die Ärzte aus, deren Daten im PDF erscheinen sollen.",
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pre-select all doctors when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(doctors.map(d => d.id || `doctor-${doctors.indexOf(d)}`)));
    }
  }, [open, doctors]);

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Quick actions */}
          <div className="flex gap-2 text-sm">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="text-xs"
            >
              Alle auswählen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectNone}
              className="text-xs"
            >
              Keine auswählen
            </Button>
          </div>

          {/* Doctor list */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto modern-scrollbar pr-2">
            {doctors.map((doctor, index) => {
              const key = getDoctorKey(doctor, index);
              return (
              <div
                key={key}
                className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                onClick={() => handleToggle(key)}
              >
                <Checkbox
                  id={`doctor-${key}`}
                  checked={selectedIds.has(key)}
                  onCheckedChange={() => handleToggle(key)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={`doctor-${doctor.id}`}
                    className="font-medium text-sm cursor-pointer"
                  >
                    {formatDoctorName(doctor)}
                  </Label>
                  {doctor.specialty && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doctor.specialty}
                    </p>
                  )}
                  {(doctor.street || doctor.city) && (
                    <p className="text-xs text-muted-foreground">
                      {[doctor.street, [doctor.postal_code, doctor.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            {selectedIds.size === 0
              ? "Kein Arzt ausgewählt - das PDF wird ohne Arztdaten erstellt."
              : `${selectedIds.size} von ${doctors.length} Ärzten ausgewählt.`}
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleConfirm}>
            PDF erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
