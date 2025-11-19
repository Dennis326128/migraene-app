import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Bell,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Heart,
  BarChart3
} from "lucide-react";

interface TutorialStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  highlights: string[];
  benefit: string;
}

const tutorialSteps: TutorialStep[] = [
  {
    id: "welcome",
    icon: <Heart className="w-10 h-10 text-primary" />,
    title: "Willkommen bei deinem Migräne-Begleiter",
    description: "Diese kurze Tour zeigt dir, wie die App dich im Alltag mit Migräne unterstützen kann.",
    highlights: [
      "Dokumentiere Migräne-Episoden schnell und einfach",
      "Erhalte Auswertungen und erkenne mögliche Muster",
      "Behalte Medikamente, Termine und Berichte im Blick"
    ],
    benefit: "Alle wichtigen Informationen an einem Ort – für dich und deine Behandlung."
  },
  {
    id: "diary",
    icon: <BookOpen className="w-10 h-10 text-primary" />,
    title: "Migräne-Tagebuch führen",
    description: "Erfasse deine Migräne-Episoden strukturiert und vollständig.",
    highlights: [
      "Schmerzstärke, Symptome und Medikamente in einem Eintrag erfassen",
      "Notizen zu Alltag und möglichen Auslösern ergänzen",
      "So entsteht nach und nach ein vollständiges Bild deiner Migräne"
    ],
    benefit: "Hilfreich für deine eigene Übersicht und für Arztgespräche."
  },
  {
    id: "reminders",
    icon: <Bell className="w-10 h-10 text-primary" />,
    title: "Erinnerungen & Termine",
    description: "Verpasse keine wichtige Medikamenteneinnahme oder Arzttermine mehr.",
    highlights: [
      "Erhalte Erinnerungen für Medikamente und Arzttermine zur richtigen Zeit",
      "Flexible Wiederholungen – täglich, wöchentlich oder individuell angepasst"
    ],
    benefit: "So verpasst du keine wichtige Einnahme oder Untersuchung."
  },
  {
    id: "analysis",
    icon: <BarChart3 className="w-10 h-10 text-primary" />,
    title: "Auswertungen, Wetter & Muster",
    description: "Die App analysiert deine Einträge und zeigt dir verständliche Auswertungen.",
    highlights: [
      "Die App wertet deine Migräne-Daten automatisch aus und erstellt verständliche Diagramme",
      "KI analysiert Zusammenhänge zwischen deinen Episoden, Wetter und möglichen Auslösern"
    ],
    benefit: "Datenbasierte Einblicke – für besseres Verständnis und gezielte Gespräche mit Ärzten."
  },
  {
    id: "reports",
    icon: <FileText className="w-10 h-10 text-primary" />,
    title: "Arzt-Reports & Kopfschmerztagebuch",
    description: "Erstelle mit wenigen Klicks Berichte für deine Arztpraxis oder Krankenkasse.",
    highlights: [
      "Automatisch aus deinen Einträgen zusammengestellt",
      "Individuell nach Zeitraum und Inhalt anpassbar",
      "Als PDF exportieren und direkt teilen"
    ],
    benefit: "Spart Zeit im Arztgespräch und erleichtert die Kommunikation mit deiner Krankenkasse."
  },
  {
    id: "ready",
    icon: <Sparkles className="w-10 h-10 text-primary" />,
    title: "Du bist startklar!",
    description: "Nutze die App als täglichen Begleiter im Umgang mit deiner Migräne.",
    highlights: [
      "Trage alles ein, was dir auffällt – auch Kleinigkeiten helfen bei der Analyse",
      "Die App erfasst automatisch Wetter und verknüpft es mit deinen Episoden",
      "Nutze deine Auswertungen, um Muster und Auslöser zu erkennen"
    ],
    benefit: "Mehr Klarheit über deine Migräne – für mehr Kontrolle und Lebensqualität im Alltag."
  }
];

interface AppTutorialModalProps {
  open: boolean;
  onComplete: () => void;
  canSkip?: boolean;
}

export function AppTutorialModal({ open, onComplete, canSkip = true }: AppTutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;
  const step = tutorialSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onComplete(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <Badge variant="secondary" className="text-xs">
              Schritt {currentStep + 1} von {tutorialSteps.length}
            </Badge>
            {canSkip && !isLastStep && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Überspringen
              </Button>
            )}
          </div>
          <Progress value={progress} className="h-1.5" />
        </DialogHeader>

        <div className="py-6 space-y-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 rounded-full bg-primary/10">
              {step.icon}
            </div>
            
            <div className="space-y-2">
              <DialogTitle className="text-2xl font-bold">{step.title}</DialogTitle>
              <DialogDescription className="text-base text-muted-foreground max-w-md">
                {step.description}
              </DialogDescription>
            </div>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            {step.highlights.map((highlight, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <p className="text-sm leading-relaxed">{highlight}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <BarChart3 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{step.benefit}</p>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          {!isFirstStep && (
            <Button
              variant="outline"
              onClick={handlePrevious}
              className="flex-1"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Zurück
            </Button>
          )}
          <Button
            onClick={handleNext}
            className="flex-1"
          >
            {isLastStep ? (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Loslegen
              </>
            ) : (
              <>
                Weiter
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
