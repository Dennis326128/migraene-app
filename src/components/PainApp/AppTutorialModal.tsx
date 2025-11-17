import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sparkles,
  Edit3,
  List,
  BarChart3,
  Pill,
  Mic,
  Bell,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";

interface TutorialStep {
  icon: any;
  emoji: string;
  title: string;
  description: string;
  details: string[];
}

const tutorialSteps: TutorialStep[] = [
  {
    icon: Sparkles,
    emoji: "🎉",
    title: "Willkommen!",
    description: "Schön, dass du da bist! Lass uns gemeinsam entdecken, wie du deine App am besten nutzt.",
    details: [
      "Diese Tour zeigt dir alle wichtigen Funktionen",
      "Du kannst sie jederzeit in den Einstellungen wiederholen",
    ],
  },
  {
    icon: Edit3,
    emoji: "✏️",
    title: "Einträge erfassen",
    description: "Erfasse deine Schmerzeinträge auf drei verschiedene Arten:",
    details: [
      "📝 Detailliert: Alle Infos präzise festhalten",
      "⚡ Schnell: Mit nur 2 Klicks einen Eintrag erstellen",
      "🎙️ Voice: Einfach sprechen statt tippen",
    ],
  },
  {
    icon: List,
    emoji: "📋",
    title: "Einträge verwalten",
    description: "Behalte den Überblick über alle deine Einträge:",
    details: [
      "Alle Einträge in chronologischer Reihenfolge",
      "Bearbeiten oder löschen mit einem Tap",
      "PDF-Export für deinen Arzt",
    ],
  },
  {
    icon: BarChart3,
    emoji: "📊",
    title: "Analysen nutzen",
    description: "Erkenne Muster und Zusammenhänge in deinen Daten:",
    details: [
      "Visualisierung deiner Schmerzhäufigkeit",
      "Wetter-Korrelationen erkennen",
      "Medikamenten-Wirksamkeit bewerten",
    ],
  },
  {
    icon: Pill,
    emoji: "💊",
    title: "Medikamente tracken",
    description: "Verwalte deine Medikamente intelligent:",
    details: [
      "Eigene Medikamente-Bibliothek anlegen",
      "Limits setzen zur Übermedikations-Vermeidung",
      "Warnungen bei Grenzwert-Überschreitung",
    ],
  },
  {
    icon: Mic,
    emoji: "🎙️",
    title: "Voice-Funktionen",
    description: "Sprechen statt tippen – schneller und bequemer:",
    details: [
      "Schmerzeinträge per Sprache erstellen",
      "Voice-Notizen für zusätzliche Details",
      "Erinnerungen per Voice einrichten",
    ],
  },
  {
    icon: Bell,
    emoji: "🔔",
    title: "Erinnerungen",
    description: "Vergiss nie wieder deine Medikamente:",
    details: [
      "Flexible Wiederholungen (täglich, wöchentlich, etc.)",
      "Push-Benachrichtigungen aktivieren",
      "Medikamente direkt zuordnen",
    ],
  },
  {
    icon: Check,
    emoji: "✅",
    title: "Fertig!",
    description: "Du bist jetzt bereit, die App voll zu nutzen!",
    details: [
      "Du findest diese Tour jederzeit wieder unter:",
      "⚙️ Einstellungen → Hilfe & Tutorial",
      "Viel Erfolg beim Tracking! 💪",
    ],
  },
];

interface AppTutorialModalProps {
  open: boolean;
  onComplete: () => void;
  canSkip?: boolean;
}

export const AppTutorialModal = ({ open, onComplete, canSkip = true }: AppTutorialModalProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const isMobile = useIsMobile();

  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;
  const step = tutorialSteps[currentStep];
  const Icon = step.icon;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tutorialSteps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={canSkip ? handleSkip : undefined}>
      <DialogContent 
        className={cn(
          "max-w-lg p-0 gap-0 overflow-hidden",
          isMobile && "max-w-[95vw]",
          !canSkip && "[&>button]:hidden"
        )}
      >
        {/* Progress Bar */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground font-medium">
              Schritt {currentStep + 1} von {tutorialSteps.length}
            </span>
            {canSkip && !isLastStep && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="h-auto p-0 hover:bg-transparent text-muted-foreground"
              >
                Überspringen
              </Button>
            )}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Content */}
        <div className={cn("px-6 py-8", isMobile && "px-4 py-6")}>
          <Card
            className={cn(
              "p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20",
              isMobile && "p-4"
            )}
          >
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                <div className="relative bg-background rounded-full p-4">
                  <Icon className="h-12 w-12 text-primary" />
                </div>
              </div>
            </div>

            {/* Title with Emoji */}
            <div className="text-center mb-4">
              <span className="text-4xl mb-2 block">{step.emoji}</span>
              <h2 className={cn(
                "font-bold text-foreground",
                isMobile ? "text-xl" : "text-2xl"
              )}>
                {step.title}
              </h2>
            </div>

            {/* Description */}
            <p className={cn(
              "text-center text-foreground/80 mb-6",
              isMobile ? "text-sm" : "text-base"
            )}>
              {step.description}
            </p>

            {/* Details */}
            <div className="space-y-3">
              {step.details.map((detail, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 text-sm text-muted-foreground bg-background/50 rounded-lg p-3"
                >
                  <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Navigation */}
        <div className={cn(
          "flex items-center justify-between gap-3 px-6 pb-6",
          isMobile && "px-4 pb-4"
        )}>
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={isFirstStep}
            className={cn(isMobile && "px-3")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>

          <Button
            onClick={handleNext}
            className={cn(
              "flex-1 max-w-[200px]",
              isMobile && "max-w-[150px]"
            )}
          >
            {isLastStep ? (
              <>
                Fertig
                <Check className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Weiter
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
