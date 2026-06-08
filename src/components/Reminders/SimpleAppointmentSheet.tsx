import React, { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useCreateReminder } from "@/features/reminders/hooks/useReminders";
import { useDoctors } from "@/features/account/hooks/useAccount";
import type { ReminderRepeat } from "@/types/reminder.types";
import { cn } from "@/lib/utils";

interface SimpleAppointmentSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const REPEAT_CHIPS: { value: ReminderRepeat; label: string }[] = [
  { value: "none", label: "Einmalig" },
  { value: "weekly", label: "Wöchentlich" },
  { value: "monthly", label: "Monatlich" },
];

/**
 * Minimal-Sheet zum schnellen Anlegen eines Termin-Reminders.
 * Bewusst ohne Follow-up / Voice / Snooze — für den Quick-Add auf der Erinnerungen-Seite.
 */
export const SimpleAppointmentSheet: React.FC<SimpleAppointmentSheetProps> = ({
  isOpen,
  onClose,
}) => {
  const createReminder = useCreateReminder();
  const { data: doctors = [] } = useDoctors();

  const todayStr = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr);
  const [time, setTime] = useState("09:00");
  const [repeat, setRepeat] = useState<ReminderRepeat>("none");
  const [doctorId, setDoctorId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset bei jedem Öffnen
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDate(todayStr);
      setTime("09:00");
      setRepeat("none");
      setDoctorId("");
    }
  }, [isOpen, todayStr]);

  const activeDoctors = doctors.filter((d) => d.is_active !== false);

  const formatDoctorLabel = (d: typeof doctors[number]) => {
    const name = [d.title, d.first_name, d.last_name].filter(Boolean).join(" ").trim();
    return name || d.specialty || "Arzt/Praxis";
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Bitte einen Titel angeben");
      return;
    }
    setSubmitting(true);
    try {
      await createReminder.mutateAsync({
        type: "appointment",
        title: title.trim(),
        date_time: `${date}T${time}:00`,
        repeat,
        notification_enabled: true,
        ...(doctorId ? { doctor_id: doctorId } : {}),
      });
      onClose();
    } catch (e) {
      console.error("Failed to create appointment reminder", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl">
        <SheetHeader className="text-left pb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <SheetTitle className="text-lg">Neuer Termin</SheetTitle>
          </div>
          <SheetDescription>
            Termin schnell anlegen — Erinnerung ist standardmäßig aktiv.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="appt-title" className="text-xs text-muted-foreground">
              Titel
            </Label>
            <Input
              id="appt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Kontrolltermin Neurologie"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Datum</Label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={todayStr}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Uhrzeit</Label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Wiederholung</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {REPEAT_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setRepeat(chip.value)}
                  className={cn(
                    "h-10 rounded-md border text-xs font-medium transition-colors touch-manipulation",
                    repeat === chip.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-foreground hover:bg-muted"
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {activeDoctors.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Arzt/Praxis (optional)</Label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Kein/e —</option>
                {activeDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatDoctorLabel(d)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="ghost" className="flex-1 h-11" onClick={onClose} disabled={submitting}>
              Abbrechen
            </Button>
            <Button className="flex-1 h-11" onClick={handleSubmit} disabled={submitting || !title.trim()}>
              {submitting ? "Speichert..." : "Termin speichern"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
