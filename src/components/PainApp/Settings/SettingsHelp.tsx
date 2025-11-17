import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppTutorial } from "@/hooks/useAppTutorial";
import { AppTutorialModal } from "../AppTutorialModal";

export const SettingsHelp = () => {
  const isMobile = useIsMobile();
  const { showTutorial, startTutorial, completeTutorial, setShowTutorial } = useAppTutorial();

  return (
    <div className="space-y-4">
      {/* App-Tour Card */}
      <Card className={cn(
        "p-6 bg-gradient-to-br from-primary/10 to-primary/5",
        isMobile && "p-4"
      )}>
        <div className="flex items-start gap-4">
          <div className={cn(
            "shrink-0 rounded-full bg-background p-3",
            isMobile && "p-2"
          )}>
            <GraduationCap className={cn(
              "text-primary",
              isMobile ? "h-5 w-5" : "h-6 w-6"
            )} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-semibold text-foreground mb-2",
              isMobile ? "text-base" : "text-lg"
            )}>
              App-Tour
            </h3>
            <p className={cn(
              "text-muted-foreground mb-4",
              isMobile ? "text-xs" : "text-sm"
            )}>
              Möchtest du alle App-Funktionen noch einmal kennenlernen? 
              Die interaktive Tour führt dich Schritt für Schritt durch alle wichtigen Features.
            </p>
            <Button
              onClick={startTutorial}
              className="w-full sm:w-auto"
              size={isMobile ? "sm" : "default"}
            >
              <GraduationCap className="h-4 w-4 mr-2" />
              App-Tour starten
            </Button>
          </div>
        </div>
      </Card>

      {/* Quick Tips Card */}
      <Card className={cn(
        "p-6 bg-gradient-to-br from-secondary/10 to-secondary/5",
        isMobile && "p-4"
      )}>
        <div className="flex items-start gap-4">
          <div className={cn(
            "shrink-0 rounded-full bg-background p-3",
            isMobile && "p-2"
          )}>
            <BookOpen className={cn(
              "text-secondary",
              isMobile ? "h-5 w-5" : "h-6 w-6"
            )} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-semibold text-foreground mb-2",
              isMobile ? "text-base" : "text-lg"
            )}>
              Schnelltipps
            </h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                <p className={cn(
                  "text-muted-foreground",
                  isMobile ? "text-xs" : "text-sm"
                )}>
                  <strong>Voice-Eingabe:</strong> Lange auf den Mikrofon-Button drücken
                </p>
              </div>
              <div className="flex items-start gap-2">
                <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                <p className={cn(
                  "text-muted-foreground",
                  isMobile ? "text-xs" : "text-sm"
                )}>
                  <strong>Quick-Entry:</strong> Perfekt für unterwegs – nur 2 Klicks
                </p>
              </div>
              <div className="flex items-start gap-2">
                <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                <p className={cn(
                  "text-muted-foreground",
                  isMobile ? "text-xs" : "text-sm"
                )}>
                  <strong>PDF-Export:</strong> Ideal für Arztbesuche (in Eintragsübersicht)
                </p>
              </div>
              <div className="flex items-start gap-2">
                <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                <p className={cn(
                  "text-muted-foreground",
                  isMobile ? "text-xs" : "text-sm"
                )}>
                  <strong>Medikamenten-Limits:</strong> Schützt dich vor Übermedikation
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* FAQ/Support Card */}
      <Card className={cn(
        "p-6 bg-gradient-to-br from-accent/10 to-accent/5",
        isMobile && "p-4"
      )}>
        <div className="flex items-start gap-4">
          <div className={cn(
            "shrink-0 rounded-full bg-background p-3",
            isMobile && "p-2"
          )}>
            <HelpCircle className={cn(
              "text-accent",
              isMobile ? "h-5 w-5" : "h-6 w-6"
            )} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-semibold text-foreground mb-2",
              isMobile ? "text-base" : "text-lg"
            )}>
              Weitere Hilfe
            </h3>
            <p className={cn(
              "text-muted-foreground",
              isMobile ? "text-xs" : "text-sm"
            )}>
              Hast du Fragen oder Probleme? Die App wird kontinuierlich weiterentwickelt.
              Bei technischen Problemen schaue bitte in die Einstellungen unter "Datenschutz & Sicherheit" 
              für Support-Kontaktmöglichkeiten.
            </p>
          </div>
        </div>
      </Card>

      {/* Tutorial Modal */}
      <AppTutorialModal
        open={showTutorial}
        onComplete={completeTutorial}
        canSkip={true}
      />
    </div>
  );
};
