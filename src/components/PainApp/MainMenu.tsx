import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, History, TrendingUp, Settings } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { QuickEntryModal } from "./QuickEntryModal";

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

  return (
    <div className="min-h-screen bg-background p-6 flex flex-col">
      <div className="absolute top-4 right-4">
        <LogoutButton />
      </div>
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light text-foreground mb-2">Migräne-App</h1>
          <p className="text-muted-foreground">Verfolgen Sie Ihre Migräne und finden Sie Muster</p>
        </div>

        <div className="grid gap-6 w-full max-w-md">
          {/* Quick Entry Button - RED EMERGENCY STYLE */}
          <Card 
            className="hover:shadow-lg transition-all cursor-pointer group border-destructive bg-destructive/5 hover:bg-destructive/10" 
            onClick={() => setQuickEntryOpen(true)}
          >
            <div className="p-6 text-center">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">🚨</div>
              <h3 className="text-xl font-semibold mb-2 text-destructive">Schnelleintrag</h3>
              <p className="text-muted-foreground text-sm">
                Sofortige Tabletteneinnahme dokumentieren (&lt; 30 Sek.)
              </p>
            </div>
          </Card>

          {/* New Entry Button */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={onNewEntry}>
            <div className="p-6 text-center">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">➕</div>
              <h3 className="text-xl font-semibold mb-2">Neuer Eintrag</h3>
              <p className="text-muted-foreground text-sm">
                Detaillierte Migräne-Dokumentation mit allen Symptomen
              </p>
            </div>
          </Card>

          {/* View Entries Button */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={onViewEntries}>
            <div className="p-6 text-center">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">📋</div>
              <h3 className="text-xl font-semibold mb-2">Verlauf</h3>
              <p className="text-muted-foreground text-sm">
                Letzte Einträge anzeigen und bearbeiten
              </p>
            </div>
          </Card>

          {/* Analysis Button */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={onViewAnalysis}>
            <div className="p-6 text-center">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">📊</div>
              <h3 className="text-xl font-semibold mb-2">Auswertungen</h3>
              <p className="text-muted-foreground text-sm">
                Trends, Korrelationen und PDF-Berichte
              </p>
            </div>
          </Card>

          {/* Settings Button */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={onViewSettings}>
            <div className="p-6 text-center">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">⚙️</div>
              <h3 className="text-xl font-semibold mb-2">Einstellungen</h3>
              <p className="text-muted-foreground text-sm">
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
    </div>
  );
};