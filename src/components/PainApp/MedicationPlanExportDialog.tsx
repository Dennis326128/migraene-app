import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Download, FileText, AlertTriangle, History, Clock } from "lucide-react";
import type { PdfExportOptions } from "@/lib/pdf/medicationPlan";

interface MedicationPlanExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: PdfExportOptions) => Promise<void>;
  hasInactive: boolean;
  hasIntolerance: boolean;
  hasLimits: boolean;
}

export const MedicationPlanExportDialog = ({
  open,
  onOpenChange,
  onExport,
  hasInactive,
  hasIntolerance,
  hasLimits,
}: MedicationPlanExportDialogProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [options, setOptions] = useState<PdfExportOptions>({
    includeActive: true,
    includeInactive: false,
    includeIntolerance: true,
    includeLimits: false,
    includeGrund: true,
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport(options);
      onOpenChange(false);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const updateOption = (key: keyof PdfExportOptions, value: boolean) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Medikationsplan erstellen
          </DialogTitle>
          <DialogDescription>
            Waehlen Sie, welche Bereiche im PDF enthalten sein sollen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Aktuelle Medikation */}
          <div className="flex items-start space-x-3 p-3 rounded-lg border bg-muted/30">
            <Checkbox
              id="includeActive"
              checked={options.includeActive}
              onCheckedChange={(checked) => updateOption("includeActive", !!checked)}
            />
            <div className="grid gap-1 leading-none">
              <Label htmlFor="includeActive" className="font-medium cursor-pointer">
                Aktuelle Medikation
              </Label>
              <p className="text-xs text-muted-foreground">
                Regelmaessige und Bedarfsmedikamente
              </p>
            </div>
          </div>

          {/* Unverträglichkeiten */}
          {hasIntolerance && (
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <Checkbox
                id="includeIntolerance"
                checked={options.includeIntolerance}
                onCheckedChange={(checked) => updateOption("includeIntolerance", !!checked)}
              />
              <div className="grid gap-1 leading-none">
                <Label htmlFor="includeIntolerance" className="font-medium cursor-pointer flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Unvertraeglichkeiten
                </Label>
                <p className="text-xs text-muted-foreground">
                  Medikamente, die nicht eingenommen werden sollten
                </p>
              </div>
            </div>
          )}

          {/* Früher verwendete */}
          {hasInactive && (
            <div className="flex items-start space-x-3 p-3 rounded-lg border">
              <Checkbox
                id="includeInactive"
                checked={options.includeInactive}
                onCheckedChange={(checked) => updateOption("includeInactive", !!checked)}
              />
              <div className="grid gap-1 leading-none">
                <Label htmlFor="includeInactive" className="font-medium cursor-pointer flex items-center gap-1.5">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Frueher verwendete Medikamente
                </Label>
                <p className="text-xs text-muted-foreground">
                  Abgesetzte Medikamente mit Absetzgrund
                </p>
              </div>
            </div>
          )}

          {/* Limits */}
          {hasLimits && (
            <div className="flex items-start space-x-3 p-3 rounded-lg border">
              <Checkbox
                id="includeLimits"
                checked={options.includeLimits}
                onCheckedChange={(checked) => updateOption("includeLimits", !!checked)}
              />
              <div className="grid gap-1 leading-none">
                <Label htmlFor="includeLimits" className="font-medium cursor-pointer flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Einnahme-Limits
                </Label>
                <p className="text-xs text-muted-foreground">
                  Maximale Einnahmen pro Zeitraum
                </p>
              </div>
            </div>
          )}

          {/* Anwendungsgrund */}
          <div className="flex items-start space-x-3 p-3 rounded-lg border">
            <Checkbox
              id="includeGrund"
              checked={options.includeGrund}
              onCheckedChange={(checked) => updateOption("includeGrund", !!checked)}
            />
            <div className="grid gap-1 leading-none">
              <Label htmlFor="includeGrund" className="font-medium cursor-pointer">
                Anwendungsgrund anzeigen
              </Label>
              <p className="text-xs text-muted-foreground">
                Spalte "Grund" in der Tabelle
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={isExporting || !options.includeActive}
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
