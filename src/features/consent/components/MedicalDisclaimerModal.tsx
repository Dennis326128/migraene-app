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
      <DialogContent
        className="max-w-lg flex flex-col p-0 gap-0"
        style={{
          maxHeight: 'min(80vh, 560px)',
        }}
        // Prevent close via ESC or overlay click (legal requirement)
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">Wichtiger Hinweis</span>
          </div>
          <DialogTitle className="text-lg">
            Medizinischer Hinweis
          </DialogTitle>
          <DialogDescription className="sr-only">
            Bitte lesen Sie diesen Hinweis sorgfältig durch.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div
          className="flex-1 overflow-y-auto px-6 pb-4"
          style={{ minHeight: 0 }}
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Miary dient der persönlichen Dokumentation von Beschwerden und Medikamenten.
            </p>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Die App ersetzt keine ärztliche Beratung, Diagnose oder Behandlung.
            </p>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Bei anhaltenden oder schweren Beschwerden wenden Sie sich bitte an
              medizinisches Fachpersonal.
            </p>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 px-6 pb-6 pt-3 border-t border-border/50 space-y-2 bg-background rounded-b-lg"
          style={{
            paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
          }}
        >
          <Button onClick={onAccept} className="w-full">
            Verstanden
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            <Link
              to="/medical-disclaimer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline inline-flex items-center gap-1"
            >
              Rechtliche Hinweise
              <ExternalLink className="h-3 w-3" />
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
