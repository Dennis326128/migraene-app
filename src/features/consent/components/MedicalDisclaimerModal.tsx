import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

interface MedicalDisclaimerModalProps {
  open: boolean;
  onAccept: () => void;
}

export const MedicalDisclaimerModal: React.FC<MedicalDisclaimerModalProps> = ({
  open,
  onAccept,
}) => {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 mb-2">
            <AlertTriangle className="h-6 w-6" />
            <span className="text-sm font-medium">Wichtiger Hinweis</span>
          </div>
          <DialogTitle className="text-xl">
            Medizinischer Hinweis
          </DialogTitle>
          <DialogDescription>
            Bitte lesen Sie diesen Hinweis sorgfältig durch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Diese App führt eine <strong>automatisierte statistische Auswertung</strong> Ihrer 
            Angaben durch (Trends, Häufigkeiten, mögliche Zusammenhänge). Es werden keine 
            Diagnosen gestellt und keine Therapie- oder Medikamentenempfehlungen gegeben.
          </p>
          
          <p className="text-sm text-muted-foreground">
            Die App ersetzt keine ärztliche Beratung, Diagnose oder Behandlung. 
            Bei akuten oder ungewöhnlichen Beschwerden holen Sie bitte medizinische Hilfe.
          </p>

          <p className="text-xs text-muted-foreground text-center pt-2">
            <Link 
              to="/medical-disclaimer" 
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline inline-flex items-center gap-1"
            >
              Ausführliche Informationen
              <ExternalLink className="h-3 w-3" />
            </Link>
          </p>
        </div>

        <Button onClick={onAccept} className="w-full">
          Ich habe verstanden
        </Button>
      </DialogContent>
    </Dialog>
  );
};
