import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pill, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Med } from "@/features/meds/hooks/useMeds";

interface SimpleMedicationRowProps {
  med: Med;
  onTap: () => void;
}

/**
 * Get simplified badge - only "Regelmäßig" or "Bedarf"
 */
const getSimpleBadge = (med: Med) => {
  if (med.intolerance_flag) {
    return <Badge variant="destructive" className="text-xs">Unverträglich</Badge>;
  }
  if (med.is_active === false || med.discontinued_at) {
    return <Badge variant="secondary" className="text-xs">Abgesetzt</Badge>;
  }
  // Regular medications (prophylaxe, regelmaessig)
  if (med.art === "prophylaxe" || med.art === "regelmaessig" || med.intake_type === "regular") {
    return <Badge variant="default" className="text-xs bg-primary/80">Regelmäßig</Badge>;
  }
  // On-demand / PRN medications
  return <Badge variant="outline" className="text-xs">Bedarf</Badge>;
};

/**
 * Format medication name with strength
 */
const formatMedDisplay = (med: Med): { name: string; strength: string | null } => {
  let strength: string | null = null;
  if (med.staerke && !med.name.includes(med.staerke)) {
    strength = med.staerke;
  }
  return { name: med.name, strength };
};

/**
 * SimpleMedicationRow - Minimalist medication row with tap-to-detail
 * 
 * Shows only: Name, Strength, Type Badge (Regelmäßig/Bedarf), Active status
 * Tap opens detail/edit screen
 */
export const SimpleMedicationRow: React.FC<SimpleMedicationRowProps> = ({
  med,
  onTap,
}) => {
  const isInactive = med.is_active === false || !!med.discontinued_at || med.intolerance_flag;
  const { name, strength } = formatMedDisplay(med);

  return (
    <Card 
      className={cn(
        "transition-all duration-150 cursor-pointer",
        "hover:bg-muted/30 active:scale-[0.99]",
        isInactive && "opacity-70",
        med.intolerance_flag && "border-destructive/30 bg-destructive/5"
      )}
      onClick={onTap}
    >
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-4">
          {/* Pill Icon */}
          <Pill className={cn(
            "h-5 w-5 shrink-0",
            med.intolerance_flag ? "text-destructive" : "text-primary"
          )} />
          
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Name */}
              <span className="font-semibold text-sm leading-tight truncate">
                {name}
              </span>
              {/* Strength (if separate) */}
              {strength && (
                <span className="text-sm text-muted-foreground">
                  {strength}
                </span>
              )}
            </div>
            
            {/* Badges row */}
            <div className="flex items-center gap-2 mt-1">
              {getSimpleBadge(med)}
              {med.is_active !== false && !med.discontinued_at && !med.intolerance_flag && (
                <Badge variant="default" className="text-xs bg-green-600/80">Aktiv</Badge>
              )}
            </div>
          </div>
          
          {/* Chevron - indicates tappable */}
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
};
