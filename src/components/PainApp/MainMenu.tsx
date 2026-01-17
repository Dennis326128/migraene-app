import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { SimpleVoiceOverlay } from "./SimpleVoiceOverlay";
import { UpcomingWarningBanner } from "@/components/Reminders/UpcomingWarningBanner";
import { CriticalMedicationPopup } from "@/components/Reminders/CriticalMedicationPopup";
import { devError } from "@/lib/utils/devLogger";
import { Button } from "@/components/ui/button";
import { FeedbackButton } from "@/components/Feedback";
import { useCreateEntry } from "@/features/entries/hooks/useEntryMutations";
import { format } from "date-fns";


// Prefill data type for voice-initiated entries
export interface VoicePrefillData {
  initialPainLevel?: number;
  initialSelectedDate?: string;
  initialSelectedTime?: string;
  initialMedicationStates?: Record<string, { doseQuarters: number; medicationId?: string }>;
  initialNotes?: string;
}

interface MainMenuProps {
  onNewEntry: (prefillData?: VoicePrefillData) => void;
  onViewEntries: () => void;
  onViewAnalysis: () => void;
  onViewSettings: () => void;
  onQuickEntry?: () => void;
  onNavigate?: (view: 'medication-overview' | 'medication-management' | 'voice-notes' | 'reminders' | 'diary-timeline' | 'context-tags' | 'analysis' | 'analysis-grafik' | 'analysis-ki' | 'analysis-limits' | 'diary-report' | 'diary-report-home' | 'medication-limits' | 'ai-reports' | 'therapy-medication' | 'hit6') => void;
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
  const { t } = useTranslation();
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
  const createEntryMut = useCreateEntry();
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
      toast.success(t('voice.voiceNoteSaved'));
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
      
      toast.success(t('reminder.created'), {
        description: t('reminder.createdDesc')
      });
      
      setShowReminderForm(false);
      setPrefilledReminderData(null);
    } catch (error) {
      devError('Error creating reminder:', error, { context: 'MainMenu' });
      toast.error(t('error.general'), {
        description: t('reminder.createError')
      });
    }
  };

  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background px-4 pb-6 sm:px-6 sm:pb-8 flex flex-col relative">
      <div className="flex-1 flex flex-col justify-start max-w-md mx-auto w-full">
        
        {/* HEADER */}
        <header className="text-center pt-6 pb-8 sm:pt-8 sm:pb-10">
          <h1 className="text-2xl sm:text-3xl font-light text-foreground tracking-tight">
            {t('app.name')}
          </h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-[260px] mx-auto">
            {t('app.tagline')}
          </p>
        </header>

        {/* 24h Warning Banner */}
        <UpcomingWarningBanner 
          reminders={upcomingWarnings} 
          onShow={() => onNavigate?.('reminders')} 
        />

        <div className="space-y-2 w-full">
          
          {/* SCHNELL ERFASSEN */}
          <SectionHeader title={t('sections.quickEntry')} className="mt-0" />
          
          <div className="space-y-3">
            {/* 1) SPRACHEINGABE - volle Breite, Hero Card */}
            <StartPageCard 
              variant="voiceHighlight" 
              touchFeedback
              onClick={() => setShowVoiceAssistant(true)}
            >
              <StartPageCardHeader
                icon={<Mic className="w-5 h-5 text-voice" />}
                iconBgClassName="bg-voice-light/30"
                title={t('mainMenu.voiceInput')}
                subtitle={t('mainMenu.voiceSubtitle')}
              />
            </StartPageCard>

            {/* 2) Migräne-Eintrag (Detail) - volle Breite */}
            <StartPageCard 
              variant="success" 
              touchFeedback 
              onClick={() => onNewEntry()}
            >
              <StartPageCardHeader
                icon="➕"
                iconBgClassName="bg-success/25"
                title={t('mainMenu.detailEntry')}
                subtitle={t('mainMenu.detailSubtitle')}
              />
            </StartPageCard>

            {/* 3+4) Zweispaltig: Schnell-Eintrag (akut, rot) + Alltag & Auslöser (ruhig) */}
            <StartPageButtonGrid columns={2} gap="md">
              <StartPageCard 
                variant="quick" 
                touchFeedback 
                onClick={() => setShowQuickEntry(true)}
              >
                <StartPageCardHeader
                  icon="⚡"
                  iconBgClassName="bg-destructive/25"
                  title={t('mainMenu.quickEntry')}
                  subtitle={t('mainMenu.quickSubtitle')}
                />
              </StartPageCard>

              <StartPageCard 
                variant="muted" 
                touchFeedback 
                onClick={() => setShowQuickContextNote(true)}
              >
                <StartPageCardHeader
                  icon="✨"
                  iconBgClassName="bg-muted"
                  title={t('mainMenu.contextEntry')}
                  subtitle={t('mainMenu.contextSubtitle')}
                />
              </StartPageCard>
            </StartPageButtonGrid>

            {/* 5) Wirkung bewerten - volle Breite */}
            <StartPageCard 
              variant="warning" 
              touchFeedback 
              onClick={() => navigate('/medication-effects')}
              className="relative"
            >
              <StartPageCardHeader
                icon="💊"
                iconBgClassName="bg-warning/30"
                title="Wirkung bewerten"
                subtitle="Wie hat das Medikament gewirkt?"
              />
              {unratedMedsCount > 0 && (
                <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-semibold bg-destructive text-destructive-foreground rounded-full">
                  {unratedMedsCount > 99 ? '99+' : unratedMedsCount}
                </span>
              )}
            </StartPageCard>
          </div>

          {/* BERICHT ERSTELLEN */}
          <SectionHeader title="Bericht erstellen" />
          
          <div className="space-y-3">
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={() => onNavigate?.('diary-report-home')}
            >
              <StartPageCardHeader
                icon="📄"
                iconBgClassName="bg-muted"
                title="Bericht erstellen"
                subtitle="Kopfschmerztagebuch · HIT-6 · PDF"
              />
            </StartPageCard>
          </div>

          {/* AUSWERTUNG - Tiefe Analyse */}
          <SectionHeader title="Auswertung" />
          
          <div className="space-y-3">
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={() => onNavigate?.('analysis')}
            >
              <StartPageCardHeader
                icon="📊"
                iconBgClassName="bg-muted"
                title="Statistiken & Muster"
                subtitle="Kennzahlen · Diagramme · KI-Analyse"
              />
            </StartPageCard>

            <StartPageCard 
              variant="muted" 
              size="small"
              touchFeedback 
              onClick={() => onNavigate?.('medication-management')}
            >
              <StartPageCardHeader
                icon="📋"
                iconBgClassName="bg-muted"
                title="Medikamente verwalten"
              />
            </StartPageCard>
          </div>

          {/* VERLAUF */}
          <SectionHeader title="Verlauf" />
          
          <div className="space-y-3">
            <StartPageCard 
              variant="neutral" 
              touchFeedback 
              onClick={() => onNavigate?.('diary-timeline')}
            >
              <StartPageCardHeader
                icon="📖"
                iconBgClassName="bg-primary/20"
                title="Verlauf"
                subtitle="Liste & Kalender"
              />
            </StartPageCard>
          </div>

          {/* ORGANISATION */}
          <SectionHeader title={t('sections.organization')} />
          
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
                title={t('reminder.reminders')}
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
                title={t('settings.title')}
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
              {prefilledReminderData?.type === 'medication' ? '💊' : '📅'} {t('reminder.create')}
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

      <SimpleVoiceOverlay
        open={showVoiceAssistant}
        onOpenChange={setShowVoiceAssistant}
        onSavePainEntry={async (data) => {
          const now = new Date();
          const payload: {
            selected_date: string;
            selected_time: string;
            pain_level: number;
            medications: string[];
            notes: string;
          } = {
            selected_date: data.date || format(now, 'yyyy-MM-dd'),
            selected_time: data.time || format(now, 'HH:mm'),
            pain_level: data.painLevel ?? 5,
            medications: data.medications?.map(m => m.name) || [],
            notes: data.notes || ''
          };
          
          try {
            await createEntryMut.mutateAsync(payload);
            toast.success(t('entry.saved'), {
              action: {
                label: t('common.edit'),
                onClick: () => {
                  onNavigate?.('diary-timeline');
                }
              }
            });
          } catch (error) {
            devError('Error saving voice entry:', error, { context: 'MainMenu' });
            toast.error(t('error.saveFailed'));
          }
        }}
        onSaveContextNote={async (text, _timestamp) => {
          try {
            await saveVoiceNote({
              rawText: text,
              sttConfidence: 0.95,
              source: 'voice'
            });
            toast.success(t('voice.noteSaved'), {
              action: {
                label: t('voice.view'),
                onClick: () => {
                  onNavigate?.('voice-notes');
                }
              }
            });
          } catch (error) {
            devError('Error saving context note:', error, { context: 'MainMenu' });
            toast.error(t('error.saveFailed'));
          }
        }}
      />
      
      {/* Critical medication reminder popup (shown once per day) */}
      <CriticalMedicationPopup />
    </div>
  );
};