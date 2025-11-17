import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";
import { Trash2, Plus, Pill } from "lucide-react";
import { MedicationLimitsSettings } from "../MedicationLimitsSettings";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export const SettingsMedications = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [newMedName, setNewMedName] = useState("");
  
  const { data: medications = [], isLoading: medsLoading } = useMeds();
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();

  const handleAddMedication = async () => {
    if (!newMedName.trim()) return;
    try {
      await addMed.mutateAsync(newMedName.trim());
      setNewMedName("");
      toast({
        title: "✅ Medikament hinzugefügt",
        description: `${newMedName} wurde zur Liste hinzugefügt`,
      });
    } catch (error: any) {
      toast({
        title: "Fehler beim Hinzufügen",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteMedication = async (medName: string) => {
    try {
      await deleteMed.mutateAsync(medName);
      toast({
        title: "✅ Medikament entfernt",
        description: `${medName} wurde aus der Liste entfernt`,
      });
    } catch (error: any) {
      toast({
        title: "Fehler beim Entfernen",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (medsLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Medication Management */}
      <Card className={cn("p-6", isMobile && "p-4")}>
        <h2 className={cn("text-lg font-medium mb-4 flex items-center gap-2", isMobile && "text-base")}>
          <Pill className="h-5 w-5" />
          Medikamente verwalten
        </h2>
        <p className={cn("text-sm text-muted-foreground mb-4", isMobile && "text-xs")}>
          Verwalten Sie Ihre Medikamentenliste für schnelle Eingabe und Analyse.
        </p>
        
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Medikamentenname eingeben..."
              value={newMedName}
              onChange={(e) => setNewMedName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMedication()}
            />
            <Button
              onClick={handleAddMedication}
              disabled={!newMedName.trim() || addMed.isPending}
              size={isMobile ? "sm" : "default"}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-2">
            {medications.map((med) => (
              <div
                key={med.id}
                className={cn(
                  "flex items-center justify-between p-3 bg-secondary/20 rounded-lg",
                  isMobile && "p-2"
                )}
              >
                <span className={cn("font-medium", isMobile && "text-sm")}>{med.name}</span>
                <Button
                  variant="ghost"
                  size={isMobile ? "sm" : "icon"}
                  onClick={() => handleDeleteMedication(med.name)}
                  disabled={deleteMed.isPending}
                  className="hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            
            {medications.length === 0 && (
              <p className={cn("text-center text-muted-foreground py-4", isMobile && "text-sm")}>
                Noch keine Medikamente hinzugefügt
              </p>
            )}
          </div>
        </div>
      </Card>

      <Separator />

      {/* Medication Limits */}
      <MedicationLimitsSettings />
    </div>
  );
};
