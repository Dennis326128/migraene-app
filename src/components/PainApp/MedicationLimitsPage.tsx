import React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { MedicationLimitsOverview } from "./MedicationLimitsOverview";
import { MedicationLimitsSettings } from "./MedicationLimitsSettings";

interface MedicationLimitsPageProps {
  onBack: () => void;
}

export function MedicationLimitsPage({ onBack }: MedicationLimitsPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader 
        title="Medikamenten-Übergebrauch" 
        onBack={onBack}
        sticky={true}
      />

      <div className="container mx-auto p-4 space-y-6">
        {/* Übersicht & Warnungen */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span>📊</span>
            <span>Aktuelle Übersicht</span>
          </h2>
          <MedicationLimitsOverview />
        </section>

        <Separator className="my-6" />

        {/* Limits verwalten */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span>⚙️</span>
            <span>Limits verwalten</span>
          </h2>
          <MedicationLimitsSettings />
        </section>
      </div>
    </div>
  );
}
