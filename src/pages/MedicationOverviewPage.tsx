import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { MedicationOverview } from "@/components/PainApp/MedicationOverview";
import { MedicationSaveProvider, useMedicationSave } from "@/contexts/MedicationSaveContext";
import { useRecentMedicationsWithEffects } from "@/features/medication-effects/hooks/useMedicationEffects";

interface MedicationOverviewPageProps {
  onBack: () => void;
}

function MedicationOverviewContent({ onBack }: MedicationOverviewPageProps) {
  const { data: entries = [], isLoading, error } = useRecentMedicationsWithEffects();
  const { hasPendingSaves, waitForAllSaves } = useMedicationSave();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleBack = async () => {
    if (hasPendingSaves) {
      setIsNavigating(true);
      try {
        await waitForAllSaves();
      } catch (error) {
        console.error('Error waiting for saves:', error);
      } finally {
        setIsNavigating(false);
      }
    }
    onBack();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={isNavigating}>
              {isNavigating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowLeft className="w-4 h-4 mr-2" />
              )}
              {isNavigating ? "Speichere..." : "Zurück"}
            </Button>
          </div>
          <div className="text-center py-8">
            <div className="text-2xl mb-2">💊</div>
            <p className="text-muted-foreground">Lade Medikamenten-Wirkung...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={isNavigating}>
              {isNavigating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowLeft className="w-4 h-4 mr-2" />
              )}
              {isNavigating ? "Speichere..." : "Zurück"}
            </Button>
          </div>
          <div className="text-center py-8">
            <div className="text-2xl mb-2">⚠️</div>
            <p className="text-muted-foreground mb-4">Fehler beim Laden der Medikamenten-Daten</p>
            <Button onClick={() => window.location.reload()}>
              Erneut versuchen
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={handleBack} disabled={isNavigating}>
            {isNavigating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ArrowLeft className="w-4 h-4 mr-2" />
            )}
            {isNavigating ? "Speichere..." : "Zurück"}
          </Button>
        </div>
        
        <MedicationOverview entries={entries} />
      </div>
    </div>
  );
}

export function MedicationOverviewPage({ onBack }: MedicationOverviewPageProps) {
  return (
    <MedicationSaveProvider>
      <MedicationOverviewContent onBack={onBack} />
    </MedicationSaveProvider>
  );
}