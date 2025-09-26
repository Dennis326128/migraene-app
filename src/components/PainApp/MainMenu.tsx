import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, History, TrendingUp, Settings, Zap } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { WelcomeModal } from "./WelcomeModal";
import { QuickEntryModal } from "./QuickEntryModal";
import { useOnboarding } from "@/hooks/useOnboarding";

interface MainMenuProps {
  onNewEntry: () => void;
  onViewEntries: () => void;
  onViewAnalysis: () => void;
  onViewSettings: () => void;
  onQuickEntry?: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onNewEntry,
  onViewEntries,
  onViewAnalysis,
  onViewSettings,
  onQuickEntry,
}) => {
  const { needsOnboarding, completeOnboarding, isLoading: onboardingLoading } = useOnboarding();
  const [showQuickEntry, setShowQuickEntry] = useState(false);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 flex flex-col">
      <div className="absolute top-4 right-4 z-10">
        <LogoutButton />
      </div>
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="text-center mb-8 sm:mb-12 px-2">
          <h1 className="text-3xl sm:text-4xl font-light text-foreground mb-2">Migräne-App</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Verfolgen Sie Ihre Migräne und finden Sie Muster</p>
        </div>

        <div className="grid gap-4 sm:gap-6 w-full max-w-md px-2 sm:px-0">
          {/* New Entry Button */}
          <Card className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group border-green-200 bg-green-50 hover:bg-green-100 active:scale-[0.98] touch-manipulation mobile-touch-feedback" onClick={onNewEntry}>
            <div className="p-4 sm:p-6 text-center min-h-[4rem] sm:min-h-[6rem] flex flex-col justify-center mobile-card-compact mobile-text-compact">
              <div className="text-2xl sm:text-4xl mb-1 sm:mb-3 group-hover:scale-110 transition-transform">➕</div>
              <h3 className="text-base sm:text-xl font-semibold mb-1 text-green-700 mobile-button-text">Neuer Eintrag</h3>
              <p className="text-muted-foreground text-xs leading-tight mobile-button-text">
                Detaillierte Migräne-Dokumentation
              </p>
            </div>
          </Card>

          {/* Quick Entry Button */}
          <Card className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group border-quick-entry bg-quick-entry/10 hover:bg-quick-entry/20 active:scale-[0.98] touch-manipulation mobile-touch-feedback" onClick={() => setShowQuickEntry(true)}>
            <div className="p-4 sm:p-6 text-center min-h-[4rem] sm:min-h-[6rem] flex flex-col justify-center mobile-card-compact mobile-text-compact">
              <div className="text-2xl sm:text-4xl mb-1 sm:mb-3 group-hover:scale-110 transition-transform">🔴</div>
              <h3 className="text-base sm:text-xl font-semibold mb-1 text-quick-entry mobile-button-text">Schnelleintrag</h3>
              <p className="text-muted-foreground text-xs leading-tight mobile-button-text">
                Sofortige Migräne-Erfassung
              </p>
            </div>
          </Card>

          {/* View Entries Button */}
          <Card className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group active:scale-[0.98] touch-manipulation mobile-touch-feedback" onClick={onViewEntries}>
            <div className="p-4 sm:p-6 text-center min-h-[4rem] sm:min-h-[6rem] flex flex-col justify-center mobile-card-compact mobile-text-compact">
              <div className="text-2xl sm:text-4xl mb-1 sm:mb-3 group-hover:scale-110 transition-transform">📋</div>
              <h3 className="text-base sm:text-xl font-semibold mb-1 mobile-button-text">Verlauf</h3>
              <p className="text-muted-foreground text-xs leading-tight mobile-button-text">
                Letzte Einträge anzeigen und bearbeiten
              </p>
            </div>
          </Card>

          {/* Analysis Button */}
          <Card className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group active:scale-[0.98] touch-manipulation mobile-touch-feedback" onClick={onViewAnalysis}>
            <div className="p-4 sm:p-6 text-center min-h-[4rem] sm:min-h-[6rem] flex flex-col justify-center mobile-card-compact mobile-text-compact">
              <div className="text-2xl sm:text-4xl mb-1 sm:mb-3 group-hover:scale-110 transition-transform">📊</div>
              <h3 className="text-base sm:text-xl font-semibold mb-1 mobile-button-text">Auswertungen</h3>
              <p className="text-muted-foreground text-xs leading-tight mobile-button-text">
                Trends, Korrelationen und PDF-Berichte
              </p>
            </div>
          </Card>

          {/* Settings Button */}
          <Card className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group active:scale-[0.98] touch-manipulation mobile-touch-feedback" onClick={onViewSettings}>
            <div className="p-4 sm:p-6 text-center min-h-[4rem] sm:min-h-[6rem] flex flex-col justify-center mobile-card-compact mobile-text-compact">
              <div className="text-2xl sm:text-4xl mb-1 sm:mb-3 group-hover:scale-110 transition-transform">⚙️</div>
              <h3 className="text-base sm:text-xl font-semibold mb-1 mobile-button-text">Einstellungen</h3>
              <p className="text-muted-foreground text-xs leading-tight mobile-button-text">
                Medikamente, Profile und Konfiguration
              </p>
            </div>
          </Card>
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
        onClose={() => setShowQuickEntry(false)}
        onSuccess={() => {
          setShowQuickEntry(false);
          onQuickEntry?.();
        }}
      />
    </div>
  );
};