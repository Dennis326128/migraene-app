import React, { useState, useEffect } from "react";
import { NewEntry } from "./NewEntry";
import { EntriesList } from "./EntriesList";
import { MainMenu } from "./MainMenu";
import { AnalysisView } from "./AnalysisView";
import SettingsPage from "./SettingsPage";
import { OnboardingModal } from "./OnboardingModal";
import { AppTutorialModal } from "./AppTutorialModal";
import { MedicationOverviewPage } from "@/pages/MedicationOverviewPage";
import { MedicationManagement } from "./MedicationManagement";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useAppTutorial } from "@/hooks/useAppTutorial";
import type { PainEntry } from "@/types/painApp";
import { MedicationLimitWarning } from "./MedicationLimitWarning";
import { MedicalDisclaimerAlert } from "./MedicalDisclaimerAlert";
import { VoiceNotesList } from "./VoiceNotesList";
import { RemindersPage } from "@/components/Reminders/RemindersPage";
import { DiaryTimeline } from "./DiaryTimeline";
import { ContextTagsView } from "./ContextTagsView";
import DiaryReport from "./DiaryReport";

type View = "menu" | "new" | "list" | "analysis" | "settings" | "medication-overview" | "medication-management" | "voice-notes" | "reminders" | "diary-timeline" | "context-tags" | "diary-report";

export const PainApp: React.FC = () => {
  const [view, setView] = useState<View>("menu");
  const [editing, setEditing] = useState<PainEntry | null>(null);
  const [analysisInitialView, setAnalysisInitialView] = useState<"tagebuch" | "analyse" | "grafik" | "ki-analyse" | "ueberverbrauch">("grafik");
  const { needsOnboarding, isLoading, completeOnboarding } = useOnboarding();
  const { 
    showTutorial, 
    tutorialCompleted, 
    isLoading: tutorialLoading,
    completeTutorial,
    setShowTutorial 
  } = useAppTutorial();
  
  // Medication limit warnings on app level
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [limitChecks, setLimitChecks] = useState<any[]>([]);

  // Show tutorial after onboarding is completed
  useEffect(() => {
    if (!isLoading && !needsOnboarding && !tutorialLoading && !tutorialCompleted) {
      setShowTutorial(true);
    }
  }, [isLoading, needsOnboarding, tutorialLoading, tutorialCompleted, setShowTutorial]);

  const goHome = () => { setEditing(null); setView("menu"); };
  
  // Callback for child components to trigger limit warnings
  const handleLimitWarning = (checks: any[]) => {
    setLimitChecks(checks);
    setShowLimitWarning(true);
  };

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
      {/* Global Components */}
      <MedicalDisclaimerAlert />
      
      {view === "menu" && (
        <MainMenu
          onNewEntry={() => { setEditing(null); setView("new"); }}
          onViewEntries={() => setView("list")}
          onViewAnalysis={() => setView("analysis")}
          onViewSettings={() => setView("settings")}
          onQuickEntry={() => setView("list")} // Show entries after quick entry
          onNavigate={(target) => {
            if (target === 'medication-overview') {
              setView('medication-overview');
            } else if (target === 'medication-management') {
              setView('medication-management');
            } else if (target === 'voice-notes') {
              setView('voice-notes');
            } else if (target === 'reminders') {
              setView('reminders');
            } else if (target === 'diary-timeline') {
              setView('diary-timeline');
            } else if (target === 'context-tags') {
              setView('context-tags');
            } else if (target === 'diary-report') {
              setView('diary-report');
            } else if (target === 'analysis-grafik') {
              setAnalysisInitialView('grafik');
              setView('analysis');
            } else if (target === 'analysis-ki') {
              setAnalysisInitialView('ki-analyse');
              setView('analysis');
            } else if (target === 'analysis-limits') {
              setAnalysisInitialView('ueberverbrauch');
              setView('analysis');
            }
          }}
          onLimitWarning={handleLimitWarning}
        />
      )}

      {view === "new" && (
        <NewEntry
          entry={editing}
          onBack={goHome}
          onSave={goHome}
          onLimitWarning={handleLimitWarning}
        />
      )}

      {view === "list" && (
        <EntriesList
          onBack={goHome}
          onEdit={(entry) => { setEditing(entry); setView("new"); }}
        />
      )}

      {view === "analysis" && (
        <AnalysisView onBack={goHome} initialView={analysisInitialView} />
      )}

      {view === "settings" && (
        <SettingsPage onBack={goHome} />
      )}

      {view === "medication-overview" && (
        <MedicationOverviewPage onBack={goHome} />
      )}

      {view === "medication-management" && (
        <MedicationManagement onBack={goHome} />
      )}

      {view === "voice-notes" && (
        <div className="min-h-screen bg-background p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold">Voice-Notizen</h1>
              <button 
                onClick={goHome}
                className="text-muted-foreground hover:text-foreground"
              >
                Zurück
              </button>
            </div>
            <VoiceNotesList onNavigate={(view) => setView(view as View)} />
          </div>
        </div>
      )}

      {view === "diary-timeline" && (
        <DiaryTimeline 
          onBack={goHome} 
          onNavigate={(target) => {
            if (target === 'diary-report') {
              setView('diary-report');
            }
          }}
        />
      )}

      {view === "context-tags" && <ContextTagsView onBack={goHome} />}

      {view === "reminders" && (
        <div className="min-h-screen bg-background">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center px-4 py-4">
              <button 
                onClick={goHome}
                className="text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                ← Zurück
              </button>
            </div>
            <RemindersPage />
          </div>
        </div>
      )}

      {view === "diary-report" && <DiaryReport onBack={goHome} />}

      {/* Onboarding Modal */}
      <OnboardingModal 
        open={needsOnboarding} 
        onComplete={completeOnboarding} 
      />

      {/* App Tutorial Modal */}
      <AppTutorialModal
        open={showTutorial}
        onComplete={completeTutorial}
        canSkip={tutorialCompleted}
      />

      {/* Medication Limit Warning - App Level */}
      <MedicationLimitWarning
        isOpen={showLimitWarning}
        onOpenChange={setShowLimitWarning}
        limitChecks={limitChecks}
      />
    </div>
  );
};
export default PainApp;