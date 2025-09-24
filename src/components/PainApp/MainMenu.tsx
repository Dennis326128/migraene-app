import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, History, TrendingUp, Settings } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";

interface MainMenuProps {
  onNewEntry: () => void;
  onViewEntries: () => void;
  onViewAnalysis: () => void;
  onViewSettings: () => void;
}

export const MainMenu = ({ onNewEntry, onViewEntries, onViewAnalysis, onViewSettings }: MainMenuProps) => {
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

          <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border/50 shadow-lg">
            <Button
              onClick={onViewAnalysis}
              variant="secondary"
              size="lg"
              className="w-full h-16 text-secondary-foreground font-medium text-lg rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <TrendingUp className="w-6 h-6 mr-3" />
              Auswertungen & Berichte
            </Button>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border/50 shadow-lg">
            <Button
              onClick={onViewSettings}
              variant="outline"
              size="lg"
              className="w-full h-16 font-medium text-lg rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Settings className="w-6 h-6 mr-3" />
              Einstellungen
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
