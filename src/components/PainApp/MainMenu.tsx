import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { WelcomeModal } from "./WelcomeModal";
import { QuickEntryModal } from "./QuickEntryModal";
import { StartPageCard, StartPageCardHeader, StartPageButtonGrid, SectionHeader, CardBadge } from "@/components/ui/start-page-card";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mic, X, RefreshCw } from "lucide-react";

import { useOnboarding } from "@/hooks/useOnboarding";
import { ReminderFormWithVoiceData } from "@/components/Reminders/ReminderFormWithVoiceData";
import { useCreateReminder, useCreateMultipleReminders } from "@/features/reminders/hooks/useReminders";
import { useReminderBadgeCount, useUpcoming24hWarnings } from "@/features/reminders/hooks/useReminderBadge";
import { useUnratedMedicationEntries } from "@/features/medication-effects/hooks/useMedicationEffects";
import { CreateReminderInput } from "@/types/reminder.types";
import { toast } from "sonner";
import { VoiceNoteReviewModal } from "./VoiceNoteReviewModal";
import { saveVoiceNote } from '@/lib/voice/saveNote';
import { setVoiceDraft } from '@/lib/voice/voiceDraftStorage';
import { QuickContextNoteModal } from "./QuickContextNoteModal";
import { VoiceHelpOverlay } from "./VoiceHelpOverlay";
import { VoiceAssistantOverlay } from "./VoiceAssistantOverlay";
import { UpcomingWarningBanner } from "@/components/Reminders/UpcomingWarningBanner";
import { CriticalMedicationPopup } from "@/components/Reminders/CriticalMedicationPopup";
import { devError } from "@/lib/utils/devLogger";
import { Button } from "@/components/ui/button";
import { FeedbackButton } from "@/components/Feedback";


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
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  
  const createReminder = useCreateReminder();
  const createMultipleReminders = useCreateMultipleReminders();
  const { count: reminderBadgeCount } = useReminderBadgeCount();
  const { reminders: upcomingWarnings } = useUpcoming24hWarnings();
  
  // Unrated medication count for badge
  const { data: unratedEntries } = useUnratedMedicationEntries();
  const unratedMedsCount = (unratedEntries || []).reduce(
    (sum, entry) => sum + entry.medications.filter(
      med => !entry.rated_medications.includes(med)
    ).length, 0
  );

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
      toast.success('Voice-Notiz gespeichert');
      setShowVoiceNoteReview(false);
      setPendingVoiceNote('');
      window.dispatchEvent(new Event('voice-note-saved'));
    } catch (error) {
      devError('Error saving voice note:', error, { context: 'MainMenu' });
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
      
      toast.success('Erinnerung erstellt', {
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
            {/* 1) SPRACHEINGABE - Hero Card */}
            <StartPageCard 
              variant="voiceHighlight" 
              touchFeedback
              onClick={() => setShowVoiceAssistant(true)}
            >
              <StartPageCardHeader
                icon={<Mic className="w-5 h-5 text-voice" />}
                iconBgClassName="bg-voice-light/30"
                title="Spracheingabe"
                subtitle="Per Sprache oder Text"
              />
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

          </div>

          {/* MEDIKAMENTE */}
          <SectionHeader title="Medikamente" />
          
          <div className="space-y-3">
            {/* Hauptkarte: Medikamenten-Wirkung */}
            <StartPageCard 
              variant="warning" 
              touchFeedback 
              onClick={() => navigate('/medication-effects')}
              className="relative"
            >
              <StartPageCardHeader
                icon="💊"
                iconBgClassName="bg-warning/30"
                title="Medikamenten-Wirkung"
                subtitle="Wirksamkeit bewerten"
              />
              {unratedMedsCount > 0 && (
                <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-semibold bg-destructive text-destructive-foreground rounded-full">
                  {unratedMedsCount > 99 ? '99+' : unratedMedsCount}
                </span>
              )}
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

          {/* Feedback Button */}
          <div className="pt-6 pb-2">
            <FeedbackButton 
              variant="ghost" 
              size="sm" 
              className="w-full text-muted-foreground hover:text-foreground"
            />
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
          setShowVoiceAssistant(true);
        }}
      />

      <VoiceHelpOverlay
        open={showVoiceHelp}
        onOpenChange={setShowVoiceHelp}
      />

      <VoiceAssistantOverlay
        open={showVoiceAssistant}
        onOpenChange={setShowVoiceAssistant}
        onSelectAction={(action, draftText, prefillData) => {
          if (draftText && draftText.trim()) {
            setVoiceDraft(draftText.trim());
          }
          
          switch (action) {
            case 'pain_entry':
              onNewEntry();
              break;
            case 'quick_entry':
              // Use prefillData from voice recognition if available
              setVoiceData(prefillData || { initialNotes: draftText });
              setShowQuickEntry(true);
              break;
            case 'add_medication':
              // Navigate to medication management screen
              // prefillData contains the parsed medication info (name, strength, etc.)
              onNavigate?.('medication-management');
              // TODO: Pass prefillData to MedicationManagement for pre-filling the add form
              break;
            case 'medication':
              navigate('/medication-effects');
              break;
            case 'reminder':
              onNavigate?.('reminders');
              break;
            case 'diary':
              onNavigate?.('diary-timeline');
              break;
            case 'note':
              // Notes are now saved directly in VoiceAssistantOverlay with undo
              // This is fallback for manual selection
              setPendingVoiceNote(draftText);
              setShowVoiceNoteReview(true);
              break;
            case 'question':
              // Questions are handled directly in VoiceAssistantOverlay
              break;
          }
        }}
      />
      
      {/* Critical medication reminder popup (shown once per day) */}
      <CriticalMedicationPopup />
    </div>
  );
};
