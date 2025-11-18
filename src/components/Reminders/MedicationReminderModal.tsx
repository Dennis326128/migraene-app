import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Plus, X, List } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReminderRepeat } from "@/types/reminder.types";
import type { Reminder } from "@/types/reminder.types";

interface MedicationReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicationName: string;
  existingReminders?: Reminder[];
  onSubmit: (reminders: {
    time: string;
    repeat: ReminderRepeat;
    notification_enabled: boolean;
  }[]) => Promise<void>;
}

export const MedicationReminderModal: React.FC<MedicationReminderModalProps> = ({
  isOpen,
  onClose,
  medicationName,
  existingReminders = [],
  onSubmit,
}) => {
  const [times, setTimes] = useState<string[]>(["12:00"]);
  const [repeat, setRepeat] = useState<ReminderRepeat>("daily");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("new");

  const activeReminders = existingReminders.filter(r => r.status === 'pending');

  const handleAddTime = () => {
    setTimes([...times, "12:00"]);
  };

  const handleRemoveTime = (index: number) => {
    if (times.length > 1) {
      setTimes(times.filter((_, i) => i !== index));
    }
  };

  const handleTimeChange = (index: number, newTime: string) => {
    const updatedTimes = [...times];
    updatedTimes[index] = newTime;
    setTimes(updatedTimes);
  };

  const handleSubmit = async () => {
    // Validate all times are set
    if (times.some(time => !time)) {
      toast.error("Bitte alle Uhrzeiten auswählen");
      return;
    }

    setIsSubmitting(true);
    try {
      const reminders = times.map(time => ({
        time,
        repeat,
        notification_enabled: true,
      }));

      await onSubmit(reminders);
      
      // Reset form
      setTimes(["12:00"]);
      setRepeat("daily");
      onClose();
    } catch (error) {
      console.error("Error creating reminders:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTimes(["12:00"]);
    setRepeat("daily");
    onClose();
  };

  // Generate time options (every 30 minutes)
  const timeOptions = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = h.toString().padStart(2, '0');
      const minute = m.toString().padStart(2, '0');
      timeOptions.push(`${hour}:${minute}`);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Erinnerungen für {medicationName}</DialogTitle>
          <DialogDescription>
            Verwalten Sie Erinnerungen für die Medikamenteneinnahme
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new">
              <Plus className="h-4 w-4 mr-2" />
              Neue Erinnerung
            </TabsTrigger>
            <TabsTrigger value="existing">
              <List className="h-4 w-4 mr-2" />
              Aktiv ({activeReminders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-4 mt-4">
            {/* Times */}
            <div className="space-y-3">
              <Label>Einnahmezeiten</Label>
              {times.map((time, index) => (
                <Card key={index}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Select value={time} onValueChange={(value) => handleTimeChange(index, value)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {timeOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option} Uhr
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {times.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveTime(index)}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddTime}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Weitere Uhrzeit hinzufügen
              </Button>
            </div>

            {/* Repeat */}
            <div className="space-y-2">
              <Label>Wiederholung</Label>
              <Select value={repeat} onValueChange={(value) => setRepeat(value as ReminderRepeat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Einmalig</SelectItem>
                  <SelectItem value="daily">Täglich</SelectItem>
                  <SelectItem value="weekly">Wöchentlich</SelectItem>
                  <SelectItem value="monthly">Monatlich</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <p className="text-sm font-medium">Zusammenfassung:</p>
              <div className="flex flex-wrap gap-2">
                {times.map((time, index) => (
                  <Badge key={index} variant="secondary">
                    {time} Uhr
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {repeat === 'none' ? 'Einmalige Erinnerung' : 
                 repeat === 'daily' ? 'Täglich' : 
                 repeat === 'weekly' ? 'Wöchentlich' : 'Monatlich'}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Abbrechen
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Wird erstellt..." : 
                 times.length > 1 ? `${times.length} Erinnerungen erstellen` : "Erinnerung erstellen"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="existing" className="space-y-3 mt-4">
            {activeReminders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Noch keine aktiven Erinnerungen</p>
                <p className="text-sm mt-1">Erstellen Sie Ihre erste Erinnerung im Tab "Neue Erinnerung"</p>
              </div>
            ) : (
              <>
                {activeReminders.map((reminder) => {
                  const time = new Date(reminder.date_time).toLocaleTimeString('de-DE', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  });
                  
                  return (
                    <Card key={reminder.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="h-4 w-4 text-primary" />
                              <span className="font-semibold">{time} Uhr</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {reminder.repeat === 'none' ? 'Einmalig' :
                               reminder.repeat === 'daily' ? 'Täglich' :
                               reminder.repeat === 'weekly' ? 'Wöchentlich' : 'Monatlich'}
                            </p>
                            {reminder.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{reminder.notes}</p>
                            )}
                          </div>
                          <Badge variant={reminder.notification_enabled ? "default" : "secondary"}>
                            {reminder.notification_enabled ? '🔔 Aktiv' : 'Inaktiv'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Schließen
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
