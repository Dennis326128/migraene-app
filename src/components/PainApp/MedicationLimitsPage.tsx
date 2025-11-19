import React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MedicationLimitsOverview } from "./MedicationLimitsOverview";
import { MedicationLimitsSettings } from "./MedicationLimitsSettings";
import { BarChart3, Settings } from "lucide-react";

interface MedicationLimitsPageProps {
  onBack: () => void;
  onNavigateToMedications?: () => void;
}

export function MedicationLimitsPage({ onBack, onNavigateToMedications }: MedicationLimitsPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader 
        title="Medikamenten-Übergebrauch" 
        onBack={onBack}
        sticky={true}
      />

      <div className="container mx-auto p-4">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-14 mb-6">
            <TabsTrigger value="overview" className="text-base px-6 py-3">
              <BarChart3 className="h-5 w-5 mr-2" />
              Aktuelle Übersicht
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-base px-6 py-3">
              <Settings className="h-5 w-5 mr-2" />
              Limits verwalten
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <MedicationLimitsOverview />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <MedicationLimitsSettings onNavigateToMedications={onNavigateToMedications} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
