import { useState, useEffect } from 'react';
import { Plus, ArrowLeft, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReminderCard } from './ReminderCard';
import { ReminderForm } from './ReminderForm';
import {
  useTodayReminders,
  useUpcomingReminders,
  usePastReminders,
  useCreateReminder,
  useUpdateReminder,
  useDeleteReminder,
  useMarkReminderDone,
} from '@/features/reminders/hooks/useReminders';
import type { Reminder, CreateReminderInput, UpdateReminderInput } from '@/types/reminder.types';
import { notificationService } from '@/lib/notifications';
import { toast } from '@/hooks/use-toast';

type FilterType = 'all' | 'medication' | 'appointment';
type ViewMode = 'list' | 'form';

export const RemindersPage = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);

  const { data: todayReminders = [], isLoading: loadingToday } = useTodayReminders();
  const { data: upcomingReminders = [], isLoading: loadingUpcoming } = useUpcomingReminders();
  const { data: pastReminders = [], isLoading: loadingPast } = usePastReminders();

  const createMutation = useCreateReminder();
  const updateMutation = useUpdateReminder();
  const deleteMutation = useDeleteReminder();
  const markDoneMutation = useMarkReminderDone();

  useEffect(() => {
    setHasNotificationPermission(notificationService.hasPermission());
  }, []);

  const requestNotificationPermission = async () => {
    const granted = await notificationService.requestPermission();
    setHasNotificationPermission(granted);
    
    if (granted) {
      toast({
        title: 'Benachrichtigungen aktiviert',
        description: 'Du erhältst nun Erinnerungen zur richtigen Zeit.',
      });
    } else {
      toast({
        title: 'Benachrichtigungen blockiert',
        description: 'Bitte aktiviere Benachrichtigungen in den Browser-Einstellungen.',
        variant: 'destructive',
      });
    }
  };

  const filterReminders = (reminders: Reminder[]) => {
    if (filterType === 'all') return reminders;
    return reminders.filter((r) => r.type === filterType);
  };

  const handleCreate = (data: CreateReminderInput) => {
    createMutation.mutate(data, {
      onSuccess: (newReminder) => {
        setViewMode('list');
        if (newReminder.notification_enabled && hasNotificationPermission) {
          notificationService.scheduleReminder(newReminder);
        }
      },
    });
  };

  const handleUpdate = (data: UpdateReminderInput) => {
    if (!editingReminder) return;
    
    updateMutation.mutate(
      { id: editingReminder.id, input: data },
      {
        onSuccess: () => {
          setViewMode('list');
          setEditingReminder(null);
        },
      }
    );
  };

  const handleDelete = () => {
    if (!editingReminder) return;
    
    deleteMutation.mutate(editingReminder.id, {
      onSuccess: () => {
        setViewMode('list');
        setEditingReminder(null);
      },
    });
  };

  const handleEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setViewMode('form');
  };

  const handleMarkDone = (id: string) => {
    markDoneMutation.mutate(id);
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingReminder(null);
  };

  if (viewMode === 'form') {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-foreground mb-6">
          {editingReminder ? 'Erinnerung bearbeiten' : 'Neue Erinnerung'}
        </h1>
        <ReminderForm
          reminder={editingReminder || undefined}
          onSubmit={editingReminder ? handleUpdate : handleCreate}
          onCancel={handleCancel}
          onDelete={editingReminder ? handleDelete : undefined}
        />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-safe">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => window.history.back()}
          className="touch-manipulation min-h-11 min-w-11"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Zurück
        </Button>
        
        <h1 className="text-2xl font-bold text-foreground flex-1 text-center">
          Erinnerungen
        </h1>
        
        <div className="w-[100px]" /> {/* Spacer for centering */}
      </div>

      {!hasNotificationPermission && (
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={requestNotificationPermission}
            className="w-full touch-manipulation min-h-11"
          >
            <BellOff className="h-4 w-4 mr-2" />
            Benachrichtigungen aktivieren
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        <Button
          variant={filterType === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterType('all')}
          className="touch-manipulation min-h-11 whitespace-nowrap"
        >
          Alle
        </Button>
        <Button
          variant={filterType === 'medication' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterType('medication')}
          className="touch-manipulation min-h-11 whitespace-nowrap"
        >
          Medikamente
        </Button>
        <Button
          variant={filterType === 'appointment' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterType('appointment')}
          className="touch-manipulation min-h-11 whitespace-nowrap"
        >
          Termine
        </Button>
      </div>

      <div className="mb-4">
        <Button 
          onClick={() => setViewMode('form')}
          className="w-full touch-manipulation min-h-11"
        >
          <Plus className="h-4 w-4 mr-2" />
          Neue Erinnerung
        </Button>
      </div>

      <Tabs defaultValue="today" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="today">Heute</TabsTrigger>
          <TabsTrigger value="upcoming">Zukünftig</TabsTrigger>
          <TabsTrigger value="past">Vergangenheit</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-3 mt-6">
          {loadingToday ? (
            <p className="text-center text-muted-foreground py-8">Laden...</p>
          ) : filterReminders(todayReminders).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Keine Erinnerungen für heute
            </p>
          ) : (
            filterReminders(todayReminders).map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onEdit={handleEdit}
                onMarkDone={handleMarkDone}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-3 mt-6">
          {loadingUpcoming ? (
            <p className="text-center text-muted-foreground py-8">Laden...</p>
          ) : filterReminders(upcomingReminders).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Keine zukünftigen Erinnerungen
            </p>
          ) : (
            filterReminders(upcomingReminders).map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onEdit={handleEdit}
                onMarkDone={handleMarkDone}
                showDate
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-3 mt-6">
          {loadingPast ? (
            <p className="text-center text-muted-foreground py-8">Laden...</p>
          ) : filterReminders(pastReminders).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Keine vergangenen Erinnerungen
            </p>
          ) : (
            filterReminders(pastReminders).map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onEdit={handleEdit}
                onMarkDone={handleMarkDone}
                showDate
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
