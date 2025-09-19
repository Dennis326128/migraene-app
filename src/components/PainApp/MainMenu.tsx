import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, History, TrendingUp } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";

interface MainMenuProps {
  onNewEntry: () => void;
  onViewEntries: () => void;
  onViewAnalysis: () => void;
}

export const MainMenu = ({ onNewEntry, onViewEntries }: MainMenuProps) => {
  return (
    <div className="min-h-screen bg-background p-6 flex flex-col">
      <div className="absolute top-4 right-4">
        <LogoutButton />
      </div>
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light text-foreground mb-2">Schmerz-App</h1>
          <p className="text-muted-foreground">Verfolgen Sie Ihre Schmerzen und Medikamente</p>
        </div>

        <div className="space-y-6">
          <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border/50 shadow-lg">
            <Button
              onClick={onNewEntry}
              variant="default"
              size="lg"
              className="w-full h-16 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-lg rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-6 h-6 mr-3" />
              Neuer Eintrag
            </Button>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border/50 shadow-lg">
            <Button
              onClick={onViewEntries}
              variant="secondary"
              size="lg"
              className="w-full h-16 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium text-lg rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <History className="w-6 h-6 mr-3" />
              Letzte Einträge
            </Button>
          </Card>

          {/* Analyse-Karte deaktiviert */}
          <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border/50 shadow-lg opacity-50">
            <Button
              disabled
              variant="secondary"
              size="lg"
              className="w-full h-16 text-secondary-foreground font-medium text-lg rounded-xl"
            >
              <TrendingUp className="w-6 h-6 mr-3" />
              Auswertungen & Berichte (bald verfügbar 🚧)
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
