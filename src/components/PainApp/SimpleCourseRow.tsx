import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Syringe, ChevronRight, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { MedicationCourse } from "@/features/medication-courses";
import type { MedicationReminderStatus } from "@/features/reminders/hooks/useMedicationReminders";

interface SimpleCourseRowProps {
  course: MedicationCourse;
  reminderStatus?: MedicationReminderStatus;
  onTap: () => void;
}

/**
 * Format name with dose
 */
const formatCourseDisplay = (course: MedicationCourse): { name: string; dose: string | null } => {
  const name = course.medication_name;
  let dose: string | null = null;
  
  // If dose is already in name, return as-is
  if (!/\d+\s*(mg|ml|µg)/i.test(name) && course.dose_text) {
    const doseMatch = course.dose_text.match(/(\d+\s*(mg|ml|µg|Einheiten?))/i);
    if (doseMatch) dose = doseMatch[1];
  }
  
  return { name, dose };
};

/**
 * SimpleCourseRow - Minimalist course row with tap-to-detail
 * 
 * Shows only: Name, Dose, "Regelmäßig" badge, Active status, Next date (if reminder)
 * Tap opens detail/edit wizard
 */
export const SimpleCourseRow: React.FC<SimpleCourseRowProps> = ({
  course,
  reminderStatus,
  onTap,
}) => {
  const { name, dose } = formatCourseDisplay(course);
  const hasActiveReminder = reminderStatus?.isActive ?? false;
  const nextDate = reminderStatus?.nextTriggerDate;

  return (
    <Card 
      className={cn(
        "transition-all duration-150 cursor-pointer",
        "hover:bg-muted/30 active:scale-[0.99]",
        !course.is_active && "opacity-70"
      )}
      onClick={onTap}
    >
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-4">
          {/* Syringe Icon for courses (prophylaxis often injectable) */}
          <Syringe className="h-5 w-5 shrink-0 text-primary" />
          
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Name */}
              <span className="font-semibold text-sm leading-tight truncate">
                {name}
              </span>
              {/* Dose (if separate) */}
              {dose && (
                <span className="text-sm text-muted-foreground">
                  {dose}
                </span>
              )}
            </div>
            
            {/* Badges row */}
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="text-xs bg-primary/80">Regelmäßig</Badge>
              {course.is_active && (
                <Badge variant="default" className="text-xs bg-green-600/80">Aktiv</Badge>
              )}
              {!course.is_active && (
                <Badge variant="secondary" className="text-xs">Abgesetzt</Badge>
              )}
            </div>
            
            {/* Next reminder date (small, inline) */}
            {hasActiveReminder && nextDate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3" />
                <span>Nächste: {format(nextDate, "dd. MMM", { locale: de })}</span>
              </div>
            )}
          </div>
          
          {/* Chevron - indicates tappable */}
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
};
