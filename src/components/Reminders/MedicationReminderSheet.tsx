import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Bell, BellOff, Clock, Plus, Pencil, Trash2, Calendar, X } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { useCreateReminder, useUpdateReminder, useDeleteReminder } from "@/features/reminders/hooks/useReminders";
import type { Reminder, ReminderRepeat } from "@/types/reminder.types";
import type { Med } from "@/features/meds/hooks/useMeds";
import type { MedicationReminderStatus } from "@/features/reminders/hooks/useMedicationReminders";
import { cn } from "@/lib/utils";

interface MedicationReminderSheetProps {
  isOpen: boolean;
  onClose: () => void;
  medication: Med | null;
  reminderStatus?: MedicationReminderStatus;
}

export const MedicationReminderSheet: React.FC<MedicationReminderSheetProps> = ({
  isOpen,
  onClose,
  medication,
  reminderStatus,
}) => {
  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTime, setNewTime] = useState("12:00");
  const [newRepeat, setNewRepeat] = useState<ReminderRepeat>("daily");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<Reminder | null>(null);
  
  // Defensive destructuring with fallbacks to prevent crash if reminderStatus is undefined
  const { 
    isActive = false, 
    reminders = [], 
    nextTriggerDate = null, 
    isIntervalMed = false, 
    reminderCount = 0 
  } = reminderStatus ?? {};

  // Early return if no medication (prevents rendering with null data)
  if (!medication) {
    return null;
  }

  // Generate time options (every 30 minutes)
  const timeOptions: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = h.toString().padStart(2, '0');
      const minute = m.toString().padStart(2, '0');
      timeOptions.push(`${hour}:${minute}`);
    }
  }

  const handleCreateReminder = async () => {
    setIsSubmitting(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const dateTime = `${today}T${newTime}:00`;
      
      await createReminder.mutateAsync({
        type: 'medication',
        title: `${medication.name} einnehmen`,
        date_time: dateTime,
        repeat: newRepeat,
        notification_enabled: true,
        medications: [medication.name],
      });
      
      setShowCreateForm(false);
      setNewTime("12:00");
      setNewRepeat("daily");
      toast.success("Erinnerung erstellt");
    } catch (error) {
      console.error("Error creating reminder:", error);
      toast.error("Fehler beim Erstellen der Erinnerung");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleReminder = async (reminder: Reminder) => {
    try {
      await updateReminder.mutateAsync({
        id: reminder.id,
        input: { notification_enabled: !reminder.notification_enabled },
      });
    } catch (error) {
      console.error("Error toggling reminder:", error);
    }
  };

  const handleDeleteReminder = async () => {
    if (!reminderToDelete) return;
    
    try {
      await deleteReminder.mutateAsync(reminderToDelete.id);
      setReminderToDelete(null);
      toast.success("Erinnerung gelöscht");
    } catch (error) {
      console.error("Error deleting reminder:", error);
      toast.error("Fehler beim Löschen");
    }
  };

  const formatReminderDateTime = (reminder: Reminder) => {
    const date = new Date(reminder.date_time);
    const time = format(date, "HH:mm", { locale: de });
    
    if (reminder.repeat === 'daily') {
      return `Täglich um ${time} Uhr`;
    } else if (reminder.repeat === 'weekly') {
      const weekday = format(date, "EEEE", { locale: de });
      return `Wöchentlich ${weekday}s, ${time} Uhr`;
    } else if (reminder.repeat === 'monthly') {
      const day = format(date, "d.", { locale: de });
      return `Monatlich am ${day}, ${time} Uhr`;
    }
    return `Einmalig: ${format(date, "dd.MM.yyyy, HH:mm", { locale: de })} Uhr`;
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl">
          <SheetHeader className="text-left pb-4">
            <div className="flex items-center gap-2">
              <Bell className={cn(
                "h-5 w-5",
                isActive ? "text-primary" : "text-muted-foreground"
              )} />
              <SheetTitle className="text-lg">
                Erinnerung für {medication.name}
              </SheetTitle>
            </div>
            <SheetDescription>
              {isActive ? (
                <span className="text-primary font-medium">
                  {reminderCount} aktive Erinnerung{reminderCount !== 1 ? 'en' : ''}
                  {nextTriggerDate && isIntervalMed && (
                    <> · nächste: {format(nextTriggerDate, "dd.MM.yyyy", { locale: de })}</>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">Keine Erinnerung eingerichtet</span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 pb-6">
            {/* Existing Reminders */}
            {reminders.length > 0 && (
              <div className="space-y-2">
                {reminders.map((reminder) => (
                  <Card key={reminder.id} className="border-border/50">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate">
                              {formatReminderDateTime(reminder)}
                            </span>
                          </div>
                          {reminder.notes && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">{reminder.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleToggleReminder(reminder)}
                            title={reminder.notification_enabled ? "Deaktivieren" : "Aktivieren"}
                          >
                            {reminder.notification_enabled ? (
                              <Bell className="h-4 w-4 text-primary" />
                            ) : (
                              <BellOff className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setReminderToDelete(reminder)}
                            title="Löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Create New Reminder Form */}
            {showCreateForm ? (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Neue Erinnerung</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowCreateForm(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Uhrzeit</Label>
                      <Select value={newTime} onValueChange={setNewTime}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {timeOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option} Uhr
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Wiederholung</Label>
                      <Select value={newRepeat} onValueChange={(v) => setNewRepeat(v as ReminderRepeat)}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Einmalig</SelectItem>
                          <SelectItem value="daily">Täglich</SelectItem>
                          <SelectItem value="weekly">Wöchentlich</SelectItem>
                          <SelectItem value="monthly">Monatlich</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1"
                      onClick={handleCreateReminder}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Speichert..." : "Erinnerung erstellen"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Erinnerung einrichten
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!reminderToDelete} onOpenChange={() => setReminderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erinnerung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Erinnerung für {medication.name} wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteReminder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
