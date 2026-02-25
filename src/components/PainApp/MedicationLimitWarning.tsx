import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { buildLimitMessage, type LimitStatus } from "@/lib/utils/medicationLimitStatus";

interface LimitCheck {
  medication_name: string;
  current_count: number;
  limit_count: number;
  period_type: string;
  percentage: number;
  status: LimitStatus;
  period_start: string;
}

interface MedicationLimitWarningProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  limitChecks: LimitCheck[];
}

function getDialogTitle(checks: LimitCheck[]): string {
  const hasExceeded = checks.some(c => c.status === 'exceeded');
  const hasReached = checks.some(c => c.status === 'reached');
  if (hasExceeded) return 'Dein gesetztes Limit wurde überschritten';
  if (hasReached) return 'Dein gesetztes Limit wurde erreicht';
  return 'Achtung: Du bist nahe an deinem Limit';
}

export function MedicationLimitWarning({
  isOpen,
  onOpenChange,
  limitChecks,
}: MedicationLimitWarningProps) {
  const criticalChecks = limitChecks.filter(
    (c) => c.status === 'warning' || c.status === 'reached' || c.status === 'exceeded'
  );

  if (criticalChecks.length === 0) return null;

  const hasExceeded = criticalChecks.some(
    (c) => c.status === 'exceeded' || c.status === 'reached'
  );

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {getDialogTitle(criticalChecks)}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              {criticalChecks.map((check, index) => {
                const msg = buildLimitMessage(
                  check.status,
                  check.current_count,
                  check.limit_count,
                  check.period_type,
                  check.medication_name,
                );
                return (
                  <div key={index} className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-foreground">{msg}</p>
                  </div>
                );
              })}

              {hasExceeded && (
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    Eine häufige Einnahme kann das Risiko für anhaltende oder häufiger
                    auftretende Kopfschmerzen erhöhen.
                    <br />
                    Bitte sprich mit deinem Arzt oder deiner Ärztin darüber.
                  </p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => onOpenChange(false)}
            className="w-full bg-primary hover:bg-primary/90"
          >
            Verstanden
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}