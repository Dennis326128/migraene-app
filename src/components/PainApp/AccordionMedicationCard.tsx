import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pill, Pencil, Trash2, Bell, BellOff, ChevronDown, Calendar } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Med } from "@/features/meds/hooks/useMeds";
import type { MedicationReminderStatus } from "@/features/reminders/hooks/useMedicationReminders";

interface AccordionMedicationCardProps {
  med: Med;
  reminderStatus?: MedicationReminderStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReminder: () => void;
}

/**
 * Get simplified badge - only "Regelmäßig" or "Bedarf"
 * Removed "Prophylaxe" badge per user request
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
  // On-demand / PRN medications - explicit badge
  return <Badge variant="outline" className="text-xs">Bedarf</Badge>;
};

/**
 * Format medication name with strength for collapsed view
 */
const formatMedNameWithStrength = (med: Med): string => {
  const parts = [med.name];
  if (med.staerke && !med.name.includes(med.staerke)) {
    parts.push(med.staerke);
  }
  return parts.join(" ");
};

export const AccordionMedicationCard: React.FC<AccordionMedicationCardProps> = ({
  med,
  reminderStatus,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onReminder,
}) => {
  const isInactive = med.is_active === false || !!med.discontinued_at || med.intolerance_flag;
  const hasActiveReminder = reminderStatus?.isActive ?? false;
  const isIntervalMed = reminderStatus?.isIntervalMed ?? false;
  
  // Format next date for collapsed view (single date, small)
  const getNextDateDisplay = () => {
    if (!reminderStatus?.nextTriggerDate) return null;
    return format(reminderStatus.nextTriggerDate, "dd. MMM", { locale: de });
  };

  // Format reminder times for expanded view
  const formatReminderTimes = () => {
    if (!reminderStatus?.reminders || reminderStatus.reminders.length === 0) return null;
    const times = reminderStatus.reminders
      .map(r => format(new Date(r.date_time), "HH:mm"))
      .sort()
      .filter((t, i, arr) => arr.indexOf(t) === i);
    if (times.length === 0) return null;
    if (times.length === 1) return times[0];
    return times.join(", ");
  };

  // Format dosage for expanded view
  const formatDosage = () => {
    const parts: string[] = [];
    if (med.dosis_morgens) parts.push(`Mo: ${med.dosis_morgens}`);
    if (med.dosis_mittags) parts.push(`Mi: ${med.dosis_mittags}`);
    if (med.dosis_abends) parts.push(`Ab: ${med.dosis_abends}`);
    if (med.dosis_nacht) parts.push(`Na: ${med.dosis_nacht}`);
    if (med.dosis_bedarf) parts.push(`Bedarf: ${med.dosis_bedarf}`);
    if (med.as_needed_standard_dose) parts.push(med.as_needed_standard_dose);
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  return (
    <Card className={cn(
      "transition-all duration-200",
      isInactive && "opacity-70",
      med.intolerance_flag && "border-destructive/30 bg-destructive/5"
    )}>
      <CardContent className="p-0">
        {/* COLLAPSED HEADER - Always visible, clickable */}
        <button
          onClick={onToggle}
          className={cn(
            "w-full flex items-center gap-3 p-4 text-left",
            "hover:bg-muted/30 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset"
          )}
        >
          {/* Pill Icon */}
          <Pill className={cn(
            "h-5 w-5 shrink-0",
            med.intolerance_flag ? "text-destructive" : "text-primary"
          )} />
          
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Name + Strength */}
              <span className="font-semibold text-sm leading-tight truncate">
                {formatMedNameWithStrength(med)}
              </span>
              {/* Simplified Badge */}
              {getSimpleBadge(med)}
              {/* Active status only if relevant */}
              {med.is_active !== false && !med.discontinued_at && !med.intolerance_flag && (
                <Badge variant="default" className="text-xs bg-green-600/80">Aktiv</Badge>
              )}
            </div>
            
            {/* Optional: Next date for interval meds (collapsed view only) */}
            {!isExpanded && hasActiveReminder && isIntervalMed && getNextDateDisplay() && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3" />
                <span>Nächste: {getNextDateDisplay()}</span>
              </div>
            )}
          </div>
          
          {/* Chevron */}
          <ChevronDown className={cn(
            "h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200",
            isExpanded && "rotate-180"
          )} />
        </button>

        {/* EXPANDED DETAILS */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-3">
            {/* Active ingredient if different from name */}
            {med.wirkstoff && med.wirkstoff.toLowerCase() !== med.name.toLowerCase() && (
              <p className="text-xs text-muted-foreground">
                Wirkstoff: {med.wirkstoff}
              </p>
            )}
            
            {/* Dosage */}
            {formatDosage() && (
              <div className="text-sm">
                <span className="text-muted-foreground text-xs block mb-0.5">Dosierung</span>
                {formatDosage()}
              </div>
            )}

            {/* Frequency / Interval */}
            {med.anwendungsgebiet && (
              <div className="text-sm">
                <span className="text-muted-foreground text-xs block mb-0.5">Anwendung</span>
                {med.anwendungsgebiet}
              </div>
            )}

            {/* Start Date */}
            {med.start_date && (
              <div className="text-sm">
                <span className="text-muted-foreground text-xs block mb-0.5">Startdatum</span>
                {format(new Date(med.start_date), "dd. MMMM yyyy", { locale: de })}
              </div>
            )}

            {/* Reminder status */}
            {!isInactive && (
              <div className="flex items-center gap-2 text-sm">
                {hasActiveReminder ? (
                  <>
                    <Bell className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground text-xs">Erinnerung:</span>
                    {isIntervalMed ? (
                      <span>
                        Nächste am {reminderStatus?.nextTriggerDate 
                          ? format(reminderStatus.nextTriggerDate, "dd. MMM yyyy", { locale: de })
                          : "–"}
                      </span>
                    ) : (
                      <span>{formatReminderTimes()} täglich</span>
                    )}
                  </>
                ) : (
                  <>
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Keine Erinnerung</span>
                  </>
                )}
              </div>
            )}

            {/* Intolerance notes */}
            {med.intolerance_notes && (
              <p className="text-xs text-destructive">⚠️ {med.intolerance_notes}</p>
            )}

            {/* Actions Row */}
            <div className="flex items-center gap-2 pt-2 border-t border-border/30">
              {!isInactive && (
                <Button
                  variant={hasActiveReminder ? "secondary" : "ghost"}
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onReminder(); }}
                  className={cn(
                    "gap-1.5 text-xs",
                    hasActiveReminder && "bg-primary/10 hover:bg-primary/20"
                  )}
                >
                  {hasActiveReminder ? (
                    <Bell className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <BellOff className="h-3.5 w-3.5" />
                  )}
                  Erinnerung
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="gap-1.5 text-xs"
              >
                <Pencil className="h-3.5 w-3.5" />
                Bearbeiten
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="gap-1.5 text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Löschen
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
