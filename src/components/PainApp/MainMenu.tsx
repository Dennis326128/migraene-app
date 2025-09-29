import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, History, TrendingUp, Settings, Zap, Mic } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { WelcomeModal } from "./WelcomeModal";
import { QuickEntryModal } from "./QuickEntryModal";
import { FloatingActionButton } from "@/components/ui/floating-action-button";
import { MobileOptimizedCard, MobileCardHeader, MobileButtonGrid } from "@/components/ui/mobile-optimized-card";
import { useIsMobile } from "@/hooks/use-mobile";

import { useOnboarding } from "@/hooks/useOnboarding";
import { useVoiceTrigger, type VoiceTriggerData } from "@/hooks/useVoiceTrigger";
import { toast } from "sonner";

interface MainMenuProps {
  onNewEntry: () => void;
  onViewEntries: () => void;
  onViewAnalysis: () => void;
  onViewSettings: () => void;
  onQuickEntry?: () => void;
  onNavigate?: (view: string) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onNewEntry,
  onViewEntries,
  onViewAnalysis,
  onViewSettings,
  onQuickEntry,
  onNavigate,
}) => {
  const { needsOnboarding, completeOnboarding, isLoading: onboardingLoading } = useOnboarding();
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [voiceData, setVoiceData] = useState<VoiceTriggerData | null>(null);
  

  // New voice trigger system
  const voiceTrigger = useVoiceTrigger({
    onParsed: (data) => {
      console.log('🎯 Voice data parsed, opening QuickEntry:', data);
      setVoiceData(data);
      setShowQuickEntry(true);
    },
    onError: (error) => {
      toast.error(`Spracheingabe Fehler: ${error}`);
    }
  });

  const handleVoiceEntry = () => {
    if (voiceTrigger.isListening) {
      voiceTrigger.stopVoiceEntry();
    } else {
      toast.info('🎤 Sprechen Sie jetzt...');
      voiceTrigger.startVoiceEntry();
    }
  };

  const getVoiceButtonTitle = () => {
    if (voiceTrigger.remainingSeconds) {
      return `Beende in ${voiceTrigger.remainingSeconds}s`;
    }
    if (voiceTrigger.isListening) {
      return 'Hört zu...';
    }
    return 'Sprach-Eintrag';
  };

  const getVoiceButtonSubtitle = () => {
    if (voiceTrigger.remainingSeconds) {
      return 'Weiter sprechen oder warten...';
    }
    if (voiceTrigger.isListening) {
      return 'Sprechen Sie jetzt! (3s Pause beendet)';
    }
    return 'Sprechen Sie Ihren Eintrag auf Deutsch';
  };

  const handleQuickEntryClose = () => {
    setShowQuickEntry(false);
    setVoiceData(null); // Reset voice data
  };

  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 flex flex-col relative">
      <div className="absolute top-4 right-4 z-10">
        <LogoutButton />
      </div>
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="text-center mb-8 sm:mb-12 px-2">
          <h1 className="text-3xl sm:text-4xl font-light text-foreground mb-2">Migräne-App</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Verfolgen Sie Ihre Migräne und finden Sie Muster</p>
        </div>

        <div className="space-y-4 sm:space-y-6 w-full max-w-md px-2 sm:px-0">
          {/* New Entry Button */}
          <MobileOptimizedCard 
            variant="interactive" 
            touchFeedback 
            onClick={onNewEntry}
            className="cursor-pointer"
          >
            <MobileCardHeader
              icon="➕"
              title="Neuer Eintrag"
              subtitle="Detaillierte Migräne-Dokumentation"
            />
          </MobileOptimizedCard>

          {/* Quick Entry Button - Desktop */}
          {!isMobile && (
            <MobileOptimizedCard 
              variant="interactive" 
              touchFeedback 
              onClick={() => setShowQuickEntry(true)}
              className="cursor-pointer"
            >
              <MobileCardHeader
                icon="🔴"
                title="Schnelleintrag"
                subtitle="Sofortige Migräne-Erfassung"
              />
            </MobileOptimizedCard>
          )}

          {/* Voice Entry Button */}
          <MobileOptimizedCard 
            variant="interactive" 
            touchFeedback 
            onClick={handleVoiceEntry}
            className={`cursor-pointer ${voiceTrigger.isListening ? 'ring-2 ring-success animate-pulse' : ''}`}
          >
            <MobileCardHeader
              icon={voiceTrigger.isListening ? '🔴' : '🎙️'}
              title={getVoiceButtonTitle()}
              subtitle={getVoiceButtonSubtitle()}
            />
          </MobileOptimizedCard>

          {/* Secondary Actions Grid */}
          <MobileButtonGrid columns={2} gap="md">
            {/* Medication Overview */}
            <MobileOptimizedCard 
              variant="warning" 
              touchFeedback 
              onClick={() => onNavigate?.('medication-overview')}
              className="cursor-pointer"
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">💊</div>
                <div>
                  <h4 className="font-semibold text-sm">Medikamente</h4>
                  <p className="text-xs text-muted-foreground">Wirkung</p>
                </div>
              </div>
            </MobileOptimizedCard>

            {/* View Entries */}
            <MobileOptimizedCard 
              variant="interactive" 
              touchFeedback 
              onClick={onViewEntries}
              className="cursor-pointer"
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">📋</div>
                <div>
                  <h4 className="font-semibold text-sm">Verlauf</h4>
                  <p className="text-xs text-muted-foreground">Einträge</p>
                </div>
              </div>
            </MobileOptimizedCard>

            {/* Analysis */}
            <MobileOptimizedCard 
              variant="interactive" 
              touchFeedback 
              onClick={onViewAnalysis}
              className="cursor-pointer"
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">📊</div>
                <div>
                  <h4 className="font-semibold text-sm">Auswertungen</h4>
                  <p className="text-xs text-muted-foreground">Trends</p>
                </div>
              </div>
            </MobileOptimizedCard>

            {/* Settings */}
            <MobileOptimizedCard 
              variant="interactive" 
              touchFeedback 
              onClick={onViewSettings}
              className="cursor-pointer"
            >
              <div className="text-center space-y-2">
                <div className="text-2xl">⚙️</div>
                <div>
                  <h4 className="font-semibold text-sm">Einstellungen</h4>
                  <p className="text-xs text-muted-foreground">Konfiguration</p>
                </div>
              </div>
            </MobileOptimizedCard>
          </MobileButtonGrid>
        </div>

        {/* Mobile-only Floating Action Button for Quick Entry */}
        {isMobile && (
          <FloatingActionButton
            variant="primary"
            size="lg"
            position="bottom-right"
            onClick={() => setShowQuickEntry(true)}
            pulse={voiceTrigger.isListening}
            aria-label="Schnelleintrag"
          >
            <Zap className="h-6 w-6" />
          </FloatingActionButton>
        )}
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
        initialPainLevel={voiceData?.painLevel ? parseInt(voiceData.painLevel) : undefined}
        initialSelectedTime={voiceData?.selectedTime}
        initialCustomDate={voiceData?.customDate}
        initialCustomTime={voiceData?.customTime}
        initialMedicationStates={voiceData?.medicationStates}
        initialNotes={voiceData?.notes}
      />
    </div>
  );
};