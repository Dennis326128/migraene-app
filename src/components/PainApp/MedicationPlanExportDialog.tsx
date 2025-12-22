import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Download, FileText, AlertTriangle, History } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
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
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  // Only show toggles when there are relevant medications
  const hasIntolerances = intoleranceMeds.length > 0;
  const hasInactiveMeds = inactiveMeds.length > 0;
  
  // Default states - will be overwritten by saved settings
  const [includeIntolerances, setIncludeIntolerances] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeStopReasons, setIncludeStopReasons] = useState(true);
  const [includeDates, setIncludeDates] = useState(true);

  // Load saved settings when dialog opens
  useEffect(() => {
    if (!open) return;
    
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setSettingsLoaded(true);
          return;
        }
        
        const { data: settings } = await supabase
          .from("user_report_settings")
          .select("med_plan_include_inactive, med_plan_include_stop_reasons, med_plan_include_intolerances, med_plan_include_dates")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (settings) {
          if (settings.med_plan_include_inactive !== null) {
            setIncludeInactive(settings.med_plan_include_inactive);
          }
          if (settings.med_plan_include_stop_reasons !== null) {
            setIncludeStopReasons(settings.med_plan_include_stop_reasons);
          }
          if (settings.med_plan_include_intolerances !== null) {
            setIncludeIntolerances(settings.med_plan_include_intolerances);
          }
          if (settings.med_plan_include_dates !== null) {
            setIncludeDates(settings.med_plan_include_dates);
          }
        }
        setSettingsLoaded(true);
      } catch (error) {
        console.error("Error loading med plan settings:", error);
        setSettingsLoaded(true);
      }
    })();
  }, [open]);

  // Save settings when they change (debounced via export)
  const saveSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      await supabase
        .from("user_report_settings")
        .upsert({
          user_id: user.id,
          med_plan_include_inactive: includeInactive,
          med_plan_include_stop_reasons: includeStopReasons,
          med_plan_include_intolerances: includeIntolerances,
          med_plan_include_dates: includeDates,
        }, { onConflict: "user_id" });
    } catch (error) {
      console.error("Error saving med plan settings:", error);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Save settings before exporting
      await saveSettings();
      
      const options: PdfExportOptions = {
        includeActive: true,
        includeInactive: hasInactiveMeds && includeInactive,
        includeIntolerance: hasIntolerances && includeIntolerances,
        includeLimits: true,
        includeStopReasons: includeInactive && includeStopReasons,
        includeDates: includeInactive && includeDates,
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
                    Zeigt {inactiveMeds.length} früher eingenommene{inactiveMeds.length === 1 ? 's' : ''} Medikament{inactiveMeds.length === 1 ? '' : 'e'} mit Zeitraum im Plan.
                  </p>
                </div>
              </div>
            )}

            {/* Sub-Toggles - nur wenn inaktive gewählt */}
            {includeInactive && (
              <div className="space-y-2 pl-6">
                <div className="flex items-center gap-3">
                  <Switch
                    id="include-dates"
                    checked={includeDates}
                    onCheckedChange={setIncludeDates}
                  />
                  <Label 
                    htmlFor="include-dates"
                    className="text-sm cursor-pointer"
                  >
                    Start- & Enddatum anzeigen
                  </Label>
                </div>
                <div className="flex items-center gap-3">
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