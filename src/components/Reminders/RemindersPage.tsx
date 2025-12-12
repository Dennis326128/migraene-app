import { useState, useEffect } from 'react';
import { Plus, Bell, BellOff, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReminderCard } from './ReminderCard';
import { ReminderForm } from './ReminderForm';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useActiveReminders,
  useHistoryReminders,
  useCreateReminder,
  useCreateMultipleReminders,
  useUpdateReminder,
  useDeleteReminder,
  useMarkReminderDone,
} from '@/features/reminders/hooks/useReminders';
import type { Reminder, CreateReminderInput, UpdateReminderInput } from '@/types/reminder.types';
import { notificationService } from '@/lib/notifications';
import { toast } from '@/hooks/use-toast';

type ViewMode = 'list' | 'form';
type ActiveTab = 'active' | 'history';
type FilterType = 'all' | 'medication' | 'appointment';
type RangeFilter = 'today' | '7days' | '30days' | 'all';

interface RemindersPageProps {
  onBack?: () => void;
}

export const RemindersPage = ({ onBack }: RemindersPageProps = {}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('active');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all');
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);

  const { data: activeReminders = [], isLoading: loadingActive } = useActiveReminders();
  const { data: historyReminders = [], isLoading: loadingHistory } = useHistoryReminders();

  const createMutation = useCreateReminder();
  const createMultipleMutation = useCreateMultipleReminders();
  const updateMutation = useUpdateReminder();
  const deleteMutation = useDeleteReminder();
  const markDoneMutation = useMarkReminderDone();

  useEffect(() => {
    setHasNotificationPermission(notificationService.hasPermission());
  }, []);

  // Konsistenz-Check: Warnung wenn aktive Erinnerungen nicht angezeigt werden
  useEffect(() => {
    if (!loadingActive && activeReminders.length > 0) {
      const filtered = getFilteredReminders();
      if (activeTab === 'active' && filtered.length < activeReminders.length) {
        const hiddenCount = activeReminders.length - filtered.length;
        console.warn(
          `[RemindersPage] ${hiddenCount} aktive Erinnerungen werden durch Filter ausgeblendet. ` +
          `Gesamt: ${activeReminders.length}, Angezeigt: ${filtered.length}`
        );
      }
    }
  }, [activeReminders, filterType, rangeFilter, activeTab, loadingActive]);

  // Intelligente Zeitraum-Auswahl basierend auf vorhandenen Erinnerungen
  // Standardmäßig "Alle" wenn es überfällige gibt, sonst basierend auf nächsten Terminen
  useEffect(() => {
    if (activeTab === 'active' && activeReminders.length > 0) {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      // Prüfen ob es überfällige Erinnerungen gibt
      const hasOverdue = activeReminders.some(r => new Date(r.date_time) < startOfToday);
      
      if (hasOverdue) {
        // Bei überfälligen immer "Alle" anzeigen, damit nichts versteckt wird
        setRangeFilter('all');
        return;
      }
      
      // Prüfen, ob es heute Erinnerungen gibt
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      const hasToday = activeReminders.some(r => 
        new Date(r.date_time) <= todayEnd
      );
      
      if (hasToday) {
        setRangeFilter('today');
        return;
      }
      
      // Prüfen, ob es Erinnerungen in den nächsten 7 Tagen gibt
      const in7Days = new Date(now);
      in7Days.setDate(in7Days.getDate() + 7);
      const has7Days = activeReminders.some(r => 
        new Date(r.date_time) <= in7Days
      );
      
      if (has7Days) {
        setRangeFilter('7days');
        return;
      }
      
      // Prüfen, ob es Erinnerungen in den nächsten 30 Tagen gibt
      const in30Days = new Date(now);
      in30Days.setDate(in30Days.getDate() + 30);
      const has30Days = activeReminders.some(r => 
        new Date(r.date_time) <= in30Days
      );
      
      if (has30Days) {
        setRangeFilter('30days');
        return;
      }
      
      // Ansonsten alle anzeigen
      setRangeFilter('all');
    }
  }, [activeReminders, activeTab]);

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

  const getFilteredReminders = () => {
    let reminders = activeTab === 'active' ? activeReminders : historyReminders;
    
    // Typ-Filter
    if (filterType !== 'all') {
      reminders = reminders.filter(r => r.type === filterType);
    }
    
    // Zeitraum-Filter (nur für "Aktiv"-Tab)
    // WICHTIG: Bei "all" keine Datumsfilterung, damit überfällige Erinnerungen sichtbar bleiben
    if (activeTab === 'active' && rangeFilter !== 'all') {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const endDate = new Date(now);
      
      switch (rangeFilter) {
        case 'today':
          endDate.setHours(23, 59, 59, 999);
          break;
        case '7days':
          endDate.setDate(endDate.getDate() + 7);
          break;
        case '30days':
          endDate.setDate(endDate.getDate() + 30);
          break;
      }
      
      // Zeige überfällige Erinnerungen (vor heute) ODER Erinnerungen im gewählten Zeitraum
      reminders = reminders.filter(r => {
        const reminderDate = new Date(r.date_time);
        const isOverdue = reminderDate < startOfToday;
        const isInRange = reminderDate <= endDate;
        return isOverdue || isInRange;
      });
    }
    
    return reminders;
  };

  const getTypeCounts = () => {
    const reminders = activeTab === 'active' ? activeReminders : historyReminders;
    
    return {
      all: reminders.length,
      medication: reminders.filter(r => r.type === 'medication').length,
      appointment: reminders.filter(r => r.type === 'appointment').length,
    };
  };

  const typeCounts = getTypeCounts();
  const filteredReminders = getFilteredReminders();

  const handleEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setViewMode('form');
  };

  const handleMarkDone = async (id: string) => {
    markDoneMutation.mutate(id);
  };

  const handleCreate = (data: CreateReminderInput | CreateReminderInput[]) => {
    if (Array.isArray(data)) {
      createMultipleMutation.mutate(data, {
        onSuccess: (newReminders) => {
          setViewMode('list');
          setEditingReminder(null);
          if (hasNotificationPermission) {
            newReminders.forEach((reminder) => {
              if (reminder.notification_enabled) {
                notificationService.scheduleReminder(reminder);
              }
            });
          }
        },
      });
    } else {
      createMutation.mutate(data, {
        onSuccess: (newReminder) => {
          setViewMode('list');
          setEditingReminder(null);
          if (newReminder.notification_enabled && hasNotificationPermission) {
            notificationService.scheduleReminder(newReminder);
          }
        },
      });
    }
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

  const handleCancel = () => {
    setViewMode('list');
    setEditingReminder(null);
  };

  const getRangeLabel = () => {
    switch (rangeFilter) {
      case 'today':
        return 'Heute';
      case '7days':
        return 'Nächste 7 Tage';
      case '30days':
        return 'Nächste 30 Tage';
      case 'all':
        return 'Alle';
      default:
        return 'Nächste 7 Tage';
    }
  };

  const getEmptyStateForActive = () => {
    if (activeReminders.length === 0) {
      return {
        icon: <Bell className="w-12 h-12" />,
        title: 'Keine aktiven Erinnerungen',
        description: 'Nutze "Neue Erinnerung", um Medikamente oder Termine hinzuzufügen.',
      };
    }
    
    if (filteredReminders.length === 0 && rangeFilter !== 'all') {
      const nextRangeHint = rangeFilter === 'today' 
        ? 'in den nächsten Tagen' 
        : rangeFilter === '7days'
        ? 'in den nächsten 30 Tagen'
        : 'später';
        
      return {
        icon: <Clock className="w-12 h-12" />,
        title: `Keine Erinnerungen ${rangeFilter === 'today' ? 'für heute' : getRangeLabel().toLowerCase()}`,
        description: `Du hast noch Erinnerungen ${nextRangeHint}. Ändere den Zeitraum oben rechts.`,
      };
    }
    
    return {
      icon: <Clock className="w-12 h-12" />,
      title: 'Keine Erinnerungen gefunden',
      description: 'Mit den aktuellen Filtern gibt es keine Erinnerungen.',
    };
  };

  const isLoading = activeTab === 'active' ? loadingActive : loadingHistory;

  if (viewMode === 'form') {
    return (
      <ReminderForm
        reminder={editingReminder}
        onSubmit={editingReminder ? handleUpdate : handleCreate}
        onCancel={handleCancel}
        onDelete={editingReminder ? handleDelete : undefined}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader 
        title="Erinnerungen" 
        onBack={onBack}
      />

      <div className="container mx-auto px-4 pb-6">
        <div className="mb-6">
          <Button
            onClick={() => setViewMode('form')}
            className="w-full touch-manipulation min-h-14 text-lg font-semibold shadow-md"
            size="lg"
          >
            <Plus className="w-6 h-6 mr-3" />
            Neue Erinnerung
          </Button>
        </div>

        {!hasNotificationPermission && (
          <div className="mb-4">
            <Button
              onClick={requestNotificationPermission}
              variant="outline"
              className="w-full"
            >
              <BellOff className="w-5 h-5 mr-2" />
              Benachrichtigungen aktivieren
            </Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="active">Aktiv</TabsTrigger>
            <TabsTrigger value="history">Historie</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-0">
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              <Button
                size="sm"
                variant={filterType === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterType('all')}
                className="whitespace-nowrap touch-manipulation"
              >
                Alle {typeCounts.all > 0 && `(${typeCounts.all})`}
              </Button>
              <Button
                size="sm"
                variant={filterType === 'medication' ? 'default' : 'outline'}
                onClick={() => setFilterType('medication')}
                className="whitespace-nowrap touch-manipulation"
              >
                Medikamente {typeCounts.medication > 0 && `(${typeCounts.medication})`}
              </Button>
              <Button
                size="sm"
                variant={filterType === 'appointment' ? 'default' : 'outline'}
                onClick={() => setFilterType('appointment')}
                className="whitespace-nowrap touch-manipulation"
              >
                Termine {typeCounts.appointment > 0 && `(${typeCounts.appointment})`}
              </Button>
            </div>

            <div className="flex justify-end mb-4">
              <Select value={rangeFilter} onValueChange={(v) => setRangeFilter(v as RangeFilter)}>
                <SelectTrigger className="w-[200px]">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <SelectValue placeholder="Zeitraum wählen" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Heute</SelectItem>
                  <SelectItem value="7days">Nächste 7 Tage</SelectItem>
                  <SelectItem value="30days">Nächste 30 Tage</SelectItem>
                  <SelectItem value="all">Alle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <div className="h-24 bg-muted animate-pulse rounded-lg" />
                <div className="h-24 bg-muted animate-pulse rounded-lg" />
                <div className="h-24 bg-muted animate-pulse rounded-lg" />
              </div>
            ) : filteredReminders.length > 0 ? (
              <div className="space-y-3">
                {filteredReminders.map((reminder) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    onEdit={handleEdit}
                    onMarkDone={handleMarkDone}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={getEmptyStateForActive().icon}
                title={getEmptyStateForActive().title}
                description={getEmptyStateForActive().description}
              />
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              <Button
                size="sm"
                variant={filterType === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterType('all')}
                className="whitespace-nowrap touch-manipulation"
              >
                Alle {typeCounts.all > 0 && `(${typeCounts.all})`}
              </Button>
              <Button
                size="sm"
                variant={filterType === 'medication' ? 'default' : 'outline'}
                onClick={() => setFilterType('medication')}
                className="whitespace-nowrap touch-manipulation"
              >
                Medikamente {typeCounts.medication > 0 && `(${typeCounts.medication})`}
              </Button>
              <Button
                size="sm"
                variant={filterType === 'appointment' ? 'default' : 'outline'}
                onClick={() => setFilterType('appointment')}
                className="whitespace-nowrap touch-manipulation"
              >
                Termine {typeCounts.appointment > 0 && `(${typeCounts.appointment})`}
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <div className="h-24 bg-muted animate-pulse rounded-lg" />
                <div className="h-24 bg-muted animate-pulse rounded-lg" />
                <div className="h-24 bg-muted animate-pulse rounded-lg" />
              </div>
            ) : filteredReminders.length > 0 ? (
              <div className="space-y-3">
                {filteredReminders.map((reminder) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    onEdit={handleEdit}
                    onMarkDone={handleMarkDone}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Calendar className="w-12 h-12" />}
                title={historyReminders.length === 0 ? "Noch keine Historie vorhanden" : "Keine Erinnerungen gefunden"}
                description={
                  historyReminders.length === 0
                    ? "Sobald vergangene Erinnerungen vorliegen, werden diese hier angezeigt."
                    : "Mit den aktuellen Filtern gibt es keine Erinnerungen."
                }
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};