import React, { useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, Info } from "lucide-react";
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
 * Designed to be calm, informative (not alarming).
 * Max 2 text lines + 1 secondary action.
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
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // No limits configured - show activation prompt
  if (!summary.hasLimits) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted/50">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Einnahme-Limits</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px]">
                      <p className="text-xs">
                        Limits helfen, Übergebrauch zu vermeiden. Du kannst sie individuell anpassen.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Noch keine Limits eingerichtet
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onManageLimits}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              Aktivieren
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // All limits deactivated
  if (summary.activeLimits === 0) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted/50">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Einnahme-Limits</span>
                <span className="text-xs text-muted-foreground">(deaktiviert)</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {summary.totalLimits} Limit{summary.totalLimits !== 1 ? 's' : ''} konfiguriert
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onManageLimits}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              Aktivieren
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Active limits with status - CALM styling, no alarm colors
  const getStatusText = () => {
    if (!summary.worstCheck) {
      return `${summary.activeLimits} aktive${summary.activeLimits !== 1 ? ' Limits' : 's Limit'}`;
    }
    
    const remaining = summary.worstCheck.limit_count - summary.worstCheck.current_count;
    
    switch (summary.status) {
      case 'exceeded':
        return `${summary.worstCheck.medication_name}: Limit überschritten`;
      case 'reached':
        return `${summary.worstCheck.medication_name}: Limit erreicht`;
      case 'warning':
      case 'safe':
      default:
        if (remaining > 0) {
          return `Noch ${remaining} von ${summary.worstCheck.limit_count} verfügbar`;
        }
        return `${summary.activeLimits} aktive${summary.activeLimits !== 1 ? ' Limits' : 's Limit'}`;
    }
  };

  const getSecondaryText = () => {
    if (daysUntilReset !== null && daysUntilReset > 0 && summary.status !== 'safe') {
      return `Reset in ${daysUntilReset} Tag${daysUntilReset !== 1 ? 'en' : ''}`;
    }
    
    if (summary.status === 'safe' && summary.activeLimits > 0) {
      return 'Alles im grünen Bereich';
    }
    
    return null;
  };

  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-muted/50">
            {checking ? (
              <div className="h-5 w-5 animate-pulse bg-muted rounded" />
            ) : (
              <Settings2 className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Einnahme-Limits</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p className="text-xs">
                      Limits helfen, Übergebrauch zu vermeiden. Du kannst sie individuell anpassen.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={cn(
                "truncate",
                (summary.status === 'reached' || summary.status === 'exceeded') 
                  ? 'text-foreground font-medium' 
                  : 'text-muted-foreground'
              )}>
                {getStatusText()}
              </span>
              {getSecondaryText() && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-muted-foreground">{getSecondaryText()}</span>
                </>
              )}
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onManageLimits}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            Limits bearbeiten
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
