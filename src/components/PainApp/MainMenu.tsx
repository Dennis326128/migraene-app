import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { WelcomeModal } from "./WelcomeModal";
import { QuickEntryModal } from "./QuickEntryModal";
import { StartPageCard, StartPageCardHeader, StartPageButtonGrid, SectionHeader } from "@/components/ui/start-page-card";
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
  
  // Smart Voice Router - automatically detects pain entry vs voice note vs reminder vs medication update
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
    },
    onMedicationUpdateDetected: (data) => {
      console.log('💊 Medication update detected:', data);
      if (data.action === 'intolerance' || data.action === 'discontinued') {
        // Refresh medication data is automatic via React Query invalidation
      }
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
    if (voiceRouter.isSaving) {
      return 'Auswertung…';
    }
    if (voiceRouter.remainingSeconds) {
      return `Pause erkannt (${voiceRouter.remainingSeconds}s)`;
    }
    if (voiceRouter.isListening) {
      return 'Hört zu…';
    }
    return 'Einsprechen';
  };

  const getVoiceButtonSubtitle = () => {
    if (voiceRouter.isSaving) {
      return 'Wir tragen die Felder für dich ein.';
    }
    if (voiceRouter.remainingSeconds) {
      return 'Weiter sprechen oder auf "Fertig" tippen';
    }
    if (voiceRouter.isListening) {
      return 'Sprich jetzt. Eine kurze Pause beendet automatisch.';
    }
    return 'Beschreibe einfach, was los ist – wir füllen den Eintrag für dich aus.';
  };
  
  // Voice icon: roter Punkt mit Animation bei Aufnahme
  const VoiceIcon = () => {
    if (voiceRouter.isSaving) {
      return (
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      );
    }
    if (voiceRouter.isListening) {
      return (
        <div className="relative flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-destructive animate-pulse" />
          <div className="absolute w-6 h-6 rounded-full bg-destructive/30 animate-ping" />
        </div>
      );
    }
    return <span className="text-2xl sm:text-3xl">🎙️</span>;
  };

  const handleQuickEntryClose = () => {
    setShowQuickEntry(false);
    setVoiceData(null);
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
      window.dispatchEvent(new Event('voice-note-saved'));
    } catch (error) {
      console.error('Error saving voice note:', error);
      throw error;
    }
  };

  const handleReminderSubmit = async (data: CreateReminderInput | CreateReminderInput[]) => {
    try {
      if (Array.isArray(data)) {
        await createMultipleReminders.mutateAsync(data);
      } else {
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
    <div className="min-h-screen bg-background px-4 pb-6 sm:px-6 sm:pb-8 flex flex-col relative">
      <div className="flex-1 flex flex-col justify-start max-w-md mx-auto w-full">
        
        {/* HEADER - ruhiger, mehr Abstand */}
        <header className="text-center pt-6 pb-8 sm:pt-8 sm:pb-10">
          <h1 className="text-2xl sm:text-3xl font-light text-foreground tracking-tight">
            Migräne-App
          </h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-[260px] mx-auto">
            Dokumentiere deine Migräne und erkenne Muster.
          </p>
        </header>

        <div className="space-y-2 w-full">
          
          {/* SCHNELL ERFASSEN - Hauptbereich */}
          <SectionHeader title="Schnell erfassen" className="mt-0" />
          
          <div className="space-y-3">
            {/* 1) EINSPRECHEN - Hero Card, hervorgehoben */}
            <StartPageCard 
              variant={voiceRouter.isListening || voiceRouter.isSaving ? "voiceActive" : "voiceHighlight"} 
              size="hero"
              touchFeedback={!voiceRouter.isListening && !voiceRouter.isSaving}
              onClick={!voiceRouter.isListening && !voiceRouter.isSaving ? handleVoiceEntry : undefined}
            >
              <StartPageCardHeader
                icon={<VoiceIcon />}
                iconBgClassName={voiceRouter.isListening ? "bg-destructive/20" : "bg-primary/40"}
                iconSize="large"
                title={getVoiceButtonTitle()}
                subtitle={getVoiceButtonSubtitle()}
              />
              {voiceRouter.isListening && !voiceRouter.isSaving && (
                <div className="mt-4 space-y-2">
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      voiceRouter.stopVoice();
                    }}
                    className="w-full bg-success hover:bg-success/90 text-success-foreground font-medium"
                    size="lg"
                  >
                    Fertig & auswerten
                  </Button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      voiceRouter.stopVoice();
                    }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    Abbrechen
                  </button>
                </div>
              )}
            </StartPageCard>

            {/* 2) Migräne-Eintrag (Detail) */}
            <StartPageCard 
              variant="success" 
              touchFeedback 
              onClick={onNewEntry}
            >
              <StartPageCardHeader
                icon="➕"
                iconBgClassName="bg-success/30"
                title="Migräne-Eintrag (Detail)"
                subtitle="Detaillierte Dokumentation"
              />
            </StartPageCard>

            {/* 3) Schnell-Eintrag (kurz) */}
            <StartPageCard 
              variant="quick" 
              touchFeedback 
              onClick={() => setShowQuickEntry(true)}
            >
              <StartPageCardHeader
                icon="⚡"
                iconBgClassName="bg-destructive/30"
                title="Schnell-Eintrag (kurz)"
                subtitle="Schmerz jetzt kurz festhalten"
              />
            </StartPageCard>

            {/* 4) Alltag & Auslöser */}
            <StartPageCard 
              variant="muted" 
              touchFeedback 
              onClick={() => setShowQuickContextNote(true)}
            >
              <StartPageCardHeader
                icon="✨"
                iconBgClassName="bg-muted"
                title="Alltag & Auslöser"
                subtitle="Schlaf, Stress, Stimmung & mehr"
              />
            </StartPageCard>
          </div>

          {/* MEDIKAMENTE */}
          <SectionHeader title="Medikamente" />
          
          <div className="space-y-3">
            {/* Hauptkarte: Medikamenten-Wirkung */}
            <StartPageCard 
              variant="warning" 
              touchFeedback 
              onClick={() => window.location.href = '/medication-effects'}
            >
              <StartPageCardHeader
                icon="💊"
                iconBgClassName="bg-warning/30"
                title="Medikamenten-Wirkung"
                subtitle="Wirksamkeit bewerten"
              />
            </StartPageCard>

            {/* Grid: Medikamente & Übergebrauch */}
            <StartPageButtonGrid columns={2} gap="md">
              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={() => onNavigate?.('medication-management')}
              >
                <StartPageCardHeader
                  icon="📋"
                  iconBgClassName="bg-muted"
                  title="Medikamente"
                />
              </StartPageCard>

              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={() => onNavigate?.('medication-limits')}
              >
                <StartPageCardHeader
                  icon="⚠️"
                  iconBgClassName="bg-muted"
                  title="Übergebrauch"
                  subtitle="Grenzen & Warnungen"
                />
              </StartPageCard>
            </StartPageButtonGrid>
          </div>

          {/* TAGEBUCH & AUSWERTUNGEN */}
          <SectionHeader title="Tagebuch & Auswertungen" />
          
          <StartPageButtonGrid columns={2} gap="md">
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={() => onNavigate?.('diary-timeline')}
            >
              <StartPageCardHeader
                icon="📖"
                iconBgClassName="bg-muted"
                title="Tagebuch"
              />
            </StartPageCard>

            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={() => onNavigate?.('analysis')}
            >
              <StartPageCardHeader
                icon="📊"
                iconBgClassName="bg-muted"
                title="Auswertung"
                subtitle="Analyse & Bericht"
              />
            </StartPageCard>
          </StartPageButtonGrid>

          {/* ORGANISATION - ganz unten, kleiner */}
          <SectionHeader title="Organisation" />
          
          <StartPageButtonGrid columns={2} gap="md">
            <StartPageCard 
              variant="muted" 
              size="small"
              touchFeedback 
              onClick={() => onNavigate?.('reminders')}
            >
              <StartPageCardHeader
                icon="⏰"
                iconBgClassName="bg-background/50"
                title="Erinnerungen"
              />
            </StartPageCard>

            <StartPageCard 
              variant="muted" 
              size="small"
              touchFeedback 
              onClick={onViewSettings}
            >
              <StartPageCardHeader
                icon="⚙️"
                iconBgClassName="bg-background/50"
                title="Einstellungen"
              />
            </StartPageCard>
          </StartPageButtonGrid>

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
        initialPainLevel={voiceData?.initialPainLevel}
        initialSelectedTime={voiceData?.initialSelectedTime}
        initialCustomDate={voiceData?.initialCustomDate}
        initialCustomTime={voiceData?.initialCustomTime}
        initialMedicationStates={voiceData?.initialMedicationStates}
        initialNotes={voiceData?.initialNotes}
        onLimitWarning={onLimitWarning}
      />

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

      <VoiceNoteReviewModal
        open={showVoiceNoteReview}
        onClose={() => {
          setShowVoiceNoteReview(false);
          setPendingVoiceNote('');
        }}
        transcript={pendingVoiceNote}
        onSave={handleVoiceNoteSave}
      />

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
