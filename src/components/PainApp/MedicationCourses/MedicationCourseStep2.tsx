import React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface MedicationCourseStep2Props {
  isActive: boolean;
  setIsActive: (active: boolean) => void;
  startDate: Date | undefined;
  setStartDate: (date: Date | undefined) => void;
  endDate: Date | undefined;
  setEndDate: (date: Date | undefined) => void;
}

export const MedicationCourseStep2: React.FC<MedicationCourseStep2Props> = ({
  isActive,
  setIsActive,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}) => {
  return (
    <div className="space-y-6">
      {/* Active Status */}
      <Card className="border-border/50">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Nimmst du dieses Medikament aktuell?</Label>
              <p className="text-sm text-muted-foreground">
                {isActive ? "Ja, aktuell in Einnahme" : "Nein, nicht mehr"}
              </p>
            </div>
            <Switch 
              checked={isActive} 
              onCheckedChange={setIsActive}
              className="scale-110"
            />
          </div>
        </CardContent>
      </Card>

      {/* Start Date */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <div>
            <Label className="text-base font-medium">
              {isActive ? "Seit wann ungefähr?" : "Von wann ungefähr?"}
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              Optional – kannst du später nachtragen
            </p>
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full h-12 justify-start text-left font-normal text-base",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-3 h-5 w-5" />
                {startDate ? format(startDate, "MMMM yyyy", { locale: de }) : "Monat/Jahr auswählen"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(startOfMonth(date))}
                initialFocus
                className="p-3 pointer-events-auto"
                disabled={(date) => date > new Date()}
                captionLayout="dropdown-buttons"
                fromYear={2010}
                toYear={new Date().getFullYear()}
              />
            </PopoverContent>
          </Popover>
          
          {startDate && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setStartDate(undefined)}
            >
              Datum entfernen
            </Button>
          )}
        </CardContent>
      </Card>

      {/* End Date - Only shown when not active */}
      {!isActive && (
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-4">
            <div>
              <Label className="text-base font-medium">Bis wann ungefähr?</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Wann wurde die Behandlung beendet?
              </p>
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-12 justify-start text-left font-normal text-base",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-3 h-5 w-5" />
                  {endDate ? format(endDate, "MMMM yyyy", { locale: de }) : "Monat/Jahr auswählen"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => date && setEndDate(startOfMonth(date))}
                  initialFocus
                  className="p-3 pointer-events-auto"
                  disabled={(date) => date > new Date() || (startDate && date < startDate)}
                  captionLayout="dropdown-buttons"
                  fromYear={2010}
                  toYear={new Date().getFullYear()}
                />
              </PopoverContent>
            </Popover>
            
            {endDate && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setEndDate(undefined)}
              >
                Datum entfernen
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
