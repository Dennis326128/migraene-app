import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pill, Clock, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import {
  useMedicationLimits,
  useCheckMedicationLimits,
  type LimitCheck,
} from "@/features/medication-limits/hooks/useMedicationLimits";
import { cn } from "@/lib/utils";

interface LimitsStatusOverviewProps {
  onSwitchToLimitsTab?: () => void;
}

const periodLabels: Record<string, string> = {
  day: "heute",
  week: "letzte 7 Tage",
  month: "letzte 30 Tage",
};

function getStatusConfig(check: LimitCheck) {
  const remaining = check.limit_count - check.current_count;

  if (check.status === "exceeded") {
    return {
      color: "text-red-400",
      bgTint: "bg-red-500/8",
      dotColor: "bg-red-500",
      label: "Überschritten",
      sub: `${Math.abs(remaining)} über Limit`,
      icon: XCircle,
    };
  }
  if (check.status === "reached") {
    return {
      color: "text-amber-400",
      bgTint: "bg-amber-500/8",
      dotColor: "bg-amber-500",
      label: "Erreicht",
      sub: "Limit erreicht",
      icon: AlertTriangle,
    };
  }
  if (check.status === "warning") {
    return {
      color: "text-amber-400",
      bgTint: "bg-amber-500/6",
      dotColor: "bg-amber-400",
      label: "Nahe am Limit",
      sub: `Noch ${remaining}`,
      icon: AlertTriangle,
    };
  }
  return {
    color: "text-emerald-400",
    bgTint: "bg-emerald-500/6",
    dotColor: "bg-emerald-500",
    label: "OK",
    sub: `Noch ${remaining}`,
    icon: CheckCircle,
  };
}

export function LimitsStatusOverview({ onSwitchToLimitsTab }: LimitsStatusOverviewProps) {
  const { data: limits = [], isLoading: limitsLoading } = useMedicationLimits();
  const { mutate: checkLimits, data: limitChecks, isPending: checking } = useCheckMedicationLimits();

  const activeLimits = limits.filter((l) => l.is_active);

  // Fetch status on mount + when active limits change
  React.useEffect(() => {
    if (activeLimits.length > 0) {
      const medNames = activeLimits.map((l) => l.medication_name);
      checkLimits(medNames);
    }
  }, [activeLimits.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const checks: LimitCheck[] = limitChecks ?? [];
  const isLoading = limitsLoading || checking;

  // Empty state
  if (!isLoading && activeLimits.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center space-y-4">
          <Pill className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <div>
            <p className="font-medium text-foreground">Noch keine aktiven Limits</p>
            <p className="text-sm text-muted-foreground mt-1">
              Lege Limits fest, um deinen Medikamentenverbrauch im Blick zu behalten.
            </p>
          </div>
          {onSwitchToLimitsTab && (
            <Button variant="outline" onClick={onSwitchToLimitsTab}>
              Neues Limit hinzufügen
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Summary
  const hasIssues = checks.some(
    (c) => c.status === "warning" || c.status === "reached" || c.status === "exceeded"
  );

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <Card className={cn(hasIssues ? "bg-amber-500/5" : "bg-emerald-500/5")}>
        <CardContent className="p-4 flex items-center gap-3">
          {hasIssues ? (
            <>
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
              <span className="text-sm font-medium">Achtung bei einigen Medikamenten</span>
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
              <span className="text-sm font-medium">Alles im grünen Bereich</span>
            </>
          )}
        </CardContent>
      </Card>

      {/* Status cards */}
      <div className="space-y-3">
        {checks.map((check) => {
          const cfg = getStatusConfig(check);
          const StatusIcon = cfg.icon;
          const pct = Math.min(Math.round((check.current_count / check.limit_count) * 100), 100);

          return (
            <Card key={`${check.medication_name}-${check.period_type}`} className={cn(cfg.bgTint)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* Left */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn("mt-0.5 h-3 w-3 rounded-full shrink-0", cfg.dotColor)} />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{check.medication_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {periodLabels[check.period_type] ?? check.period_type}
                      </p>
                    </div>
                  </div>

                  {/* Right */}
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold tabular-nums">
                      {check.current_count}
                      <span className="text-muted-foreground font-normal text-sm"> / {check.limit_count}</span>
                    </p>
                    <Badge
                      variant="outline"
                      className={cn("text-xs mt-1", cfg.color, "border-current/20")}
                    >
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {cfg.label}
                    </Badge>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      check.status === "exceeded"
                        ? "bg-red-500"
                        : check.status === "reached"
                        ? "bg-amber-500"
                        : check.status === "warning"
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>

                {/* Sub text */}
                <p className="text-xs text-muted-foreground mt-2">{cfg.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
