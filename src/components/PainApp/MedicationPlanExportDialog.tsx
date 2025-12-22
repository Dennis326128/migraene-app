import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Download, FileText, AlertTriangle, History } from "lucide-react";
import type { PdfExportOptions } from "@/lib/pdf/medicationPlan";
import type { Med } from "@/features/meds/hooks/useMeds";

interface MedicationPlanExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: PdfExportOptions) => Promise<void>;
  intoleranceMeds?: Med[];
  inactiveMeds?: Med[];
}

export const MedicationPlanExportDialog = ({
  open,
  onOpenChange,
  onExport,
  intoleranceMeds = [],
  inactiveMeds = [],
}: MedicationPlanExportDialogProps) => {
  const [isExporting, setIsExporting] = useState(false);
  
  // Only show toggles when there are relevant medications
  const hasIntolerances = intoleranceMeds.length > 0;
  const hasInactiveMeds = inactiveMeds.length > 0;
  
  // Default states
  const [includeIntolerances, setIncludeIntolerances] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeStopReasons, setIncludeStopReasons] = useState(true);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const options: PdfExportOptions = {
        includeActive: true,
        includeInactive: hasInactiveMeds && includeInactive,
        includeIntolerance: hasIntolerances && includeIntolerances,
        includeLimits: true,
        includeStopReasons: includeInactive && includeStopReasons,
      };
      await onExport(options);
      onOpenChange(false);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Medikationsplan erstellen
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-2">
            Der Medikationsplan enthält alle derzeit aktiven Medikamente 
            (regelmäßige und Bedarfsmedikamente). Hinterlegte Einnahme-Limits 
            werden automatisch im Plan angezeigt.
          </DialogDescription>
        </DialogHeader>

        {/* Export Options */}
        {(hasIntolerances || hasInactiveMeds) && (
          <div className="py-4 space-y-3">
            {/* Unverträglichkeiten Toggle */}
            {hasIntolerances && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                <Switch
                  id="include-intolerances"
                  checked={includeIntolerances}
                  onCheckedChange={setIncludeIntolerances}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-1">
                  <Label 
                    htmlFor="include-intolerances" 
                    className="text-sm font-medium cursor-pointer flex items-center gap-2"
                  >
                    <AlertTriangle className="h-4 w-4 text-destructive/70" />
                    Unverträglichkeiten aufnehmen
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Zeigt {intoleranceMeds.length} unverträgliche{intoleranceMeds.length === 1 ? 's' : ''} Medikament{intoleranceMeds.length === 1 ? '' : 'e'} im Plan.
                  </p>
                </div>
              </div>
            )}

            {/* Vergangene Medikamente Toggle */}
            {hasInactiveMeds && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                <Switch
                  id="include-inactive"
                  checked={includeInactive}
                  onCheckedChange={setIncludeInactive}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-1">
                  <Label 
                    htmlFor="include-inactive" 
                    className="text-sm font-medium cursor-pointer flex items-center gap-2"
                  >
                    <History className="h-4 w-4 text-muted-foreground" />
                    Vergangene Medikamente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Zeigt {inactiveMeds.length} früher eingenommene{inactiveMeds.length === 1 ? 's' : ''} Medikament{inactiveMeds.length === 1 ? '' : 'e'} im Plan.
                  </p>
                </div>
              </div>
            )}

            {/* Absetzgründe Toggle - nur wenn inaktive gewählt */}
            {includeInactive && (
              <div className="flex items-center gap-3 pl-6">
                <Switch
                  id="include-stop-reasons"
                  checked={includeStopReasons}
                  onCheckedChange={setIncludeStopReasons}
                />
                <Label 
                  htmlFor="include-stop-reasons"
                  className="text-sm cursor-pointer"
                >
                  Absetzgründe anzeigen
                </Label>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={isExporting}
            className="gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird erstellt...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                PDF erstellen
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
