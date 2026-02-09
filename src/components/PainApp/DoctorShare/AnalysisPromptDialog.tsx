/**
 * AnalysisPromptDialog
 * Nach erfolgreicher Freigabe: simple Ja/Nein-Frage zur KI-Auswertung.
 * Kein Premium, kein Limit, kein Erklärtext.
 */

import React from "react";
import { Button } from "@/components/ui/button";

interface AnalysisPromptDialogProps {
  onStart: () => void;
  onSkip: () => void;
}

export const AnalysisPromptDialog: React.FC<AnalysisPromptDialogProps> = ({
  onStart,
  onSkip,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center space-y-6 py-8 px-4">
      <h2 className="text-lg font-semibold text-foreground">
        Kopfschmerztagebuch ist bereit
      </h2>

      <p className="text-sm text-muted-foreground">
        Automatische Auswertung starten?
      </p>

      <div className="flex flex-col w-full gap-2 max-w-xs">
        <Button onClick={onStart} size="lg" className="w-full">
          Auswertung starten
        </Button>
        <Button
          onClick={onSkip}
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Jetzt nicht
        </Button>
      </div>
    </div>
  );
};

export default AnalysisPromptDialog;
