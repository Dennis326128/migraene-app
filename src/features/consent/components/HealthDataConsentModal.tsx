import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Heart, FileText, AlertTriangle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useSaveHealthDataConsent } from "../hooks/useConsent";
import { useToast } from "@/hooks/use-toast";

interface HealthDataConsentModalProps {
  open: boolean;
  onConsentGiven: () => void;
  onDecline?: () => void;
}

export const HealthDataConsentModal: React.FC<HealthDataConsentModalProps> = ({
  open,
  onConsentGiven,
  onDecline,
}) => {
  const [consentChecked, setConsentChecked] = useState(false);
  const [understandChecked, setUnderstandChecked] = useState(false);
  const { toast } = useToast();
  const saveConsent = useSaveHealthDataConsent();

  const canSubmit = consentChecked && understandChecked;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      await saveConsent.mutateAsync(true);
      toast({
        title: "Einwilligung gespeichert",
        description: "Ihre Einwilligung zur Verarbeitung von Gesundheitsdaten wurde erfasst.",
      });
      onConsentGiven();
    } catch (error) {
      console.error("Error saving consent:", error);
      toast({
        title: "Fehler",
        description: "Die Einwilligung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    }
  };

  const handleDecline = () => {
    if (onDecline) {
      onDecline();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-2">
            <Shield className="h-6 w-6" />
            <span className="text-sm font-medium">Art. 9 DSGVO</span>
          </div>
          <DialogTitle className="text-xl">
            Einwilligung zur Verarbeitung von Gesundheitsdaten
          </DialogTitle>
          <DialogDescription>
            Für die Nutzung dieser App ist Ihre ausdrückliche Einwilligung erforderlich.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info Card */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Heart className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium mb-1">Welche Gesundheitsdaten werden verarbeitet?</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Schmerzintensität und -verlauf</li>
                    <li>• Symptome (Übelkeit, Lichtempfindlichkeit, etc.)</li>
                    <li>• Medikamenteneinnahme und -wirkung</li>
                    <li>• Auslöser und Begleitumstände</li>
                    <li>• Optionale Zyklusdaten</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Purpose Card */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium mb-1">Zweck der Verarbeitung</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Erfassung Ihrer Migräne-Episoden</li>
                    <li>• <strong>Automatisierte statistische Auswertung</strong> (Trends, Häufigkeiten, mögliche Zusammenhänge)</li>
                    <li>• PDF-Berichte für Arztbesuche</li>
                    <li>• Medikamenten-Tracking</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    Es werden keine Diagnosen gestellt und keine Therapie-/Medikamentenempfehlungen gegeben.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Medical Disclaimer */}
          <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                    Wichtiger Hinweis
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Diese App ersetzt keine ärztliche Beratung, Diagnose oder Behandlung.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Consent Checkboxes */}
          <div className="space-y-4 pt-2">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="consent"
                checked={consentChecked}
                onCheckedChange={(checked) => setConsentChecked(!!checked)}
                className="mt-1"
              />
              <label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
                <strong>Ich willige ausdrücklich ein</strong>, dass meine Gesundheitsdaten 
                (Schmerzeinträge, Symptome, Medikation) zur Nutzung dieser App verarbeitet werden. 
                Diese Einwilligung kann ich jederzeit in den Einstellungen widerrufen.
              </label>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="understand"
                checked={understandChecked}
                onCheckedChange={(checked) => setUnderstandChecked(!!checked)}
                className="mt-1"
              />
              <label htmlFor="understand" className="text-sm leading-relaxed cursor-pointer">
                Ich habe die{" "}
                <Link 
                  to="/privacy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary underline hover:no-underline inline-flex items-center gap-1"
                >
                  Datenschutzerklärung
                  <ExternalLink className="h-3 w-3" />
                </Link>{" "}
                gelesen und verstanden.
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleDecline}
            className="sm:flex-1"
          >
            Ablehnen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || saveConsent.isPending}
            className="sm:flex-1"
          >
            {saveConsent.isPending ? "Speichere..." : "Einwilligung erteilen"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Version 1.0 • {new Date().toLocaleDateString("de-DE")}
        </p>
      </DialogContent>
    </Dialog>
  );
};
