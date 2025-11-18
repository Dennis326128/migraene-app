import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { MedicationLimitsOverview } from "./MedicationLimitsOverview";
import { MedicationLimitsSettings } from "./MedicationLimitsSettings";

interface MedicationLimitsPageProps {
  onBack: () => void;
}

export function MedicationLimitsPage({ onBack }: MedicationLimitsPageProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="p-2 hover:bg-secondary/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold flex-1">Medikamenten-Übergebrauch</h1>
      </div>

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
