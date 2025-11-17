import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUserSettings } from "@/features/settings/hooks/useUserSettings";
import { AccountDeletion } from "@/components/AccountDeletion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MedicationLimitsSettings } from "./MedicationLimitsSettings";
import { Separator } from "@/components/ui/separator";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";
import { Trash2, Plus, Pill } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const SettingsPage = ({ onBack }: { onBack: () => void }) => {
  const { toast } = useToast();
  const { data: settings, isLoading } = useUserSettings();
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
      <div className={cn("p-6", isMobile && "p-4")}>
        <div className="text-center">Lade Einstellungen...</div>
      </div>
    );
  }

  // Medication Management Content
  const medicationManagementContent = (
    <Card className={cn("p-6 mb-4", isMobile && "p-4 mb-3")}>
      <h2 className={cn("text-lg font-medium mb-4 flex items-center gap-2", isMobile && "text-base")}>
        <Pill className="h-5 w-5" />
        Medikamente verwalten
      </h2>
      <p className={cn("text-sm text-muted-foreground mb-4", isMobile && "text-xs")}>
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
            <p className={cn("text-center py-4 text-muted-foreground", isMobile && "text-sm")}>
              Noch keine Medikamente hinzugefügt
            </p>
          )}
        </div>
      </div>
      
      <Separator className="my-6" />
      
      {/* Medication Limits */}
      <MedicationLimitsSettings />
    </Card>
  );

  // Privacy & Security Content
  const privacyContent = (
    <Card className={cn("p-6 mb-4", isMobile && "p-4 mb-3")}>
      <h2 className={cn("text-lg font-medium mb-4", isMobile && "text-base")}>🛡️ Datenschutz & Sicherheit</h2>
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
  );

  // Advanced Settings Content
  const advancedContent = (
    <Card className={cn("p-6 mb-4", isMobile && "p-4 mb-3")}>
      <h2 className={cn("text-lg font-medium mb-4", isMobile && "text-base")}>⚙️ Erweitert</h2>
      <Alert>
        <AlertDescription className={cn(isMobile && "text-xs")}>
          💡 <strong>Tipp:</strong> Nutzen Sie den "🌤️ Wetter nachtragen"-Button in der Einträge-Liste für manuelles Backfill der letzten 30 Tage.
        </AlertDescription>
      </Alert>
    </Card>
  );

  return (
    <div className={cn("p-6 bg-gradient-to-br from-background to-secondary/20 min-h-screen", isMobile && "p-4")}>
      <div className={cn("flex items-center mb-6", isMobile ? "justify-between" : "justify-between")}>
        <Button variant="ghost" onClick={onBack} className={cn("p-2 hover:bg-secondary/80", isMobile && "px-2")}>
          ← Zurück
        </Button>
        <h1 className={cn("text-xl font-semibold", isMobile && "text-lg")}>⚙️ Einstellungen</h1>
        {!isMobile && <div className="w-16"></div>}
      </div>

      {isMobile ? (
        // Mobile: Accordion Layout
        <Accordion type="single" collapsible className="space-y-2">
          <AccordionItem value="medications" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="text-base font-medium">💊 Medikamente</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {medicationManagementContent}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="privacy" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="text-base font-medium">🛡️ Datenschutz & Sicherheit</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {privacyContent}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="advanced" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="text-base font-medium">⚙️ Erweitert</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {advancedContent}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : (
        // Desktop: Tabs Layout
        <Tabs defaultValue="medications" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="medications">💊 Medikamente</TabsTrigger>
            <TabsTrigger value="privacy">🛡️ Datenschutz</TabsTrigger>
            <TabsTrigger value="advanced">⚙️ Erweitert</TabsTrigger>
          </TabsList>

          <TabsContent value="medications">
            {medicationManagementContent}
          </TabsContent>

          <TabsContent value="privacy">
            {privacyContent}
          </TabsContent>

          <TabsContent value="advanced">
            {advancedContent}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default SettingsPage;