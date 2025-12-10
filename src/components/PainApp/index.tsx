import React, { useState, useEffect } from "react";
import { NewEntry } from "./NewEntry";
import { EntriesList } from "./EntriesList";
import { MainMenu } from "./MainMenu";
import { AnalysisView } from "./AnalysisView";
import SettingsPage from "./SettingsPage";
import { SettingsDoctorsPage } from "./Settings/SettingsDoctorsPage";
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
import { MedicationLimitsPage } from "./MedicationLimitsPage";
import { toast } from "sonner";

type View = "menu" | "new" | "list" | "analysis" | "settings" | "settings-doctors" | "medication-overview" | "medication-management" | "voice-notes" | "reminders" | "diary-timeline" | "context-tags" | "diary-report" | "medication-limits";

// Track where the user navigated from for proper back navigation
type DiaryReportOrigin = 'home' | 'diary-timeline' | null;

// Track origin for doctors page navigation
type DoctorsOrigin = { origin?: 'export_migraine_diary'; editDoctorId?: string } | null;

export const PainApp: React.FC = () => {
  const [view, setView] = useState<View>("menu");
  const [editing, setEditing] = useState<PainEntry | null>(null);
  const [diaryReportOrigin, setDiaryReportOrigin] = useState<DiaryReportOrigin>(null);
  const [doctorsOrigin, setDoctorsOrigin] = useState<DoctorsOrigin>(null);
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

  // Navigation callbacks
  const handleNavigateToLimits = () => setView("medication-limits");
  const handleNavigateToMedications = () => setView("medication-management");

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
              setDiaryReportOrigin('diary-timeline');
              setView('diary-report');
            } else if (target === 'diary-report-home') {
              setDiaryReportOrigin('home');
              setView('diary-report');
            } else if (target === 'medication-limits') {
              setView('medication-limits');
            } else if (target === 'analysis-grafik' || target === 'analysis-ki') {
              // Backwards compatibility: redirect old routes to unified analysis
              setView('analysis');
            } else if (target === 'analysis') {
              setView('analysis');
            } else if (target === 'analysis-limits') {
              // Removed: now navigates to medication-limits instead
              setView('medication-limits');
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
        <AnalysisView 
          onBack={goHome}
          onNavigateToLimits={handleNavigateToLimits}
        />
      )}

      {view === "settings" && (
        <SettingsPage onBack={goHome} />
      )}

      {view === "medication-overview" && (
        <MedicationOverviewPage onBack={goHome} />
      )}

      {view === "medication-management" && (
        <MedicationManagement 
          onBack={goHome}
          onNavigateToLimits={handleNavigateToLimits}
        />
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
              setDiaryReportOrigin('diary-timeline');
              setView('diary-report');
            }
          }}
          onEdit={(entry) => {
            setEditing(entry);
            setView("new");
          }}
        />
      )}

      {view === "context-tags" && <ContextTagsView onBack={goHome} />}

      {view === "reminders" && <RemindersPage onBack={goHome} />}

      {view === "diary-report" && <DiaryReport 
        onBack={() => {
          // Navigate back based on where user came from
          if (diaryReportOrigin === 'diary-timeline') {
            setView('diary-timeline');
          } else {
            goHome();
          }
          setDiaryReportOrigin(null);
        }} 
        onNavigate={(target: string) => {
          if (target === 'settings-account') {
            setView('settings');
          } else if (target.startsWith('settings-doctors')) {
            // Parse query parameters from target
            const params = new URLSearchParams(target.split('?')[1] || '');
            const origin = params.get('origin') as 'export_migraine_diary' | undefined;
            const editId = params.get('id') || undefined;
            setDoctorsOrigin(origin ? { origin, editDoctorId: editId } : null);
            setView('settings-doctors');
          }
        }} 
      />}

      {view === "settings-doctors" && (
        <SettingsDoctorsPage 
          onBack={() => {
            if (doctorsOrigin?.origin === 'export_migraine_diary') {
              setView('diary-report');
              setDoctorsOrigin(null);
            } else {
              setView('settings');
            }
          }}
          origin={doctorsOrigin?.origin}
          editDoctorId={doctorsOrigin?.editDoctorId}
          onSaveSuccess={() => {
            if (doctorsOrigin?.origin === 'export_migraine_diary') {
              toast.success('Arztdaten aktualisiert. Diese werden im PDF entsprechend angezeigt.');
              setView('diary-report');
              setDoctorsOrigin(null);
            }
          }}
        />
      )}

      {view === "medication-limits" && (
        <MedicationLimitsPage 
          onBack={goHome}
          onNavigateToMedications={handleNavigateToMedications}
        />
      )}

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