import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Clock, Pill, X } from "lucide-react";
import { usePendingReminders } from "@/features/events/hooks/useEvents";
import { EffectDocumentationModal } from "./EffectDocumentationModal";

export const ReminderNotifications: React.FC = () => {
  const { data: reminders = [], refetch } = usePendingReminders();
  const [selectedReminder, setSelectedReminder] = useState<any>(null);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [dismissedReminders, setDismissedReminders] = useState<Set<number>>(new Set());

  // Auto-refetch every 5 minutes when component is mounted
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [refetch]);

  const activeReminders = reminders.filter(r => !dismissedReminders.has(r.id));

  const handleDocumentEffect = (reminder: any) => {
    setSelectedReminder(reminder);
    setDocumentationOpen(true);
  };

  const handleDismissReminder = (reminderId: number) => {
    setDismissedReminders(prev => new Set(prev).add(reminderId));
  };

  const formatTimeAgo = (scheduledFor: string) => {
    const minutes = Math.round((Date.now() - new Date(scheduledFor).getTime()) / (1000 * 60));
    if (minutes < 60) return `vor ${minutes} Min`;
    const hours = Math.round(minutes / 60);
    return `vor ${hours}h`;
  };

  if (activeReminders.length === 0) {
    return null;
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
        {activeReminders.slice(0, 3).map((reminder) => { // Show max 3 notifications
          const medName = reminder.event_meds?.user_medications?.name || "Medikament";
          const timeAgo = formatTimeAgo(reminder.scheduled_for);
          
          return (
            <Card key={reminder.id} className="border-primary bg-primary/5 shadow-lg animate-in slide-in-from-right">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bell className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Pill className="w-4 h-4 text-muted-foreground" />
                      <p className="font-medium text-sm">{medName}</p>
                      <Badge variant="secondary" className="text-xs">
                        {timeAgo}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3">
                      Wie hat das Medikament gewirkt?
                    </p>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleDocumentEffect(reminder)}
                        className="flex-1"
                      >
                        <Clock className="w-3 h-3 mr-1" />
                        Bewerten
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDismissReminder(reminder.id)}
                        className="px-2"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {activeReminders.length > 3 && (
          <Card className="border-muted bg-muted/20">
            <CardContent className="p-3 text-center">
              <p className="text-sm text-muted-foreground">
                +{activeReminders.length - 3} weitere Erinnerungen
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <EffectDocumentationModal
        open={documentationOpen}
        onOpenChange={(open) => {
          setDocumentationOpen(open);
          if (!open) {
            setSelectedReminder(null);
            // Refresh reminders after documentation
            refetch();
          }
        }}
        reminder={selectedReminder}
      />
    </>
  );
};