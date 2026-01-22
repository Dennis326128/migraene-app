import React, { useState, useEffect, Suspense } from "react";
import { NewEntry } from "./NewEntry";
import { EntriesList } from "./EntriesList";
import { MainMenu } from "./MainMenu";
import { OnboardingModal } from "./OnboardingModal";
import { AppTutorialModal } from "./AppTutorialModal";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useAppTutorial } from "@/hooks/useAppTutorial";
import type { PainEntry } from "@/types/painApp";
import { MedicationLimitWarning } from "./MedicationLimitWarning";
import { MedicalDisclaimerAlert } from "./MedicalDisclaimerAlert";
import { DueRemindersSheet } from "@/components/Reminders/DueRemindersSheet";
import { useInAppDueReminders } from "@/features/reminders/hooks/useInAppDueReminders";
import { toast } from "sonner";
import { LazyViewSkeleton } from "@/components/ui/lazy-view-skeleton";

// ═══════════════════════════════════════════════════════════════════════════
// LAZY LOADED VIEWS - Reduces initial bundle by ~40%
// These heavy components are only loaded when needed
// ═══════════════════════════════════════════════════════════════════════════
import {
  LazyAnalysisView,
  LazyMedicationManagement,
  LazyMedicationOverviewPage,
  LazyTherapyMedicationPage,
  LazyDiaryTimeline,
  LazySettingsPage,
  LazyVoiceNotesList,
  LazyMedicationLimitsPage,
  LazyContextTagsView,
  LazyRemindersPage,
  LazySettingsDoctorsPage,
  LazyDiaryReport,
  LazyDailyImpactCheckScreen,
  LazyAIReportsList,
  LazyAIReportDetail,
  LazyReportsHubPage,
  LazyReportHistoryPage,
  LazyDoctorShareScreen,
  prefetchCommonViews,
} from "@/lib/performance/lazyImports";
import type { AIReport } from "@/features/ai-reports";

type View = "menu" | "new" | "list" | "analysis" | "settings" | "settings-doctors" | "medication-overview" | "medication-management" | "voice-notes" | "reminders" | "diary-timeline" | "context-tags" | "diary-report" | "medication-limits" | "daily-impact" | "ai-reports" | "ai-report-detail" | "therapy-medication" | "reports-hub" | "report-history" | "doctor-share";

// Track where the user navigated from for proper back navigation
type DiaryReportOrigin = 'home' | 'diary-timeline' | null;

// Track origin for doctors page navigation
type DoctorsOrigin = { origin?: 'export_migraine_diary'; editDoctorId?: string } | null;

// Import VoicePrefillData type from MainMenu
import type { VoicePrefillData } from "./MainMenu";

export const PainApp: React.FC = () => {
  const [view, setView] = useState<View>("menu");
  const [editing, setEditing] = useState<PainEntry | null>(null);
  const [voicePrefillData, setVoicePrefillData] = useState<VoicePrefillData | null>(null);
  const [diaryReportOrigin, setDiaryReportOrigin] = useState<DiaryReportOrigin>(null);
  const [doctorsOrigin, setDoctorsOrigin] = useState<DoctorsOrigin>(null);
  const [selectedAIReport, setSelectedAIReport] = useState<AIReport | null>(null);
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

  // In-app due reminders (no cron/push, just on app open)
  const { sheetOpen: dueRemindersOpen, setSheetOpen: setDueRemindersOpen } = useInAppDueReminders();

  // Prefetch common views after initial render
  useEffect(() => {
    if (!isLoading && !needsOnboarding) {
      prefetchCommonViews();
    }
  }, [isLoading, needsOnboarding]);

  // Show tutorial after onboarding is completed
  useEffect(() => {
    if (!isLoading && !needsOnboarding && !tutorialLoading && !tutorialCompleted) {
      setShowTutorial(true);
    }
  }, [isLoading, needsOnboarding, tutorialLoading, tutorialCompleted, setShowTutorial]);

  const goHome = () => { setEditing(null); setVoicePrefillData(null); setView("menu"); };
  
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

  // Suspense wrapper for lazy views
  const withSuspense = (component: React.ReactNode, title?: string) => (
    <Suspense fallback={<LazyViewSkeleton title={title} />}>
      {component}
    </Suspense>
  );

  return (
    <div className="min-h-screen">
      {/* Global Components */}
      <MedicalDisclaimerAlert />
      
      {view === "menu" && (
        <MainMenu
          onNewEntry={(prefillData) => { 
            setEditing(null); 
            setVoicePrefillData(prefillData || null);
            setView("new"); 
          }}
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
              // NEW: Navigate to Reports Hub instead of directly to DiaryReport
              setView('reports-hub');
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
            } else if (target === 'ai-reports') {
              setView('ai-reports');
            } else if (target === 'therapy-medication') {
              setView('therapy-medication');
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
          // Voice prefill props
          initialPainLevel={voicePrefillData?.initialPainLevel}
          initialSelectedDate={voicePrefillData?.initialSelectedDate}
          initialSelectedTime={voicePrefillData?.initialSelectedTime}
          initialMedicationStates={voicePrefillData?.initialMedicationStates}
          initialNotes={voicePrefillData?.initialNotes}
        />
      )}

      {view === "list" && (
        <EntriesList
          onBack={goHome}
          onEdit={(entry) => { setEditing(entry); setView("new"); }}
        />
      )}

      {/* Lazy-loaded views with Suspense */}
      {view === "analysis" && withSuspense(
        <LazyAnalysisView 
          onBack={goHome}
          onNavigateToLimits={handleNavigateToLimits}
          onViewAIReport={(report) => {
            setSelectedAIReport(report);
            setView('ai-report-detail');
          }}
        />,
        "Auswertung laden..."
      )}

      {view === "settings" && withSuspense(
        <LazySettingsPage onBack={goHome} />,
        "Einstellungen laden..."
      )}

      {view === "medication-overview" && withSuspense(
        <LazyMedicationOverviewPage onBack={goHome} />,
        "Medikamente laden..."
      )}

      {view === "medication-management" && withSuspense(
        <LazyMedicationManagement 
          onBack={goHome}
          onNavigateToLimits={handleNavigateToLimits}
        />,
        "Medikamente laden..."
      )}

      {view === "therapy-medication" && withSuspense(
        <LazyTherapyMedicationPage 
          onBack={goHome}
          onEditEntry={(entry) => {
            setEditing(entry);
            setView("new");
          }}
        />,
        "Therapie & Medikation laden..."
      )}

      {view === "voice-notes" && withSuspense(
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
            <LazyVoiceNotesList onNavigate={(v) => setView(v as View)} />
          </div>
        </div>,
        "Voice-Notizen laden..."
      )}

      {view === "diary-timeline" && withSuspense(
        <LazyDiaryTimeline 
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
        />,
        "Tagebuch laden..."
      )}

      {view === "context-tags" && withSuspense(
        <LazyContextTagsView onBack={goHome} />,
        "Kontexte laden..."
      )}

      {view === "reminders" && withSuspense(
        <LazyRemindersPage onBack={goHome} />,
        "Erinnerungen laden..."
      )}

      {view === "diary-report" && withSuspense(
        <LazyDiaryReport 
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
        />,
        "Bericht laden..."
      )}

      {/* Daily Impact Check - Ersetzt HIT-6 */}
      {view === "daily-impact" && withSuspense(
        <LazyDailyImpactCheckScreen 
          onBack={() => setView('reports-hub')}
        />,
        "Kurzcheck laden..."
      )}

      {view === "settings-doctors" && withSuspense(
        <LazySettingsDoctorsPage 
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
        />,
        "Ärzte laden..."
      )}

      {view === "medication-limits" && withSuspense(
        <LazyMedicationLimitsPage 
          onBack={goHome}
          onNavigateToMedications={handleNavigateToMedications}
        />,
        "Limits laden..."
      )}

      {/* KI-Berichte List */}
      {view === "ai-reports" && withSuspense(
        <LazyAIReportsList 
          onBack={goHome}
          onViewReport={(report) => {
            setSelectedAIReport(report);
            setView('ai-report-detail');
          }}
        />,
        "KI-Berichte laden..."
      )}

      {/* KI-Bericht Detail */}
      {view === "ai-report-detail" && selectedAIReport && withSuspense(
        <LazyAIReportDetail 
          report={selectedAIReport}
          onBack={() => {
            setSelectedAIReport(null);
            setView('analysis');
          }}
        />,
        "Bericht laden..."
      )}

      {/* Reports Hub - Neue Auswahlseite */}
      {view === "reports-hub" && withSuspense(
        <LazyReportsHubPage 
          onBack={goHome}
          onSelectReportType={(type) => {
            if (type === 'diary') {
              setDiaryReportOrigin('home');
              setView('diary-report');
            } else if (type === 'daily_impact') {
              setView('daily-impact');
            } else if (type === 'medication_plan') {
              // TODO: Navigate to dedicated medication plan page
              setView('medication-management');
            }
          }}
          onViewHistory={() => setView('report-history')}
          onDoctorShare={() => setView('doctor-share')}
        />,
        "Berichte laden..."
      )}

      {/* Report History */}
      {view === "report-history" && withSuspense(
        <LazyReportHistoryPage 
          onBack={() => setView('reports-hub')}
          onCreateReport={() => setView('reports-hub')}
        />,
        "Verlauf laden..."
      )}

      {/* Doctor Share Screen */}
      {view === "doctor-share" && withSuspense(
        <LazyDoctorShareScreen 
          onBack={() => setView('reports-hub')}
        />,
        "Freigabe laden..."
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

      {/* Due Reminders Sheet - shows on app open */}
      <DueRemindersSheet
        open={dueRemindersOpen}
        onOpenChange={setDueRemindersOpen}
      />
    </div>
  );
};
export default PainApp;
