import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, ChevronLeft, Check, Sparkles, User, Settings, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

const symptoms = [
  { id: "lichtempfindlichkeit", name: "Lichtempfindlichkeit", icon: "💡", common: true },
  { id: "geraeuschempfindlichkeit", name: "Geräuschempfindlichkeit", icon: "🔊", common: true },
  { id: "uebelkeit", name: "Übelkeit", icon: "🤢", common: true },
  { id: "erbrechen", name: "Erbrechen", icon: "🤮", common: false },
  { id: "schwindel", name: "Schwindel", icon: "💫", common: false },
  { id: "muedigkeit", name: "Müdigkeit", icon: "😴", common: true },
  { id: "sehstoerungen", name: "Sehstörungen/Aura", icon: "👁️", common: false },
  { id: "konzentrationsstoerungen", name: "Konzentrationsstörungen", icon: "🧠", common: true },
  { id: "nackenverspannungen", name: "Nackenverspannungen", icon: "💆", common: true },
  { id: "geruchsempfindlichkeit", name: "Geruchsempfindlichkeit", icon: "👃", common: false },
];

const steps = [
  { id: "welcome", title: "Willkommen", icon: Sparkles },
  { id: "profile", title: "Profil", icon: User },
  { id: "symptoms", title: "Symptome", icon: Settings },
  { id: "ready", title: "Fertig", icon: Target },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ open, onComplete }) => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [quickEntryMode, setQuickEntryMode] = useState(true);
  const [notesLayout, setNotesLayout] = useState<"single" | "split">("single");
  const [isCompleting, setIsCompleting] = useState(false);

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleSymptomToggle = (symptomId: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(symptomId) 
        ? prev.filter(id => id !== symptomId)
        : [...prev, symptomId]
    );
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Kein User gefunden");

      // Update user profile with onboarding data
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: user.id,
          default_symptoms: selectedSymptoms,
          quick_entry_mode: quickEntryMode,
          notes_layout: notesLayout,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "🎉 Einrichtung abgeschlossen!",
        description: "Ihre persönlichen Einstellungen wurden gespeichert.",
      });

      onComplete();
    } catch (error) {
      console.error('Onboarding error:', error);
      toast({
        title: "❌ Fehler beim Speichern",
        description: "Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Welcome
        return (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4">🧠</div>
            <div>
              <h3 className="text-2xl font-bold mb-2">Willkommen bei Ihrer Migräne-App</h3>
              <p className="text-muted-foreground">
                Lassen Sie uns Ihre App personalisieren, um Ihnen die bestmögliche Erfahrung zu bieten.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                ✨ Personalisierte Symptom-Profile<br/>
                ⚡ Schnelleintrag-Optimierung<br/>
                📊 Intelligente Analyse-Tools
              </p>
            </div>
          </div>
        );

      case 1: // Profile
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-bold mb-2">App-Konfiguration</h3>
              <p className="text-muted-foreground">
                Wie möchten Sie die App verwenden?
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">Schnelleintrag bevorzugen</Label>
                      <p className="text-sm text-muted-foreground">
                        Bevorzugen Sie schnelle Eingaben oder detaillierte Dokumentation?
                      </p>
                    </div>
                    <Checkbox
                      checked={quickEntryMode}
                      onCheckedChange={(checked) => setQuickEntryMode(!!checked)}
                    />
                  </div>

                  <Separator />

                  <div>
                    <Label className="font-medium block mb-3">Notizen-Layout</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant={notesLayout === "single" ? "default" : "outline"}
                        onClick={() => setNotesLayout("single")}
                        className="h-auto p-4 flex-col"
                      >
                        <div className="text-2xl mb-2">📝</div>
                        <div className="text-center">
                          <div className="font-medium">Ein Textfeld</div>
                          <div className="text-xs text-muted-foreground">Einfach & schnell</div>
                        </div>
                      </Button>

                      <Button
                        type="button"
                        variant={notesLayout === "split" ? "default" : "outline"}
                        onClick={() => setNotesLayout("split")}
                        className="h-auto p-4 flex-col"
                      >
                        <div className="text-2xl mb-2">📋</div>
                        <div className="text-center">
                          <div className="font-medium">Getrennte Felder</div>
                          <div className="text-xs text-muted-foreground">Symptome + Auslöser</div>
                        </div>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 2: // Symptoms
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-bold mb-2">Standard-Symptome</h3>
              <p className="text-muted-foreground">
                Welche Symptome treten bei Ihnen <strong>meistens</strong> auf?
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Diese werden automatisch vorausgewählt, um Eingaben zu beschleunigen.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">Häufige Symptome</h4>
                <div className="grid grid-cols-1 gap-2">
                  {symptoms.filter(s => s.common).map((symptom) => (
                    <Card key={symptom.id} className={selectedSymptoms.includes(symptom.id) ? "border-primary bg-primary/5" : ""}>
                      <CardContent className="p-3">
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            checked={selectedSymptoms.includes(symptom.id)}
                            onCheckedChange={() => handleSymptomToggle(symptom.id)}
                          />
                          <span className="text-xl">{symptom.icon}</span>
                          <span className="font-medium flex-1">{symptom.name}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">Weitere Symptome</h4>
                <div className="grid grid-cols-1 gap-2">
                  {symptoms.filter(s => !s.common).map((symptom) => (
                    <Card key={symptom.id} className={selectedSymptoms.includes(symptom.id) ? "border-primary bg-primary/5" : ""}>
                      <CardContent className="p-3">
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            checked={selectedSymptoms.includes(symptom.id)}
                            onCheckedChange={() => handleSymptomToggle(symptom.id)}
                          />
                          <span className="text-xl">{symptom.icon}</span>
                          <span className="font-medium flex-1">{symptom.name}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-info/10 rounded-lg p-3">
              <p className="text-sm text-info-foreground">
                💡 <strong>Ausgewählt:</strong> {selectedSymptoms.length} Symptome<br/>
                Sie können diese später in den Einstellungen ändern.
              </p>
            </div>
          </div>
        );

      case 3: // Ready
        return (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4">🎉</div>
            <div>
              <h3 className="text-2xl font-bold mb-2">Alles bereit!</h3>
              <p className="text-muted-foreground">
                Ihre App ist jetzt personalisiert und einsatzbereit.
              </p>
            </div>

            <div className="bg-muted/30 rounded-lg p-4 text-left">
              <h4 className="font-medium mb-3">Ihre Konfiguration:</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Eingabe-Modus:</span>
                  <span className="font-medium">{quickEntryMode ? "Schnell" : "Detailliert"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Notizen-Layout:</span>
                  <span className="font-medium">{notesLayout === "single" ? "Ein Feld" : "Getrennt"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Standard-Symptome:</span>
                  <span className="font-medium">{selectedSymptoms.length} ausgewählt</span>
                </div>
              </div>
            </div>

            <div className="bg-success/10 rounded-lg p-3">
              <p className="text-sm text-success-foreground">
                🚨 <strong>Tipp:</strong> Nutzen Sie den roten "Schnelleintrag"-Button für die schnelle Medikamenten-Dokumentation!
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden modern-scrollbar">{/* onOpenChange disabled to prevent closing */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <currentStepData.icon className="w-5 h-5" />
            {currentStepData.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Schritt {currentStep + 1} von {steps.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>

          {/* Step Content */}
          {renderStepContent()}

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0 || isCompleting}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Zurück
            </Button>

            {currentStep === steps.length - 1 ? (
              <Button
                onClick={handleComplete}
                disabled={isCompleting}
                className="min-w-32"
              >
                {isCompleting ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    App starten
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                disabled={isCompleting}
              >
                Weiter
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};