import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Bell, BellOff, ChevronDown, Calendar, Star, AlertCircle, Syringe } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { MedicationCourse } from "@/features/medication-courses";
import type { MedicationReminderStatus } from "@/features/reminders/hooks/useMedicationReminders";

interface AccordionMedicationCourseCardProps {
  course: MedicationCourse;
  reminderStatus?: MedicationReminderStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: (course: MedicationCourse) => void;
  onDelete: (course: MedicationCourse) => void;
  onReminder?: (course: MedicationCourse) => void;
}

const DISCONTINUATION_LABELS: Record<string, string> = {
  keine_wirkung: "Keine Wirkung",
  nebenwirkungen: "Nebenwirkungen",
  migraene_gebessert: "Migräne gebessert",
  kinderwunsch: "Kinderwunsch",
  andere: "Andere Gründe",
};

/**
 * Format name with dose for collapsed view
 */
const formatCourseNameWithDose = (course: MedicationCourse): string => {
  // Extract dose from medication_name or dose_text
  const name = course.medication_name;
  // If dose is already in name, return as-is
  if (/\d+\s*(mg|ml|µg)/i.test(name)) return name;
  // If dose_text contains a simple dose, append it
  if (course.dose_text) {
    const doseMatch = course.dose_text.match(/(\d+\s*(mg|ml|µg|Einheiten?))/i);
    if (doseMatch) return `${name} ${doseMatch[1]}`;
  }
  return name;
};

export const AccordionMedicationCourseCard: React.FC<AccordionMedicationCourseCardProps> = ({
  course,
  reminderStatus,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onReminder,
}) => {
  const hasActiveReminder = reminderStatus?.isActive ?? false;
  
  // Get next date for collapsed view
  const getNextDateDisplay = () => {
    if (!reminderStatus?.nextTriggerDate) return null;
    return format(reminderStatus.nextTriggerDate, "dd. MMM", { locale: de });
  };

  return (
    <Card className="transition-all duration-200">
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
          {/* Syringe Icon for courses (prophylaxis often injectable) */}
          <Syringe className="h-5 w-5 shrink-0 text-primary" />
          
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Name + Dose */}
              <span className="font-semibold text-sm leading-tight truncate">
                {formatCourseNameWithDose(course)}
              </span>
              {/* Simplified Badge - always "Regelmäßig" for courses */}
              <Badge variant="default" className="text-xs bg-primary/80">Regelmäßig</Badge>
              {/* Active status */}
              {course.is_active && (
                <Badge variant="default" className="text-xs bg-green-600/80">Aktiv</Badge>
              )}
            </div>
            
            {/* Optional: Next date for interval meds (collapsed view only) */}
            {!isExpanded && hasActiveReminder && getNextDateDisplay() && (
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
            {/* Full Dosage / Frequency */}
            {course.dose_text && (
              <div className="text-sm">
                <span className="text-muted-foreground text-xs block mb-0.5">Dosierung</span>
                {course.dose_text}
              </div>
            )}

            {/* Start Date */}
            {course.start_date && (
              <div className="text-sm">
                <span className="text-muted-foreground text-xs block mb-0.5">Startdatum</span>
                {format(parseISO(course.start_date), "dd. MMMM yyyy", { locale: de })}
              </div>
            )}

            {/* End Date for inactive */}
            {!course.is_active && course.end_date && (
              <div className="text-sm">
                <span className="text-muted-foreground text-xs block mb-0.5">Abgesetzt am</span>
                {format(parseISO(course.end_date), "dd. MMMM yyyy", { locale: de })}
              </div>
            )}

            {/* Effectiveness */}
            {course.subjective_effectiveness !== null && (
              <div className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-muted-foreground text-xs">Wirkung:</span>
                <span>{course.subjective_effectiveness}/10</span>
              </div>
            )}

            {/* Side effects */}
            {course.had_side_effects && course.side_effects_text && (
              <div className="flex items-start gap-2 text-sm text-orange-600 dark:text-orange-400">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{course.side_effects_text}</span>
              </div>
            )}

            {/* Reminder status (only for active courses) */}
            {course.is_active && onReminder && (
              <div className="flex items-center gap-2 text-sm">
                {hasActiveReminder ? (
                  <>
                    <Bell className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground text-xs">Erinnerung:</span>
                    <span>
                      Nächste am {reminderStatus?.nextTriggerDate 
                        ? format(reminderStatus.nextTriggerDate, "dd. MMM yyyy", { locale: de })
                        : "–"}
                    </span>
                  </>
                ) : (
                  <>
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Keine Erinnerung</span>
                  </>
                )}
              </div>
            )}

            {/* Discontinuation reason (only for inactive) */}
            {!course.is_active && course.discontinuation_reason && (
              <p className="text-xs text-muted-foreground">
                Abgesetzt: {DISCONTINUATION_LABELS[course.discontinuation_reason] || course.discontinuation_reason}
              </p>
            )}

            {/* Actions Row */}
            <div className="flex items-center gap-2 pt-2 border-t border-border/30">
              {course.is_active && onReminder && (
                <Button
                  variant={hasActiveReminder ? "secondary" : "ghost"}
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onReminder(course); }}
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
                onClick={(e) => { e.stopPropagation(); onEdit(course); }}
                className="gap-1.5 text-xs"
              >
                <Pencil className="h-3.5 w-3.5" />
                Bearbeiten
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDelete(course); }}
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
