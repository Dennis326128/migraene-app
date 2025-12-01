import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Calendar, Star, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import type { MedicationCourse } from "@/features/medication-courses";

interface MedicationCourseCardProps {
  course: MedicationCourse;
  onEdit: (course: MedicationCourse) => void;
  onDelete: (course: MedicationCourse) => void;
}

const TYPE_LABELS: Record<string, string> = {
  prophylaxe: "Prophylaxe",
  akut: "Akutmedikation",
  sonstige: "Sonstige",
};

const TYPE_COLORS: Record<string, string> = {
  prophylaxe: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  akut: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  sonstige: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

const DISCONTINUATION_LABELS: Record<string, string> = {
  keine_wirkung: "Keine Wirkung",
  nebenwirkungen: "Nebenwirkungen",
  migraene_gebessert: "Migräne gebessert",
  kinderwunsch: "Kinderwunsch",
  andere: "Andere Gründe",
};

function formatDateRange(startDate: string, endDate: string | null, isActive: boolean): string {
  const start = parseISO(startDate);
  const startFormatted = format(start, "MM/yyyy", { locale: de });
  
  if (isActive || !endDate) {
    return `seit ${startFormatted}`;
  }
  
  const end = parseISO(endDate);
  const endFormatted = format(end, "MM/yyyy", { locale: de });
  return `${startFormatted} – ${endFormatted}`;
}

export const MedicationCourseCard: React.FC<MedicationCourseCardProps> = ({
  course,
  onEdit,
  onDelete,
}) => {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header: Name + Type */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base leading-tight">
                {course.medication_name}
              </h3>
              <Badge 
                variant="secondary" 
                className={`text-xs ${TYPE_COLORS[course.type]}`}
              >
                {TYPE_LABELS[course.type]}
              </Badge>
              {course.is_active && (
                <Badge variant="default" className="text-xs bg-green-600">
                  Aktiv
                </Badge>
              )}
            </div>

            {/* Dosierung */}
            {course.dose_text && (
              <p className="text-sm text-muted-foreground">
                {course.dose_text}
              </p>
            )}

            {/* Zeitraum */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{formatDateRange(course.start_date, course.end_date, course.is_active)}</span>
            </div>

            {/* Wirksamkeit */}
            {course.subjective_effectiveness !== null && (
              <div className="flex items-center gap-1.5 text-sm">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>Wirkung: {course.subjective_effectiveness}/10</span>
              </div>
            )}

            {/* Nebenwirkungen */}
            {course.had_side_effects && course.side_effects_text && (
              <div className="flex items-start gap-1.5 text-sm text-orange-600 dark:text-orange-400">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="line-clamp-1">{course.side_effects_text}</span>
              </div>
            )}

            {/* Absetzgrund (nur wenn nicht aktiv) */}
            {!course.is_active && course.discontinuation_reason && (
              <p className="text-xs text-muted-foreground">
                Abgesetzt: {DISCONTINUATION_LABELS[course.discontinuation_reason]}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(course)}
              title="Bearbeiten"
              className="h-10 w-10"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(course)}
              title="Löschen"
              className="h-10 w-10"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
