import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Ban, AlertCircle } from "lucide-react";

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

const getPeriodText = (periodType: string): string => {
  switch (periodType) {
    case 'day': return 'heute';
    case 'week': return 'in den letzten 7 Tagen';
    case 'month': return 'in den letzten 30 Tagen';
    default: return `in den letzten ${periodType}`;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-warning" />;
    case 'reached':
      return <AlertCircle className="h-5 w-5 text-destructive" />;
    case 'exceeded':
      return <Ban className="h-5 w-5 text-destructive" />;
    default:
      return null;
  }
};

const getStatusMessage = (check: LimitCheck): string => {
  const periodText = getPeriodText(check.period_type);
  
  switch (check.status) {
    case 'warning':
      return `Du hast ${periodText} bereits ${check.current_count} von ${check.limit_count} ${check.medication_name} genommen (${check.percentage}%).`;
    case 'reached':
      return `Du hast ${periodText} das Limit erreicht: ${check.current_count}/${check.limit_count} ${check.medication_name}!`;
    case 'exceeded':
      const excess = check.current_count - check.limit_count;
      const unit = excess === 1 ? 'Tablette' : 'Tabletten';
      return `Du hast ${periodText} das Limit um ${excess} ${unit} überschritten: ${check.current_count}/${check.limit_count} ${check.medication_name}!`;
    default:
      return '';
  }
};

const getDialogTitle = (checks: LimitCheck[]): string => {
  const hasExceeded = checks.some(c => c.status === 'exceeded');
  const hasReached = checks.some(c => c.status === 'reached');
  const hasWarning = checks.some(c => c.status === 'warning');
  
  if (hasExceeded) return 'Medikamenten-Limit überschritten!';
  if (hasReached) return 'Medikamenten-Limit erreicht!';
  if (hasWarning) return 'Warnung: Medikamenten-Limit';
  return 'Medikamenten-Überprüfung';
};

export function MedicationLimitWarning({
  isOpen,
  onOpenChange,
  limitChecks
}: MedicationLimitWarningProps) {
  const criticalChecks = limitChecks.filter(c => 
    c.status === 'warning' || c.status === 'reached' || c.status === 'exceeded'
  );

  if (criticalChecks.length === 0) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {getStatusIcon(criticalChecks[0].status)}
            {getDialogTitle(criticalChecks)}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            {criticalChecks.map((check, index) => (
              <div key={index} className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-start gap-2">
                  {getStatusIcon(check.status)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {getStatusMessage(check)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            
            {criticalChecks.some(c => c.status === 'exceeded' || c.status === 'reached') && (
              <div className="mt-4 p-2 bg-destructive/10 rounded-lg border border-destructive/20">
                <p className="text-xs text-destructive-foreground">
                  💡 Bei häufigem Übergebrauch solltest du das Gespräch mit einem Arzt suchen.
                </p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)} className="w-full">
            Verstanden
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}