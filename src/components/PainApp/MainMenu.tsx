import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, History, TrendingUp, Settings } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { QuickEntryModal } from "./QuickEntryModal";
import { WelcomeModal } from "./WelcomeModal";
import { useShouldShowMigration } from "@/hooks/useMigrationStatus";
import { useOnboarding } from "@/hooks/useOnboarding";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database } from "lucide-react";

interface MainMenuProps {
  onNewEntry: () => void;
  onViewEntries: () => void;
  onViewAnalysis: () => void;
  onViewSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onNewEntry,
  onViewEntries,
  onViewAnalysis,
  onViewSettings,
}) => {
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const shouldShowMigration = useShouldShowMigration();
  const { needsOnboarding, completeOnboarding, isLoading: onboardingLoading } = useOnboarding();

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

        {/* Migration Alert */}
        {shouldShowMigration && (
          <Alert className="mb-4 border-orange-200">
            <Database className="h-4 w-4" />
            <AlertDescription>
              <strong>System-Update verfügbar!</strong> Ihre Daten können zum verbesserten Event-System migriert werden.
              <Button variant="link" onClick={onViewAnalysis} className="p-0 h-auto ml-2">
                Jetzt aktualisieren →
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:gap-6 w-full max-w-md px-2 sm:px-0">
          {/* Quick Entry Button - Mobile Optimized */}
          <Card 
            className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group border-destructive bg-destructive/5 hover:bg-destructive/10 active:scale-[0.98] touch-manipulation" 
            onClick={() => setQuickEntryOpen(true)}
          >
            <div className="p-5 sm:p-6 text-center min-h-[5rem] sm:min-h-[6rem] flex flex-col justify-center">
              <div className="text-3xl sm:text-4xl mb-2 sm:mb-3 group-hover:scale-110 transition-transform">🚨</div>
              <h3 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2 text-destructive">Schnelleintrag</h3>
              <p className="text-muted-foreground text-xs sm:text-sm leading-tight">
                Sofortige Tabletteneinnahme dokumentieren (&lt; 30 Sek.)
              </p>
            </div>
          </Card>

          {/* New Entry Button */}
          <Card className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group active:scale-[0.98] touch-manipulation" onClick={onNewEntry}>
            <div className="p-5 sm:p-6 text-center min-h-[5rem] sm:min-h-[6rem] flex flex-col justify-center">
              <div className="text-3xl sm:text-4xl mb-2 sm:mb-3 group-hover:scale-110 transition-transform">➕</div>
              <h3 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">Neuer Eintrag</h3>
              <p className="text-muted-foreground text-xs sm:text-sm leading-tight">
                Detaillierte Migräne-Dokumentation mit allen Symptomen
              </p>
            </div>
          </Card>

          {/* View Entries Button */}
          <Card className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group active:scale-[0.98] touch-manipulation" onClick={onViewEntries}>
            <div className="p-5 sm:p-6 text-center min-h-[5rem] sm:min-h-[6rem] flex flex-col justify-center">
              <div className="text-3xl sm:text-4xl mb-2 sm:mb-3 group-hover:scale-110 transition-transform">📋</div>
              <h3 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">Verlauf</h3>
              <p className="text-muted-foreground text-xs sm:text-sm leading-tight">
                Letzte Einträge anzeigen und bearbeiten
              </p>
            </div>
          </Card>

          {/* Analysis Button */}
          <Card className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group active:scale-[0.98] touch-manipulation" onClick={onViewAnalysis}>
            <div className="p-5 sm:p-6 text-center min-h-[5rem] sm:min-h-[6rem] flex flex-col justify-center">
              <div className="text-3xl sm:text-4xl mb-2 sm:mb-3 group-hover:scale-110 transition-transform">📊</div>
              <h3 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">Auswertungen</h3>
              <p className="text-muted-foreground text-xs sm:text-sm leading-tight">
                Trends, Korrelationen und PDF-Berichte
              </p>
            </div>
          </Card>

          {/* Settings Button */}
          <Card className="hover:shadow-lg active:shadow-xl transition-all cursor-pointer group active:scale-[0.98] touch-manipulation" onClick={onViewSettings}>
            <div className="p-5 sm:p-6 text-center min-h-[5rem] sm:min-h-[6rem] flex flex-col justify-center">
              <div className="text-3xl sm:text-4xl mb-2 sm:mb-3 group-hover:scale-110 transition-transform">⚙️</div>
              <h3 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">Einstellungen</h3>
              <p className="text-muted-foreground text-xs sm:text-sm leading-tight">
                Medikamente, Profile und Konfiguration
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Quick Entry Modal */}
      <QuickEntryModal 
        open={quickEntryOpen} 
        onOpenChange={setQuickEntryOpen} 
      />

      {/* Welcome/Onboarding Modal */}
      {!onboardingLoading && (
        <WelcomeModal 
          open={needsOnboarding} 
          onComplete={completeOnboarding} 
        />
      )}
    </div>
  );
};