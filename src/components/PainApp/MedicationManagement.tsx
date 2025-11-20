import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";
import { useReminders, useCreateReminder } from "@/features/reminders/hooks/useReminders";
import { Pill, Plus, Pencil, Trash2, Bell, ArrowLeft, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { MedicationReminderModal } from "@/components/Reminders/MedicationReminderModal";
import { format, addMinutes } from "date-fns";
import type { ReminderRepeat } from "@/types/reminder.types";

interface MedicationManagementProps {
  onBack: () => void;
  onNavigateToLimits?: () => void;
}

export const MedicationManagement: React.FC<MedicationManagementProps> = ({ onBack, onNavigateToLimits }) => {
  const { data: medications, isLoading } = useMeds();
  const { data: reminders } = useReminders();
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();
  const createReminder = useCreateReminder();
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  
  const [selectedMedication, setSelectedMedication] = useState<any>(null);
  const [medicationName, setMedicationName] = useState("");

  // Get reminders count for a medication
  const getMedicationRemindersCount = (medName: string) => {
    return reminders?.filter(r => 
      r.type === 'medication' && 
      r.medications?.includes(medName) &&
      r.status === 'pending'
    ).length || 0;
  };

  const handleAddMedication = async () => {
    const trimmedName = medicationName.trim();
    
    if (!trimmedName) {
      toast.error("Bitte geben Sie einen Medikamentennamen ein");
      return;
    }

    // Validate medication name
    if (trimmedName.length > 100) {
      toast.error("Medikamentenname darf maximal 100 Zeichen lang sein");
      return;
    }

    if (!/^[a-zA-ZäöüÄÖÜß0-9\s\-/().]+$/.test(trimmedName)) {
      toast.error("Medikamentenname enthält ungültige Zeichen. Nur Buchstaben, Zahlen und -/() sind erlaubt.");
      return;
    }

    try {
      await addMed.mutateAsync(trimmedName);
      toast.success("Medikament hinzugefügt");
      setMedicationName("");
      setShowAddDialog(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[MedicationManagement] Add medication error:', error);
      }
      toast.error("Fehler beim Hinzufügen des Medikaments. Bitte versuchen Sie es erneut.");
    }
  };

  const handleEditMedication = async () => {
    const trimmedName = medicationName.trim();
    
    if (!trimmedName || !selectedMedication) {
      toast.error("Bitte geben Sie einen Medikamentennamen ein");
      return;
    }

    // Validate medication name
    if (trimmedName.length > 100) {
      toast.error("Medikamentenname darf maximal 100 Zeichen lang sein");
      return;
    }

    if (!/^[a-zA-ZäöüÄÖÜß0-9\s\-/().]+$/.test(trimmedName)) {
      toast.error("Medikamentenname enthält ungültige Zeichen. Nur Buchstaben, Zahlen und -/() sind erlaubt.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sie sind nicht angemeldet.");
        return;
      }
      
      const { error } = await supabase
        .from("user_medications")
        .update({ name: trimmedName })
        .eq("id", selectedMedication.id)
        .eq("user_id", user.id);
      
      if (error) throw error;
      
      toast.success("Medikament aktualisiert");
      setMedicationName("");
      setSelectedMedication(null);
      setShowEditDialog(false);
      
      // Invalidate query to refresh list
      await addMed.mutateAsync(""); // Trigger refetch
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[MedicationManagement] Edit medication error:', error);
      }
      toast.error("Fehler beim Aktualisieren des Medikaments. Bitte versuchen Sie es erneut.");
    }
  };

  const handleDeleteMedication = async () => {
    if (!selectedMedication) return;

    try {
      await deleteMed.mutateAsync(selectedMedication.name);
      toast.success("Medikament gelöscht");
      setSelectedMedication(null);
      setShowDeleteDialog(false);
    } catch (error) {
      toast.error("Fehler beim Löschen des Medikaments");
    }
  };

  const openEditDialog = (med: any) => {
    setSelectedMedication(med);
    setMedicationName(med.name);
    setShowEditDialog(true);
  };

  const openDeleteDialog = (med: any) => {
    setSelectedMedication(med);
    setShowDeleteDialog(true);
  };

  const openReminderDialog = (med: any) => {
    setSelectedMedication(med);
    setShowReminderModal(true);
  };

  const handleCreateReminders = async (reminders: {
    time: string;
    repeat: ReminderRepeat;
    notification_enabled: boolean;
  }[]) => {
    if (!selectedMedication) return;

    try {
      // Create reminders for each time slot
      for (const reminderData of reminders) {
        const today = format(new Date(), 'yyyy-MM-dd');
        const dateTime = `${today}T${reminderData.time}:00`;
        
        await createReminder.mutateAsync({
          type: 'medication',
          title: selectedMedication.name,
          date_time: dateTime,
          repeat: reminderData.repeat,
          notification_enabled: reminderData.notification_enabled,
          medications: [selectedMedication.name],
        });
      }

      const count = reminders.length;
      toast.success(`${count} Erinnerung${count > 1 ? 'en' : ''} erstellt`);
    } catch (error) {
      toast.error("Fehler beim Erstellen der Erinnerungen");
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Medikamente verwalten</h1>
          <p className="text-sm text-muted-foreground">Ihre Medikamente und Erinnerungen</p>
        </div>
      </div>

      {/* Cross-Link to Limits */}
      {onNavigateToLimits && (
        <Card 
          className="border-primary/20 bg-primary/5 cursor-pointer hover:bg-primary/10 hover:border-primary/30 transition-all"
          onClick={onNavigateToLimits}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-lg font-semibold">Medikamenten-Übergebrauch vermeiden</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Setze Limits und überwache deine Einnahme
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Button */}
      <Button 
        onClick={() => setShowAddDialog(true)}
        className="w-full"
        size="lg"
      >
        <Plus className="h-5 w-5 mr-2" />
        Neues Medikament hinzufügen
      </Button>

      {/* Medications List */}
      <div className="space-y-3">
        {medications && medications.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <Pill className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Noch keine Medikamente hinzugefügt</p>
              <p className="text-sm mt-1">Fügen Sie Ihr erstes Medikament hinzu</p>
            </CardContent>
          </Card>
        ) : (
          medications?.map((med) => {
            const reminderCount = getMedicationRemindersCount(med.name);
            
            return (
              <Card key={med.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Pill className="h-4 w-4 text-primary shrink-0" />
                        <h3 className="font-semibold text-base line-clamp-2 break-words">{med.name}</h3>
                      </div>
                      {reminderCount > 0 && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{reminderCount} aktive Erinnerung{reminderCount !== 1 ? 'en' : ''}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openReminderDialog(med)}
                        title="Erinnerungen verwalten"
                        className="h-10 w-10"
                      >
                        <Bell className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(med)}
                        title="Bearbeiten"
                        className="h-10 w-10"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(med)}
                        title="Löschen"
                        className="h-10 w-10"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Medikament hinzufügen</DialogTitle>
            <DialogDescription>
              Geben Sie den Namen des Medikaments ein
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="med-name">Medikamentenname</Label>
              <Input
                id="med-name"
                placeholder="z.B. Ibuprofen 400mg"
                value={medicationName}
                onChange={(e) => setMedicationName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMedication()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false);
              setMedicationName("");
            }}>
              Abbrechen
            </Button>
            <Button onClick={handleAddMedication} disabled={!medicationName.trim()}>
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Medikament bearbeiten</DialogTitle>
            <DialogDescription>
              Ändern Sie den Namen des Medikaments
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-med-name">Medikamentenname</Label>
              <Input
                id="edit-med-name"
                placeholder="z.B. Ibuprofen 400mg"
                value={medicationName}
                onChange={(e) => setMedicationName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEditMedication()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false);
              setMedicationName("");
              setSelectedMedication(null);
            }}>
              Abbrechen
            </Button>
            <Button onClick={handleEditMedication} disabled={!medicationName.trim()}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Medikament löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie "{selectedMedication?.name}" wirklich löschen? 
              Diese Aktion kann nicht rückgängig gemacht werden.
              {getMedicationRemindersCount(selectedMedication?.name || '') > 0 && (
                <span className="block mt-2 text-warning font-medium">
                  ⚠️ Es gibt noch aktive Erinnerungen für dieses Medikament.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedMedication(null)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMedication}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Medication Reminder Modal */}
      {selectedMedication && (
        <MedicationReminderModal
          isOpen={showReminderModal}
          onClose={() => {
            setShowReminderModal(false);
            setSelectedMedication(null);
          }}
          medicationName={selectedMedication.name}
          existingReminders={reminders?.filter(r => 
            r.type === 'medication' && 
            r.medications?.includes(selectedMedication.name)
          )}
          onSubmit={handleCreateReminders}
        />
      )}
    </div>
  );
};
