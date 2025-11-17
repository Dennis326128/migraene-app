import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, History, TrendingUp, Settings, Zap, Mic, Bell } from "lucide-react";
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

interface MainMenuProps {
  onNewEntry: () => void;
  onViewEntries: () => void;
  onViewAnalysis: () => void;
  onViewSettings: () => void;
  onQuickEntry?: () => void;
  onNavigate?: (view: string) => void;
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
  
  const createReminder = useCreateReminder();
  const createMultipleReminders = useCreateMultipleReminders();
  
  // Smart Voice Router - automatically detects pain entry vs voice note vs reminder
  const voiceRouter = useSmartVoiceRouter({
    onEntryDetected: (data) => {
      console.log('📝 Pain entry detected, opening QuickEntry:', data);
      setVoiceData(data);
      setShowQuickEntry(true);
    },
    onNoteCreated: () => {
      console.log('🎙️ Voice note saved');
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
    return 'Voice-Eingabe';
  };

  const getVoiceButtonSubtitle = () => {
    if (voiceRouter.remainingSeconds) {
      return 'Weiter sprechen oder warten...';
    }
    if (voiceRouter.isListening) {
      return 'Sprechen Sie jetzt! (3s Pause beendet)';
    }
    return 'Schmerz oder Notiz';
  };

  const handleQuickEntryClose = () => {
    setShowQuickEntry(false);
    setVoiceData(null); // Reset voice data
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
          {/* New Entry Button */}
          <StartPageCard 
            variant="success" 
            touchFeedback 
            onClick={onNewEntry}
          >
            <StartPageCardHeader
              icon="➕"
              title="Neuer Eintrag"
              subtitle="Detaillierte Migräne-Dokumentation"
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
              title="Schnelleintrag"
              subtitle="Sofortige Migräne-Erfassung"
            />
          </StartPageCard>

          {/* Unified Voice Entry Button */}
          <StartPageCard 
            variant="voice" 
            touchFeedback 
            onClick={handleVoiceEntry}
            className={voiceRouter.isListening ? 'ring-2 ring-blue-400 animate-pulse' : ''}
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

          {/* Secondary Actions Grid */}
          <StartPageButtonGrid columns={2} gap="md">
            {/* Voice Notes */}
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={() => onNavigate?.('voice-notes')}
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">🎙️</div>
                <div>
                  <h4 className="font-semibold text-sm">Voice-Notizen</h4>
                  <p className="text-xs opacity-75">Sprachaufnahmen</p>
                </div>
              </div>
            </StartPageCard>

            {/* Medication Overview */}
            <StartPageCard 
              variant="warning" 
              touchFeedback 
              onClick={() => onNavigate?.('medication-overview')}
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">💊</div>
                <div>
                  <h4 className="font-semibold text-sm">Medikamenten-Wirkung</h4>
                  <p className="text-xs opacity-75">Nachträglich bewerten</p>
                </div>
              </div>
            </StartPageCard>

            {/* Reminders */}
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={() => onNavigate?.('reminders')}
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">⏰</div>
                <div>
                  <h4 className="font-semibold text-sm">Erinnerungen</h4>
                  <p className="text-xs opacity-75">Medikamente & Termine</p>
                </div>
              </div>
            </StartPageCard>

            {/* View Entries */}
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={onViewEntries}
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">📋</div>
                <div>
                  <h4 className="font-semibold text-sm">Verlauf</h4>
                  <p className="text-xs opacity-75">Einträge</p>
                </div>
              </div>
            </StartPageCard>

            {/* Analysis */}
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={onViewAnalysis}
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">📊</div>
                <div>
                  <h4 className="font-semibold text-sm">Auswertungen</h4>
                  <p className="text-xs opacity-75">Trends</p>
                </div>
              </div>
            </StartPageCard>

            {/* Settings */}
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={onViewSettings}
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">⚙️</div>
                <div>
                  <h4 className="font-semibold text-sm">Einstellungen</h4>
                  <p className="text-xs opacity-75">Konfiguration</p>
                </div>
              </div>
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
    </div>
  );
};