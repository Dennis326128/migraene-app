import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, History, TrendingUp, Settings, Zap, Mic, Bell, BookOpen, Sparkles, BarChart3, Brain, AlertTriangle, Database, Calendar, FileText } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { WelcomeModal } from "./WelcomeModal";
import { QuickEntryModal } from "./QuickEntryModal";
import { FloatingActionButton } from "@/components/ui/floating-action-button";
import { StartPageCard, StartPageCardHeader, StartPageButtonGrid } from "@/components/ui/start-page-card";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useOnboarding } from "@/hooks/useOnboarding";
import { useSmartVoiceRouter } from "@/hooks/useSmartVoiceRouter";
import { ReminderFormWithVoiceData } from "@/components/Reminders/ReminderFormWithVoiceData";
import { useCreateReminder, useCreateMultipleReminders } from "@/features/reminders/hooks/useReminders";
import { CreateReminderInput } from "@/types/reminder.types";
import { toast } from "sonner";
import { VoiceNoteReviewModal } from "./VoiceNoteReviewModal";
import { saveVoiceNote } from "@/lib/voice/saveNote";
import { QuickContextNoteModal } from "./QuickContextNoteModal";

interface MainMenuProps {
  onNewEntry: () => void;
  onViewEntries: () => void;
  onViewAnalysis: () => void;
  onViewSettings: () => void;
  onQuickEntry?: () => void;
  onNavigate?: (view: 'medication-overview' | 'medication-management' | 'voice-notes' | 'reminders' | 'diary-timeline' | 'context-tags' | 'analysis' | 'analysis-grafik' | 'analysis-ki' | 'analysis-limits' | 'diary-report' | 'medication-limits') => void;
  onLimitWarning?: (checks: any[]) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onNewEntry,
  onViewEntries,
  onViewAnalysis,
  onViewSettings,
  onQuickEntry,
  onNavigate,
  onLimitWarning,
}) => {
  const { needsOnboarding, completeOnboarding, isLoading: onboardingLoading } = useOnboarding();
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [voiceData, setVoiceData] = useState<any>(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [prefilledReminderData, setPrefilledReminderData] = useState<any>(null);
  const [showVoiceNoteReview, setShowVoiceNoteReview] = useState(false);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<string>('');
  const [showQuickContextNote, setShowQuickContextNote] = useState(false);
  
  const createReminder = useCreateReminder();
  const createMultipleReminders = useCreateMultipleReminders();
  
  // Smart Voice Router - automatically detects pain entry vs voice note vs reminder
  const voiceRouter = useSmartVoiceRouter({
    onEntryDetected: (data) => {
      console.log('📝 Pain entry detected, opening QuickEntry:', data);
      setVoiceData(data);
      setShowQuickEntry(true);
    },
    onNoteDetected: (transcript) => {
      console.log('🎙️ Voice note detected, opening review:', transcript);
      setPendingVoiceNote(transcript);
      setShowVoiceNoteReview(true);
    },
    onReminderDetected: (data) => {
      console.log('📋 Reminder detected, opening form:', data);
      setPrefilledReminderData(data);
      setShowReminderForm(true);
    }
  });

  const handleVoiceEntry = () => {
    if (voiceRouter.isListening) {
      voiceRouter.stopVoice();
    } else {
      voiceRouter.startVoice();
    }
  };

  const getVoiceButtonTitle = () => {
    if (voiceRouter.remainingSeconds) {
      return `Beende in ${voiceRouter.remainingSeconds}s`;
    }
    if (voiceRouter.isListening) {
      return 'Hört zu...';
    }
    return 'Einsprechen';
  };

  const getVoiceButtonSubtitle = () => {
    if (voiceRouter.remainingSeconds) {
      return 'Weiter sprechen oder warten...';
    }
    if (voiceRouter.isListening) {
      return 'Sprechen Sie jetzt! (3s Pause beendet)';
    }
    return 'Migräne oder Notiz per Sprache';
  };

  const handleQuickEntryClose = () => {
    setShowQuickEntry(false);
    setVoiceData(null); // Reset voice data
  };

  const handleVoiceNoteSave = async (text: string) => {
    try {
      await saveVoiceNote({
        rawText: text,
        sttConfidence: 0.95,
        source: 'voice'
      });
      toast.success('✅ Voice-Notiz gespeichert');
      setShowVoiceNoteReview(false);
      setPendingVoiceNote('');
      
      // Trigger reload in VoiceNotesList
      window.dispatchEvent(new Event('voice-note-saved'));
    } catch (error) {
      console.error('Error saving voice note:', error);
      throw error;
    }
  };

  const handleReminderSubmit = async (data: CreateReminderInput | CreateReminderInput[]) => {
    try {
      if (Array.isArray(data)) {
        // Multiple reminders (z.B. täglich mit mehreren Tageszeiten)
        await createMultipleReminders.mutateAsync(data);
      } else {
        // Single reminder
        await createReminder.mutateAsync(data);
      }
      
      toast.success('✅ Erinnerung erstellt', {
        description: 'Die Erinnerung wurde erfolgreich gespeichert'
      });
      
      setShowReminderForm(false);
      setPrefilledReminderData(null);
    } catch (error) {
      console.error('Error creating reminder:', error);
      toast.error('Fehler', {
        description: 'Erinnerung konnte nicht erstellt werden'
      });
    }
  };

  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background pt-2 px-4 pb-4 sm:pt-4 sm:px-6 sm:pb-6 flex flex-col relative">
      <div className="absolute bottom-4 right-4 z-10">
        <LogoutButton />
      </div>
      <div className="flex-1 flex flex-col justify-start max-w-md mx-auto w-full">
        <div className="text-center mb-6 sm:mb-8 px-2">
          <h1 className="text-3xl sm:text-4xl font-light text-foreground mb-2">Migräne-App</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Verfolgen Sie Ihre Migräne und finden Sie Muster</p>
        </div>

        <div className="space-y-4 sm:space-y-6 w-full max-w-md px-2 sm:px-0">
          {/* Schnell erfassen - Bereich */}
          <div className="mb-4">
            <h2 className="text-lg font-medium text-foreground/80 mb-3 px-1">Schnell erfassen</h2>
            
            <div className="space-y-3">
              {/* New Entry Button */}
              <StartPageCard 
                variant="success" 
                touchFeedback 
                onClick={onNewEntry}
              >
                <StartPageCardHeader
                  icon="➕"
                  title="Migräne-Eintrag erstellen"
                  subtitle="Detaillierte Dokumentation"
                />
              </StartPageCard>

              {/* Quick Entry Button - Schnelleintrag */}
              <StartPageCard 
                variant="quick" 
                size="default"
                touchFeedback 
                onClick={() => setShowQuickEntry(true)}
              >
                <StartPageCardHeader
                  icon="⚡"
                  title="Migräne-Schnelleintrag"
                  subtitle="Schmerz jetzt schnell festhalten"
                />
              </StartPageCard>

              {/* Unified Voice Entry Button */}
              <StartPageCard 
                variant="voice" 
                touchFeedback 
                onClick={handleVoiceEntry}
                className={voiceRouter.isListening ? 'ring-2 ring-primary shadow-lg shadow-primary/50' : ''}
                style={voiceRouter.isListening ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : undefined}
              >
                <StartPageCardHeader
                  icon={voiceRouter.isListening ? '🔴' : '🎙️'}
                  title={getVoiceButtonTitle()}
                  subtitle={getVoiceButtonSubtitle()}
                />
                {voiceRouter.isListening && (
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      voiceRouter.stopVoice();
                    }}
                    className="mt-3 w-full bg-success hover:bg-success/90"
                    size="lg"
                  >
                    ✅ Fertig & Verarbeiten
                  </Button>
                )}
              </StartPageCard>
            </div>
          </div>

          {/* Alltag & Faktoren - Bereich */}
          <div className="mb-4">
            <StartPageButtonGrid columns={1} gap="md">
              {/* Quick Context Note */}
              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={() => setShowQuickContextNote(true)}
              >
                <StartPageCardHeader
                  icon="✨"
                  title="Alltag & Auslöser eintragen"
                  subtitle="Schlaf, Stress, Stimmung, Ernährung, Wetter & mehr"
                />
              </StartPageCard>
            </StartPageButtonGrid>
          </div>

          {/* Medikamente - Bereich */}
          <div className="mb-4 space-y-3">
            <h2 className="text-lg font-medium text-foreground/80 mb-3 px-1">Medikamente</h2>
            
            {/* Medication actions in grid */}
            <StartPageButtonGrid columns={2} gap="md">
              {/* Medication Effects */}
              <StartPageCard 
                variant="warning" 
                touchFeedback 
                onClick={() => onNavigate?.('medication-overview')}
              >
                <StartPageCardHeader
                  icon="💊"
                  title="Wirkung eintragen"
                  subtitle="Einnahme nachtragen & bewerten"
                />
              </StartPageCard>

              {/* Medication Management */}
              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={() => onNavigate?.('medication-management')}
              >
                <StartPageCardHeader
                  icon="📋"
                  title="Medikamente verwalten"
                  subtitle="Hinzufügen & Erinnerungen"
                />
              </StartPageCard>
            </StartPageButtonGrid>

            {/* Medikamenten-Übergebrauch - Full width below */}
            <StartPageButtonGrid columns={1} gap="md">
              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={() => onNavigate?.('medication-limits')}
              >
                <StartPageCardHeader
                  icon="⚠️"
                  title="Medikamenten-Übergebrauch"
                  subtitle="Grenzen & Warnungen"
                />
              </StartPageCard>
            </StartPageButtonGrid>
          </div>

          {/* Tagebuch & Auswertungen - Bereich */}
          <div className="mb-4 space-y-3">
            <h2 className="text-lg font-medium text-foreground/80 mb-3 px-1">Tagebuch & Auswertungen</h2>
            
            {/* Mein Tagebuch - Full width */}
            <StartPageButtonGrid columns={1} gap="md">
              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={() => onNavigate?.('diary-timeline')}
              >
                <StartPageCardHeader
                  icon="📖"
                  title="Kopfschmerztagebuch"
                />
              </StartPageCard>
            </StartPageButtonGrid>

            {/* Auswertungen - Full width */}
            <StartPageButtonGrid columns={1} gap="md">
              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={() => onNavigate?.('analysis')}
              >
                <StartPageCardHeader
                  icon="📊"
                  title="Auswertung & Analyse"
                />
              </StartPageCard>
            </StartPageButtonGrid>
          </div>

          {/* Organisation - Bereich */}
          <div className="mb-4">
            <h2 className="text-lg font-medium text-foreground/80 mb-3 px-1">Organisation</h2>
            <StartPageButtonGrid columns={2} gap="md">
              {/* Reminders */}
              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={() => onNavigate?.('reminders')}
              >
                <StartPageCardHeader
                  icon="⏰"
                  title="Erinnerungen"
                  subtitle="Medikamente & Termine"
                />
              </StartPageCard>

              {/* Settings */}
              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={onViewSettings}
              >
                <StartPageCardHeader
                  icon="⚙️"
                  title="Einstellungen"
                  subtitle="App & Profil"
                />
              </StartPageCard>
            </StartPageButtonGrid>
          </div>
        </div>

      </div>

      {/* Modals */}
      {!onboardingLoading && (
        <WelcomeModal 
          open={needsOnboarding} 
          onComplete={completeOnboarding} 
        />
      )}
      
      <QuickEntryModal 
        open={showQuickEntry}
        onClose={handleQuickEntryClose}
        onSuccess={() => {
          handleQuickEntryClose();
          onQuickEntry?.();
        }}
        // Voice input pre-filling
        initialPainLevel={voiceData?.initialPainLevel}
        initialSelectedTime={voiceData?.initialSelectedTime}
        initialCustomDate={voiceData?.initialCustomDate}
        initialCustomTime={voiceData?.initialCustomTime}
        initialMedicationStates={voiceData?.initialMedicationStates}
        initialNotes={voiceData?.initialNotes}
        onLimitWarning={onLimitWarning}
      />

      {/* Reminder Form Dialog */}
      <Dialog open={showReminderForm} onOpenChange={setShowReminderForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {prefilledReminderData?.type === 'medication' ? '💊' : '📅'} Erinnerung erstellen
            </DialogTitle>
          </DialogHeader>
          
          <ReminderFormWithVoiceData
            initialData={prefilledReminderData}
            onSubmit={handleReminderSubmit}
            onCancel={() => {
              setShowReminderForm(false);
              setPrefilledReminderData(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Voice Note Review Modal */}
      <VoiceNoteReviewModal
        open={showVoiceNoteReview}
        onClose={() => {
          setShowVoiceNoteReview(false);
          setPendingVoiceNote('');
        }}
        transcript={pendingVoiceNote}
        onSave={handleVoiceNoteSave}
      />

      {/* Quick Context Note Modal */}
      <QuickContextNoteModal
        isOpen={showQuickContextNote}
        onClose={() => setShowQuickContextNote(false)}
        onStartVoice={() => {
          setShowQuickContextNote(false);
          handleVoiceEntry();
        }}
      />
    </div>
  );
};