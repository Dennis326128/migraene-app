import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, FileText } from "lucide-react";
import type { PdfExportOptions } from "@/lib/pdf/medicationPlan";

interface MedicationPlanExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: PdfExportOptions) => Promise<void>;
  hasInactive?: boolean;
  hasIntolerance?: boolean;
  hasLimits?: boolean;
}

export const MedicationPlanExportDialog = ({
  open,
  onOpenChange,
  onExport,
}: MedicationPlanExportDialogProps) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Limits werden IMMER automatisch einbezogen
      const options: PdfExportOptions = {
        includeActive: true,
        includeInactive: false,
        includeIntolerance: true,
        includeLimits: true, // Immer automatisch aktiv
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
            Der Medikationsplan enthaelt alle derzeit aktiven Medikamente 
            (regelmaessige und Bedarfsmedikamente). Hinterlegte Einnahme-Limits 
            werden automatisch im Plan angezeigt.
          </DialogDescription>
        </DialogHeader>

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
