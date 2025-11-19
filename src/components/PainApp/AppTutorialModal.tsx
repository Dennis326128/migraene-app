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
  Activity, 
  Bell,
  Brain,
  CloudSun,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles
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
    icon: <Sparkles className="w-10 h-10 text-primary" />,
    title: "Willkommen bei deinem Migräne-Begleiter",
    description: "Diese App unterstützt dich dabei, deine Migräne besser zu verstehen und deinen Alltag zu strukturieren.",
    highlights: [
      "Dokumentiere Migräne-Episoden schnell und einfach",
      "Erkenne Muster und Zusammenhänge",
      "Behalte den Überblick über Medikamente und Termine"
    ],
    benefit: "Alle wichtigen Informationen an einem Ort – für dich und dein Behandlungsteam."
  },
  {
    id: "entries",
    icon: <BookOpen className="w-10 h-10 text-primary" />,
    title: "Migräne-Tagebuch führen",
    description: "Erfasse deine Migräne-Episoden mit allen wichtigen Details.",
    highlights: [
      "Schmerzintensität und betroffene Bereiche dokumentieren",
      "Aura-Symptome und Begleitsymptome festhalten",
      "Eingenommene Medikamente und deren Wirkung notieren",
      "Notizen zu möglichen Auslösern hinzufügen"
    ],
    benefit: "Ein vollständiges Bild deiner Migräne – hilfreich für Arztgespräche und deine eigene Übersicht."
  },
  {
    id: "weather",
    icon: <CloudSun className="w-10 h-10 text-primary" />,
    title: "Wetter-Zusammenhänge erkennen",
    description: "Die App erfasst automatisch Wetterdaten und verknüpft sie mit deinen Einträgen.",
    highlights: [
      "Luftdruck, Temperatur und weitere Faktoren werden gespeichert",
      "Mögliche Zusammenhänge zwischen Wetter und Migräne werden sichtbar",
      "Wetterbasierte Muster in Auswertungen erkennen"
    ],
    benefit: "Verstehe, ob Wetter bei deiner Migräne eine Rolle spielt – automatisch und ohne Aufwand."
  },
  {
    id: "reminders",
    icon: <Bell className="w-10 h-10 text-primary" />,
    title: "Erinnerungen & Termine",
    description: "Verpasse keine wichtigen Medikamente oder Arzttermine mehr.",
    highlights: [
      "Medikamenten-Erinnerungen mit flexiblen Wiederholungen",
      "Arzttermine und Check-ups planen",
      "Push-Benachrichtigungen zur richtigen Zeit",
      "Übersicht über erledigte und anstehende Erinnerungen"
    ],
    benefit: "Deine Behandlung im Griff – strukturiert und zuverlässig."
  },
  {
    id: "statistics",
    icon: <Activity className="w-10 h-10 text-primary" />,
    title: "Statistiken & Auswertungen",
    description: "Erkenne Muster in deinen Migräne-Episoden durch übersichtliche Statistiken.",
    highlights: [
      "Häufigkeit und Intensität deiner Migräne visualisieren",
      "Zeitliche Verteilung und Trends erkennen",
      "Zusammenhänge zwischen Symptomen, Medikamenten und Wetter",
      "Filterbare Zeiträume für detaillierte Analysen"
    ],
    benefit: "Datenbasierte Einblicke – für besseres Verständnis und gezielte Gespräche mit Ärzten."
  },
  {
    id: "ai-analysis",
    icon: <Brain className="w-10 h-10 text-primary" />,
    title: "KI-gestützte Mustererkennung",
    description: "Die App analysiert deine Daten und hilft dir, versteckte Zusammenhänge zu entdecken.",
    highlights: [
      "Automatische Analyse deiner Einträge und Sprachnotizen",
      "Erkennung von wiederkehrenden Mustern",
      "Hinweise auf mögliche Auslöser und Einflussfaktoren"
    ],
    benefit: "Intelligente Unterstützung – aber kein Ersatz für ärztliche Diagnosen."
  },
  {
    id: "reports",
    icon: <FileText className="w-10 h-10 text-primary" />,
    title: "Arzt-Reports erstellen",
    description: "Erstelle professionelle PDF-Berichte für deine Ärzte mit allen relevanten Daten.",
    highlights: [
      "Übersichtliche Zusammenfassung deiner Migräne-Episoden",
      "Statistiken, Medikamente und Symptome aufbereitet",
      "Individuell anpassbare Zeiträume und Inhalte",
      "Direkt teilbar per E-Mail oder Ausdruck"
    ],
    benefit: "Strukturierte Dokumentation – spart Zeit bei Arztbesuchen und verbessert die Behandlung."
  },
  {
    id: "finish",
    icon: <Sparkles className="w-10 h-10 text-primary" />,
    title: "Du bist startklar!",
    description: "Alle wichtigen Funktionen im Überblick. Nutze die App als täglichen Begleiter im Umgang mit Migräne.",
    highlights: [
      "Dokumentiere Episoden direkt, wenn sie auftreten",
      "Richte Erinnerungen für deine Medikamente ein",
      "Schau dir regelmäßig deine Statistiken an",
      "Die Tour kannst du jederzeit in den Einstellungen erneut starten"
    ],
    benefit: "Deine Migräne besser verstehen – für mehr Kontrolle und Lebensqualität im Alltag."
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
    <Dialog open={open} onOpenChange={() => {}}>
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
            <Activity className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
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
