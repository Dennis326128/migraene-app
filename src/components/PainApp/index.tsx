import React, { useState } from "react";
import { NewEntry } from "./NewEntry";
import { EntriesList } from "./EntriesList";
import { MainMenu } from "./MainMenu";
import { AnalysisView } from "./AnalysisView";
import SettingsPage from "./SettingsPage";
import { OnboardingModal } from "./OnboardingModal";
import { useOnboarding } from "@/hooks/useOnboarding";
import type { PainEntry } from "@/types/painApp";

type View = "menu" | "new" | "list" | "analysis" | "settings";

export const PainApp: React.FC = () => {
  const [view, setView] = useState<View>("menu");
  const [editing, setEditing] = useState<PainEntry | null>(null);
  const { needsOnboarding, isLoading, completeOnboarding } = useOnboarding();

  const goHome = () => { setEditing(null); setView("menu"); };

  // Show loading state while checking onboarding status
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Migräne-App wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Global Components - No ReminderNotifications anymore */}
      
      {view === "menu" && (
        <MainMenu
          onNewEntry={() => { setEditing(null); setView("new"); }}
          onViewEntries={() => setView("list")}
          onViewAnalysis={() => setView("analysis")}
          onViewSettings={() => setView("settings")}
          onQuickEntry={() => setView("list")} // Show entries after quick entry
        />
      )}

      {view === "new" && (
        <NewEntry
          entry={editing}
          onBack={goHome}
          onSave={goHome}
        />
      )}

      {view === "list" && (
        <EntriesList
          onBack={goHome}
          onEdit={(entry) => { setEditing(entry); setView("new"); }}
        />
      )}

      {view === "analysis" && (
        <AnalysisView onBack={goHome} />
      )}

      {view === "settings" && (
        <SettingsPage onBack={goHome} />
      )}

      {/* Onboarding Modal */}
      <OnboardingModal 
        open={needsOnboarding} 
        onComplete={completeOnboarding} 
      />
    </div>
  );
};
export default PainApp;