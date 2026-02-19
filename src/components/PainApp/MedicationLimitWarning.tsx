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

interface LimitCheck {
  medication_name: string;
  current_count: number;
  limit_count: number;
  period_type: string;
  percentage: number;
  status: 'safe' | 'warning' | 'reached' | 'exceeded';
  period_start: string;
}

interface MedicationLimitWarningProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  limitChecks: LimitCheck[];
}

const getTimeWindowLabel = (periodType: string): string => {
  switch (periodType) {
    case 'day': return 'heute';
    case 'week': return '7 Tagen';
    case 'month': return '30 Tagen';
    default: return periodType;
  }
};

const getTimeWindowPrefix = (periodType: string): string => {
  if (periodType === 'day') return 'Heute';
  return `In den letzten ${getTimeWindowLabel(periodType)}`;
};

const pluralizeIntake = (count: number): string => {
  return count === 1 ? '1 Einnahme' : `${count} Einnahmen`;
};

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
            Dein gesetztes Limit wurde überschritten
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              {criticalChecks.map((check, index) => (
                <div key={index} className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-foreground">
                    {getTimeWindowPrefix(check.period_type)} wurden{' '}
                    {pluralizeIntake(check.current_count)} von {check.medication_name}{' '}
                    eingenommen.
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Dein gesetztes Limit liegt bei {check.limit_count}.
                  </p>
                </div>
              ))}

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