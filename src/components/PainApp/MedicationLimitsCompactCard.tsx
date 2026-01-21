import React, { useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle, Settings2, Info, Power } from "lucide-react";
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
 * Designed to be visible without scrolling on the medication management screen.
 * Max 2 text lines + 1 action button.
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
      <Card className="border-border/50 bg-secondary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // No limits configured - show activation prompt
  if (!summary.hasLimits) {
    return (
      <Card className="border-border/50 bg-secondary/5">
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
              variant="outline" 
              size="sm" 
              onClick={onManageLimits}
              className="shrink-0"
            >
              <Power className="h-4 w-4 mr-1.5" />
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
      <Card className="border-border/50 bg-secondary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted/50">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Einnahme-Limits</span>
                <Badge variant="secondary" className="text-xs">Deaktiviert</Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {summary.totalLimits} Limit{summary.totalLimits !== 1 ? 's' : ''} konfiguriert, aber inaktiv
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onManageLimits}
              className="shrink-0"
            >
              <Power className="h-4 w-4 mr-1.5" />
              Aktivieren
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Active limits with status
  const getStatusIcon = () => {
    switch (summary.status) {
      case 'exceeded':
      case 'reached':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
  };

  const getStatusText = () => {
    if (!summary.worstCheck) return 'Alles im grünen Bereich';
    
    switch (summary.status) {
      case 'exceeded':
        return `${summary.worstCheck.medication_name}: Limit überschritten`;
      case 'reached':
        return `${summary.worstCheck.medication_name}: Limit erreicht`;
      case 'warning':
        return `${summary.worstCheck.medication_name}: ${summary.worstCheck.current_count}/${summary.worstCheck.limit_count}`;
      default:
        return 'Alles im grünen Bereich';
    }
  };

  const getSecondaryText = () => {
    if (summary.status === 'safe') {
      return `${summary.activeLimits} aktive${summary.activeLimits !== 1 ? ' Limits' : 's Limit'}`;
    }
    
    if (daysUntilReset !== null && daysUntilReset > 0) {
      return `Reset in ${daysUntilReset} Tag${daysUntilReset !== 1 ? 'en' : ''}`;
    }
    
    return null;
  };

  const borderColor = cn({
    'border-green-500/30': summary.status === 'safe',
    'border-warning/30': summary.status === 'warning',
    'border-destructive/30': summary.status === 'reached' || summary.status === 'exceeded',
  });

  const bgColor = cn({
    'bg-green-500/5': summary.status === 'safe',
    'bg-warning/5': summary.status === 'warning',
    'bg-destructive/5': summary.status === 'reached' || summary.status === 'exceeded',
  });

  return (
    <Card className={cn("border", borderColor, bgColor)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-md",
            summary.status === 'safe' ? 'bg-green-500/10' :
            summary.status === 'warning' ? 'bg-warning/10' : 'bg-destructive/10'
          )}>
            {checking ? (
              <div className="h-5 w-5 animate-pulse bg-muted rounded" />
            ) : (
              getStatusIcon()
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
                summary.status === 'safe' ? 'text-green-600 dark:text-green-400' :
                summary.status === 'warning' ? 'text-warning' : 'text-destructive'
              )}>
                {getStatusText()}
              </span>
              {getSecondaryText() && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{getSecondaryText()}</span>
                </>
              )}
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onManageLimits}
            className="shrink-0"
          >
            <Settings2 className="h-4 w-4 mr-1.5" />
            Verwalten
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
