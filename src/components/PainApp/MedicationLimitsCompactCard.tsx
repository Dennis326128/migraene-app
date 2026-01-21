import React, { useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge, Info, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useMedicationLimits,
  useCheckMedicationLimits,
  type LimitCheck,
} from "@/features/medication-limits/hooks/useMedicationLimits";
import { useMeds } from "@/features/meds/hooks/useMeds";

interface MedicationLimitsCompactCardProps {
  onManageLimits: () => void;
}

/**
 * Compact card showing medication limits status.
 * Entire card is clickable. Calm, informative design.
 */
export function MedicationLimitsCompactCard({ onManageLimits }: MedicationLimitsCompactCardProps) {
  const { data: limits = [], isLoading: limitsLoading } = useMedicationLimits();
  const { data: medications = [], isLoading: medsLoading } = useMeds();
  const { mutate: checkLimits, data: limitChecks = [], isPending: checking } = useCheckMedicationLimits();

  // Check limits when we have medications with limits
  useEffect(() => {
    const medsWithLimits = limits.filter(l => l.is_active).map(l => l.medication_name);
    if (medsWithLimits.length > 0) {
      checkLimits(medsWithLimits);
    }
  }, [limits, checkLimits]);

  // Calculate summary status
  const summary = useMemo(() => {
    if (limits.length === 0) {
      return {
        hasLimits: false,
        activeLimits: 0,
        totalLimits: 0,
        status: 'none' as const,
        worstCheck: null as LimitCheck | null,
      };
    }

    const activeLimits = limits.filter(l => l.is_active);
    const activeChecks = limitChecks.filter(c => 
      activeLimits.some(l => l.medication_name.toLowerCase() === c.medication_name.toLowerCase())
    );

    // Find the worst status
    let worstStatus: 'safe' | 'warning' | 'reached' | 'exceeded' = 'safe';
    let worstCheck: LimitCheck | null = null;

    for (const check of activeChecks) {
      const statusPriority = { safe: 0, warning: 1, reached: 2, exceeded: 3 };
      if (statusPriority[check.status] > statusPriority[worstStatus]) {
        worstStatus = check.status;
        worstCheck = check;
      }
    }

    return {
      hasLimits: true,
      activeLimits: activeLimits.length,
      totalLimits: limits.length,
      status: worstStatus,
      worstCheck,
    };
  }, [limits, limitChecks]);

  // Calculate days until reset for the worst check
  const daysUntilReset = useMemo(() => {
    if (!summary.worstCheck) return null;

    const periodStart = new Date(summary.worstCheck.period_start);
    const now = new Date();
    
    let periodEnd: Date;
    switch (summary.worstCheck.period_type) {
      case 'day':
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 1);
        break;
      case 'week':
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 7);
        break;
      case 'month':
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 30);
        break;
      default:
        return null;
    }

    const diffMs = periodEnd.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, [summary.worstCheck]);

  // Loading state
  if (limitsLoading || medsLoading) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // No limits configured - show activation prompt
  if (!summary.hasLimits) {
    return (
      <Card 
        className="border-border/50 bg-card hover:bg-muted/30 transition-colors cursor-pointer group"
        onClick={onManageLimits}
      >
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
              <Gauge className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base">Einnahme-Limits</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px]">
                      <p className="text-xs">
                        Limits helfen, Übergebrauch zu vermeiden. Du kannst sie individuell anpassen.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Noch keine Limits eingerichtet
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // All limits deactivated
  if (summary.activeLimits === 0) {
    return (
      <Card 
        className="border-border/50 bg-card hover:bg-muted/30 transition-colors cursor-pointer group"
        onClick={onManageLimits}
      >
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
              <Gauge className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base">Einnahme-Limits</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">deaktiviert</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {summary.totalLimits} Limit{summary.totalLimits !== 1 ? 's' : ''} konfiguriert
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Active limits with status - CALM styling with orange warning for exceeded/reached
  const isWarningState = summary.status === 'exceeded' || summary.status === 'reached';
  
  const getStatusContent = () => {
    if (!summary.worstCheck) {
      return {
        medName: null,
        statusText: `${summary.activeLimits} aktive${summary.activeLimits !== 1 ? ' Limits' : 's Limit'}`,
      };
    }
    
    const remaining = summary.worstCheck.limit_count - summary.worstCheck.current_count;
    
    switch (summary.status) {
      case 'exceeded':
        return {
          medName: summary.worstCheck.medication_name,
          statusText: 'Limit überschritten',
        };
      case 'reached':
        return {
          medName: summary.worstCheck.medication_name,
          statusText: 'Limit erreicht',
        };
      case 'warning':
      case 'safe':
      default:
        if (remaining > 0) {
          return {
            medName: null,
            statusText: `Noch ${remaining} von ${summary.worstCheck.limit_count} Einnahmen verfügbar`,
          };
        }
        return {
          medName: null,
          statusText: `${summary.activeLimits} aktive${summary.activeLimits !== 1 ? ' Limits' : 's Limit'}`,
        };
    }
  };

  const getSecondaryText = () => {
    if (daysUntilReset !== null && daysUntilReset > 0 && isWarningState) {
      return `Reset in ${daysUntilReset} Tag${daysUntilReset !== 1 ? 'en' : ''}`;
    }
    
    if (summary.status === 'safe' && summary.activeLimits > 0) {
      return 'Alles im grünen Bereich';
    }
    
    return null;
  };

  const statusContent = getStatusContent();

  return (
    <Card 
      className="border-border/50 bg-card hover:bg-muted/30 transition-colors cursor-pointer group"
      onClick={onManageLimits}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
            {checking ? (
              <div className="h-6 w-6 animate-pulse bg-muted rounded" />
            ) : (
              <Gauge className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base">Einnahme-Limits</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p className="text-xs">
                      Limits helfen, Übergebrauch zu vermeiden. Du kannst sie individuell anpassen.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2 text-sm mt-0.5">
              {isWarningState && (
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              )}
              {statusContent.medName && (
                <span className="text-muted-foreground">
                  {statusContent.medName}:
                </span>
              )}
              <span className={cn(
                isWarningState ? 'text-warning font-medium' : 'text-muted-foreground'
              )}>
                {statusContent.statusText}
              </span>
              {getSecondaryText() && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-muted-foreground">{getSecondaryText()}</span>
                </>
              )}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}
