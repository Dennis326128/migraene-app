import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { MedicationOverview } from "@/components/PainApp/MedicationOverview";
import { useRecentMedicationsWithEffects } from "@/features/medication-effects/hooks/useMedicationEffects";

interface MedicationOverviewPageProps {
  onBack: () => void;
}

export function MedicationOverviewPage({ onBack }: MedicationOverviewPageProps) {
  const { data: entries = [], isLoading, error } = useRecentMedicationsWithEffects();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Zurück
            </Button>
          </div>
          <div className="text-center py-8">
            <div className="text-2xl mb-2">💊</div>
            <p className="text-muted-foreground">Lade Medikamenten-Übersicht...</p>
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
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Zurück
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
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück
          </Button>
        </div>
        
        <MedicationOverview entries={entries} />
      </div>
    </div>
  );
}