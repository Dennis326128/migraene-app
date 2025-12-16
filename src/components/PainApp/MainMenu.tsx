import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { WelcomeModal } from "./WelcomeModal";
import { QuickEntryModal } from "./QuickEntryModal";
import { StartPageCard, StartPageCardHeader, StartPageButtonGrid, SectionHeader, CardBadge } from "@/components/ui/start-page-card";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useOnboarding } from "@/hooks/useOnboarding";
import { useSmartVoiceRouter } from "@/hooks/useSmartVoiceRouter";
import { ReminderFormWithVoiceData } from "@/components/Reminders/ReminderFormWithVoiceData";
import { useCreateReminder, useCreateMultipleReminders } from "@/features/reminders/hooks/useReminders";
import { useReminderBadgeCount, useUpcoming24hWarnings } from "@/features/reminders/hooks/useReminderBadge";
import { CreateReminderInput } from "@/types/reminder.types";
import { toast } from "sonner";
import { VoiceNoteReviewModal } from "./VoiceNoteReviewModal";
import { saveVoiceNote } from "@/lib/voice/saveNote";
import { QuickContextNoteModal } from "./QuickContextNoteModal";
import { VoiceHelpOverlay } from "./VoiceHelpOverlay";
import { VoiceUnknownIntentOverlay } from "./VoiceUnknownIntentOverlay";
import { UpcomingWarningBanner } from "@/components/Reminders/UpcomingWarningBanner";
import { CriticalMedicationPopup } from "@/components/Reminders/CriticalMedicationPopup";
import { devError } from "@/lib/utils/devLogger";
import { VoiceTextInput } from "./VoiceTextInput";

interface MainMenuProps {
  onNewEntry: () => void;
  onViewEntries: () => void;
  onViewAnalysis: () => void;
  onViewSettings: () => void;
  onQuickEntry?: () => void;
  onNavigate?: (view: 'medication-overview' | 'medication-management' | 'voice-notes' | 'reminders' | 'diary-timeline' | 'context-tags' | 'analysis' | 'analysis-grafik' | 'analysis-ki' | 'analysis-limits' | 'diary-report' | 'diary-report-home' | 'medication-limits') => void;
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
  const navigate = useNavigate();
  const { needsOnboarding, completeOnboarding, isLoading: onboardingLoading } = useOnboarding();
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [voiceData, setVoiceData] = useState<any>(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [prefilledReminderData, setPrefilledReminderData] = useState<any>(null);
  const [showVoiceNoteReview, setShowVoiceNoteReview] = useState(false);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<string>('');
  const [showQuickContextNote, setShowQuickContextNote] = useState(false);
  const [showVoiceHelp, setShowVoiceHelp] = useState(false);
  const [showUnknownIntent, setShowUnknownIntent] = useState(false);
  const [unknownTranscript, setUnknownTranscript] = useState('');
  
  const createReminder = useCreateReminder();
  const createMultipleReminders = useCreateMultipleReminders();
  const { count: reminderBadgeCount } = useReminderBadgeCount();
  const { reminders: upcomingWarnings } = useUpcoming24hWarnings();
  
  // Smart Voice Router with navigation support
  const voiceRouter = useSmartVoiceRouter({
    onEntryDetected: (data) => {
      setVoiceData(data);
      setShowQuickEntry(true);
    },
    onNoteDetected: (transcript) => {
      setPendingVoiceNote(transcript);
      setShowVoiceNoteReview(true);
    },
    onReminderDetected: (data) => {
      setPrefilledReminderData(data);
      setShowReminderForm(true);
    },
    onMedicationUpdateDetected: (_data) => {
      // Medication update handling
    },
    onNavigationIntent: (route, payload) => {
      // Map routes to internal navigation or external routes
      const routeMap: Record<string, string> = {
        '/diary': 'diary-timeline',
        '/analysis': 'analysis',
        '/medications': 'medication-management',
        '/settings': 'settings',
        '/settings/account': 'settings',
        '/settings/doctors': 'settings',
        '/reminders': 'reminders',
      };
      
      const internalView = routeMap[route];
      if (internalView && onNavigate) {
        onNavigate(internalView as any);
      } else {
        navigate(route, { state: payload ? { voicePayload: payload } : undefined });
      }
    },
    onHelpRequested: () => {
      setShowVoiceHelp(true);
    },
    onUnknownIntent: (transcript) => {
      setUnknownTranscript(transcript);
      setShowUnknownIntent(true);
    },
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
    if (voiceRouter.isListening) {
      return 'Aufnahme läuft …';
    }
    return 'Spracheingabe';
  };

  const getVoiceButtonSubtitle = () => {
    if (voiceRouter.isSaving) {
      return 'Wir tragen die Felder für dich ein.';
    }
    if (voiceRouter.isListening) {
      return 'Sprich in deinem Tempo.';
    }
    return 'Per Sprache erfassen.';
  };
  
  // Voice icon: roter Punkt mit Animation bei Aufnahme, Petrol bei Bereit
  const VoiceIcon = () => {
    if (voiceRouter.isSaving) {
      return (
        <div className="w-5 h-5 rounded-full border-2 border-voice-light border-t-transparent animate-spin" />
      );
    }
    if (voiceRouter.isListening) {
      return (
        <div className="relative flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
          <div className="absolute w-5 h-5 rounded-full bg-destructive/30 animate-ping" />
        </div>
      );
    }
    return <span className="text-lg sm:text-xl">🎙️</span>;
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
      devError('Error saving voice note:', error, { context: 'MainMenu' });
      throw error;
    }
  };

  // Handler for VoiceTextInput direct save
  const handleQuickNoteSave = async (
    text: string, 
    source: 'voice' | 'manual' | 'mixed', 
    confidence: number | null
  ) => {
    try {
      await saveVoiceNote({
        rawText: text,
        sttConfidence: confidence ?? undefined,
        source: source === 'mixed' ? 'voice' : source,
        contextType: 'notiz'
      });
      toast.success('Notiz gespeichert');
      window.dispatchEvent(new Event('voice-note-saved'));
    } catch (error) {
      devError('Error saving quick note:', error, { context: 'MainMenu' });
      toast.error('Speichern fehlgeschlagen');
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
      devError('Error creating reminder:', error, { context: 'MainMenu' });
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

        {/* 24h Warning Banner */}
        <UpcomingWarningBanner 
          reminders={upcomingWarnings} 
          onShow={() => onNavigate?.('reminders')} 
        />

        <div className="space-y-2 w-full">
          
          {/* SCHNELL ERFASSEN - Hauptbereich */}
          <SectionHeader title="Schnell erfassen" className="mt-0" />
          
          <div className="space-y-3">
            {/* 1) SPRACHEINGABE - Hero Card, hervorgehoben mit Voice-Farbe */}
            <StartPageCard 
              variant={voiceRouter.isListening || voiceRouter.isSaving ? "voiceActive" : "voiceHighlight"} 
              touchFeedback={!voiceRouter.isListening && !voiceRouter.isSaving}
              onClick={!voiceRouter.isListening && !voiceRouter.isSaving ? handleVoiceEntry : undefined}
            >
              <StartPageCardHeader
                icon={<VoiceIcon />}
                iconBgClassName={voiceRouter.isListening ? "bg-destructive/20" : "bg-voice-light/30"}
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
                    Fertig
                  </Button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      voiceRouter.cancelVoice();
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
                iconBgClassName="bg-success/25"
                title="Migräne-Eintrag (Detail)"
                subtitle="Ausführliche Dokumentation"
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
                iconBgClassName="bg-destructive/25"
                title="Schnell-Eintrag (kurz)"
                subtitle="Schmerz jetzt festhalten"
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

            {/* 5) Schnellnotiz - Direct Text/Voice Input */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <span className="text-base">📝</span>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground">Schnellnotiz</h3>
                  <p className="text-xs text-muted-foreground">Tippe oder sprich</p>
                </div>
              </div>
              <VoiceTextInput 
                onSave={handleQuickNoteSave}
                placeholder="Tippe oder sprich deine Notiz…"
                minRows={2}
              />
            </div>
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
                />
              </StartPageCard>
            </StartPageButtonGrid>
          </div>

          {/* TAGEBUCH & AUSWERTUNGEN */}
          <SectionHeader title="Tagebuch & Auswertungen" />
          
          <div className="space-y-3">
            <StartPageButtonGrid columns={2} gap="md">
              <StartPageCard 
                variant="neutral" 
                touchFeedback 
                onClick={() => onNavigate?.('diary-timeline')}
              >
                <StartPageCardHeader
                  icon="📖"
                  iconBgClassName="bg-muted"
                  title="Einträge & Verlauf"
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
                />
              </StartPageCard>
            </StartPageButtonGrid>

            {/* CTA: Kopfschmerztagebuch erstellen */}
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={() => onNavigate?.('diary-report-home')}
            >
              <StartPageCardHeader
                icon="📝"
                iconBgClassName="bg-muted"
                title="Kopfschmerztagebuch erstellen"
              />
            </StartPageCard>
          </div>

          {/* ORGANISATION - ganz unten, kleiner */}
          <SectionHeader title="Organisation" />
          
          <StartPageButtonGrid columns={2} gap="md">
            <StartPageCard 
              variant="muted" 
              size="small"
              touchFeedback 
              onClick={() => onNavigate?.('reminders')}
              className="relative"
            >
              <StartPageCardHeader
                icon="⏰"
                iconBgClassName="bg-background/50"
                title="Erinnerungen"
              />
              {reminderBadgeCount > 0 && (
                <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-semibold bg-destructive text-destructive-foreground rounded-full">
                  {reminderBadgeCount > 99 ? '99+' : reminderBadgeCount}
                </span>
              )}
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

      <VoiceHelpOverlay
        open={showVoiceHelp}
        onOpenChange={setShowVoiceHelp}
      />

      <VoiceUnknownIntentOverlay
        open={showUnknownIntent}
        onOpenChange={setShowUnknownIntent}
        transcript={unknownTranscript}
        onSelectAction={(action) => {
          switch (action) {
            case 'pain_entry':
              onNewEntry();
              break;
            case 'quick_entry':
              setShowQuickEntry(true);
              break;
            case 'medication':
              window.location.href = '/medication-effects';
              break;
            case 'reminder':
              onNavigate?.('reminders');
              break;
            case 'diary':
              onNavigate?.('diary-timeline');
              break;
            case 'note':
              setPendingVoiceNote(unknownTranscript);
              setShowVoiceNoteReview(true);
              break;
            case 'retry':
              handleVoiceEntry();
              break;
          }
        }}
      />
      
      {/* Critical medication reminder popup (shown once per day) */}
      <CriticalMedicationPopup />
    </div>
  );
};
