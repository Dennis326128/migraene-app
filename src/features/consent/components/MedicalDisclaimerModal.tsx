import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Phone, Stethoscope, ExternalLink } from "lucide-react";
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
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Stethoscope className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Keine medizinische Beratung
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Diese App dient ausschließlich zur Dokumentation und Selbstbeobachtung. 
                  Sie ersetzt <strong>keine</strong> ärztliche Beratung, Diagnose oder Behandlung.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm">
              <strong>Die App bietet:</strong>
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Dokumentation Ihrer Symptome und Medikamente</li>
              <li>• Statistische Auswertungen und Trends</li>
              <li>• Berichte zur Unterstützung von Arztgesprächen</li>
            </ul>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm">
              <strong>Die App bietet NICHT:</strong>
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Diagnosen oder Behandlungsempfehlungen</li>
              <li>• Medizinische Ratschläge</li>
              <li>• Ersatz für professionelle medizinische Hilfe</li>
            </ul>
          </div>

          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-destructive">
                  Im Notfall: 112 anrufen
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Bei starken oder ungewöhnlichen Symptomen, plötzlichen Veränderungen 
                  oder wenn Sie sich unsicher fühlen, kontaktieren Sie sofort einen Arzt 
                  oder den Notruf.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Weitere Informationen finden Sie in unserer{" "}
            <Link 
              to="/medical-disclaimer" 
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline inline-flex items-center gap-1"
            >
              ausführlichen Erklärung
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
