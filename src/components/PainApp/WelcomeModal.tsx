import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MapPin, Pill, FileText, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAddMed } from "@/features/meds/hooks/useMeds";

interface WelcomeModalProps {
  open: boolean;
  onComplete: () => void;
}

const commonMedications = [
  { name: "Ibuprofen", dosage: "400mg" },
  { name: "Paracetamol", dosage: "500mg" },
  { name: "ASS", dosage: "500mg" },
  { name: "Sumatriptan", dosage: "50mg" },
  { name: "Rizatriptan", dosage: "10mg" },
  { name: "Metamizol", dosage: "500mg" },
];

const steps = [
  { id: "welcome", title: "Willkommen", icon: "👋" },
  { name: "setup", title: "Einrichtung", icon: "⚙️" },
  { id: "medications", title: "Medikamente", icon: "💊" },
  { id: "complete", title: "Fertig", icon: "✅" },
];

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ open, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [location, setLocation] = useState("");
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const { toast } = useToast();
  const addMedMut = useAddMed();

  const handleLocationDetection = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            // Reverse geocoding with a simple service
            const response = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=de`
            );
            const data = await response.json();
            setLocation(data.city || data.locality || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
            
            // Save to profile
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase.from('user_profiles').upsert({
                user_id: user.id,
                latitude,
                longitude
              });
            }
            
            toast({ 
              title: "Standort erkannt", 
              description: `${data.city || data.locality} wurde als Ihr Standort gespeichert.` 
            });
          } catch (error) {
            setLocation(`${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
            toast({ 
              title: "Standort gespeichert", 
              description: "Koordinaten wurden gespeichert." 
            });
          }
        },
        () => {
          toast({ 
            title: "Standort nicht verfügbar", 
            description: "Sie können den Standort später in den Einstellungen hinzufügen.",
            variant: "destructive"
          });
        }
      );
    }
  };

  const handleMedicationToggle = (medName: string) => {
    setSelectedMeds(prev => 
      prev.includes(medName) 
        ? prev.filter(m => m !== medName)
        : [...prev, medName]
    );
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      // Add selected medications
      for (const medName of selectedMeds) {
        await addMedMut.mutateAsync(medName);
      }

      // Mark onboarding as complete in user profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('user_profiles').upsert({
          user_id: user.id,
          default_symptoms: [], // Set empty array to mark onboarding complete
          quick_entry_mode: true,
          notes_layout: 'single'
        }, { onConflict: 'user_id' });
      }

      toast({ 
        title: "✅ Einrichtung abgeschlossen!", 
        description: "Willkommen bei Ihrer Migräne-App. Sie können jetzt beginnen." 
      });
      
      onComplete();
    } catch (error) {
      console.error('Onboarding error:', error);
      toast({ 
        title: "Fehler", 
        description: "Es gab ein Problem bei der Einrichtung. Versuchen Sie es erneut.",
        variant: "destructive"
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Welcome
        return (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4">🧠</div>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Willkommen bei Ihrer Migräne-App!</h2>
              <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                Diese App hilft Ihnen dabei, Ihre Migräne zu dokumentieren, Muster zu erkennen 
                und wertvolle Erkenntnisse für Ihre Behandlung zu gewinnen.
              </p>
              <div className="bg-muted/50 p-4 rounded-lg max-w-md mx-auto">
                <h3 className="font-semibold mb-2">Was Sie erwarten können:</h3>
                <ul className="text-sm space-y-1 text-left">
                  <li>📊 Detaillierte Migräne-Statistiken</li>
                  <li>🌤️ Wetterkorrelationen</li>
                  <li>💊 Medikamenten-Tracking</li>
                  <li>📱 Schnelle Eingabe-Optionen</li>
                  <li>📋 PDF-Berichte für Ihren Arzt</li>
                </ul>
              </div>
            </div>
          </div>
        );

      case 1: // Setup
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-4xl mb-3">⚙️</div>
              <h2 className="text-xl font-bold mb-2">Grundeinstellungen</h2>
              <p className="text-muted-foreground">
                Lassen Sie uns Ihre App personalisieren
              </p>
            </div>

            <Card className="p-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <Label className="font-medium">Standort für Wetterdaten</Label>
                    <p className="text-xs text-muted-foreground">
                      Ermöglicht automatische Wetterkorrelationen
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="Ihr Standort (optional)"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleLocationDetection}
                    className="shrink-0"
                  >
                    📍 Auto
                  </Button>
                </div>
                
                {location && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Standort: {location}
                  </div>
                )}
              </div>
            </Card>
          </div>
        );

      case 2: // Medications
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-4xl mb-3">💊</div>
              <h2 className="text-xl font-bold mb-2">Ihre Medikamente</h2>
              <p className="text-muted-foreground">
                Wählen Sie Medikamente aus, die Sie regelmäßig nehmen
              </p>
            </div>

            <div className="space-y-4">
              <div className="text-sm font-medium">Häufige Migräne-Medikamente:</div>
              <div className="grid gap-2">
                {commonMedications.map((med) => (
                  <Card 
                    key={med.name}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedMeds.includes(med.name) 
                        ? 'bg-primary/10 border-primary' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handleMedicationToggle(med.name)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          selectedMeds.includes(med.name) 
                            ? 'bg-primary border-primary' 
                            : 'border-muted-foreground'
                        }`}>
                          {selectedMeds.includes(med.name) && (
                            <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
                          )}
                        </div>
                        <span className="font-medium">{med.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {med.dosage}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
              
              <div className="text-xs text-muted-foreground">
                💡 Sie können jederzeit weitere Medikamente in den Einstellungen hinzufügen
              </div>
            </div>
          </div>
        );

      case 3: // Complete
        return (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4">🎉</div>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Alles bereit!</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Ihre Migräne-App ist jetzt eingerichtet und bereit zur Nutzung.
              </p>
              
              <Card className="p-4 max-w-md mx-auto">
                <h3 className="font-semibold mb-3">Erste Schritte:</h3>
                <div className="space-y-2 text-sm text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs">1</div>
                    <span>Erstellen Sie Ihren ersten Migräne-Eintrag</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs">2</div>
                    <span>Nutzen Sie den Schnelleintrag für Medikamente</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs">3</div>
                    <span>Schauen Sie nach einer Woche in die Auswertungen</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md mx-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center">
            Migräne-App Setup
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Schritt {currentStep + 1} von {steps.length}</span>
              <span>{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
            </div>
            <Progress value={((currentStep + 1) / steps.length) * 100} className="h-2" />
          </div>

          {/* Step Content */}
          <div className="min-h-[300px]">
            {renderStepContent()}
          </div>

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
              className="min-w-[80px]"
            >
              Zurück
            </Button>
            
            {currentStep < steps.length - 1 ? (
              <Button onClick={nextStep} className="min-w-[80px]">
                Weiter
              </Button>
            ) : (
              <Button 
                onClick={handleComplete} 
                disabled={isCompleting}
                className="min-w-[80px]"
              >
                {isCompleting ? "Speichere..." : "App starten"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};