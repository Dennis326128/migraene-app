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
import { Shield, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useSaveHealthDataConsent } from "../hooks/useConsent";
import { useToast } from "@/hooks/use-toast";

const CONSENT_VERSION = "1.1";

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
  const { toast } = useToast();
  const saveConsent = useSaveHealthDataConsent();

  const handleSubmit = async () => {
    if (!consentChecked) return;

    try {
      await saveConsent.mutateAsync(true);
      toast({
        title: "Einwilligung gespeichert",
        description: "Ihre Einwilligung wurde erfasst.",
      });
      onConsentGiven();
    } catch (error) {
      console.error("Error saving consent:", error);
      toast({
        title: "Fehler",
        description: "Die Einwilligung konnte nicht gespeichert werden.",
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-2">
            <Shield className="h-5 w-5" />
            <span className="text-sm font-medium">Art. 9 DSGVO</span>
          </div>
          <DialogTitle>Einwilligung Gesundheitsdaten</DialogTitle>
          <DialogDescription>
            Für die Nutzung dieser App ist Ihre ausdrückliche Einwilligung erforderlich.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 text-sm">
          <p>
            <strong>Was:</strong> Gesundheitsdaten (Schmerz, Symptome, Medikation; optional Zyklus/Notizen)
          </p>
          
          <p>
            <strong>Zweck:</strong> Dokumentation + automatisierte statistische Auswertungen 
            (Trends, Häufigkeiten, mögliche Zusammenhänge) + Berichte für Arztbesuche
          </p>
          
          <p className="text-muted-foreground">
            Keine Diagnosen, keine Therapie- oder Medikamentenempfehlungen.{" "}
            <Link 
              to="/privacy" 
              target="_blank" 
              className="text-primary underline hover:no-underline inline-flex items-center gap-1"
            >
              Details
              <ExternalLink className="h-3 w-3" />
            </Link>
          </p>

          {/* Single explicit Art.9 checkbox */}
          <div className="flex items-start space-x-3 pt-2 border-t">
            <Checkbox
              id="consent"
              checked={consentChecked}
              onCheckedChange={(checked) => setConsentChecked(!!checked)}
              className="mt-1"
            />
            <label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
              Ich willige ausdrücklich in die Verarbeitung meiner Gesundheitsdaten ein. 
              Diese Einwilligung kann ich jederzeit in den Einstellungen widerrufen.
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleDecline}
            className="sm:flex-1"
          >
            Ablehnen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!consentChecked || saveConsent.isPending}
            className="sm:flex-1"
          >
            {saveConsent.isPending ? "Speichere..." : "Einwilligung erteilen"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Version {CONSENT_VERSION} • {new Date().toLocaleDateString("de-DE")}
        </p>
      </DialogContent>
    </Dialog>
  );
};
