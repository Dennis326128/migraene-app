import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AccountDeletion } from "@/components/AccountDeletion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MedicationLimitsSettings } from "./MedicationLimitsSettings";
import { Separator } from "@/components/ui/separator";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";
import { Trash2, Plus, Pill, Shield, Settings as SettingsIcon, Cloud } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const SettingsPage = ({ onBack }: { onBack: () => void }) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [newMedName, setNewMedName] = useState("");
  
  // Medication management
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

  if (isLoading || medsLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Lade Einstellungen...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-background to-secondary/20 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={onBack} className="p-2 hover:bg-secondary/80">
          ← Zurück
        </Button>
        <h1 className="text-xl font-semibold">⚙️ Einstellungen</h1>
        <div className="w-16"></div>
      </div>


      {/* Medication Management Section */}
      <Card className="p-6 mb-4">
        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Pill className="h-5 w-5" />
          Medikamente verwalten
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Verwalten Sie Ihre Medikamentenliste für schnelle Eingabe und Analyse.
        </p>
        
        {/* Add new medication */}
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
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Medications list */}
          <div className="space-y-2">
            {medications.map((med) => (
              <div
                key={med.id}
                className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg"
              >
                <span className="font-medium">{med.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteMedication(med.name)}
                  disabled={deleteMed.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {medications.length === 0 && (
              <p className="text-center py-4 text-muted-foreground">
                Noch keine Medikamente hinzugefügt
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Medication Limits Section */}
      <MedicationLimitsSettings />

      {/* Privacy & GDPR Section */}
      <Card className="p-6 mb-4">
        <h2 className="text-lg font-medium mb-4">🛡️ Datenschutz & DSGVO</h2>
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => window.open('/privacy', '_blank')}
            className="w-full justify-start"
          >
            📋 Datenschutzerklärung anzeigen
          </Button>
          <Separator />
          <AccountDeletion />
        </div>
      </Card>

      {/* Weather Backfill Section */}
      <Card className="p-6 mb-4">
        <h2 className="text-lg font-medium mb-4">🌤️ Wetter-Daten Management</h2>
        <Alert>
          <AlertDescription>
            💡 <strong>Tipp:</strong> Nutzen Sie den "🌤️ Wetter nachtragen"-Button in der Einträge-Liste für manuelles Backfill der letzten 30 Tage.
          </AlertDescription>
        </Alert>
      </Card>
    </div>
  );
};

export default SettingsPage;