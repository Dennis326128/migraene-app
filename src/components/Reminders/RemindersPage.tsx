import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Bell, BellOff, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReminderCard } from './ReminderCard';
import { groupReminders } from '@/features/reminders/helpers/groupReminders';
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
  useToggleAllReminders,
} from '@/features/reminders/hooks/useReminders';
import type { Reminder, CreateReminderInput, UpdateReminderInput, ReminderPrefill } from '@/types/reminder.types';
import { remindersApi } from '@/features/reminders/api/reminders.api';
import { notificationService } from '@/lib/notifications';
import { toast } from '@/hooks/use-toast';

type ViewMode = 'list' | 'form';
type ActiveTab = 'active' | 'history';
type FilterType = 'all' | 'medication' | 'appointment';
type RangeFilter = 'today' | '7days' | '30days' | 'all' | 'next-appointment' | 'next-3-appointments' | 'all-appointments';

interface RemindersPageProps {
  onBack?: () => void;
}

export const RemindersPage = ({ onBack }: RemindersPageProps = {}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [editingGroupReminders, setEditingGroupReminders] = useState<Reminder[]>([]);
  const [prefillData, setPrefillData] = useState<ReminderPrefill | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('active');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all');
  const [lastNonAppointmentFilter, setLastNonAppointmentFilter] = useState<RangeFilter>('all');
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const [formKey, setFormKey] = useState(0); // Force re-mount on new reminder

  const queryClient = useQueryClient();
  const { data: activeReminders = [], isLoading: loadingActive } = useActiveReminders();
  const { data: historyReminders = [], isLoading: loadingHistory } = useHistoryReminders();

  const createMutation = useCreateReminder();
  const createMultipleMutation = useCreateMultipleReminders();
  const updateMutation = useUpdateReminder();
  const deleteMutation = useDeleteReminder();
  const markDoneMutation = useMarkReminderDone();
  const toggleAllMutation = useToggleAllReminders();

  // Compute global notifications status (all active reminders have notification_enabled)
  const allNotificationsEnabled = activeReminders.length > 0 && 
    activeReminders.every(r => r.notification_enabled);
  const someNotificationsEnabled = activeReminders.some(r => r.notification_enabled);

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
  // WICHTIG: Nur für Nicht-Termine-Tabs — Termine haben eigene Logik in handleFilterTypeChange
  useEffect(() => {
    if (activeTab === 'active' && filterType !== 'appointment' && activeReminders.length > 0) {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      const hasOverdue = activeReminders.some(r => new Date(r.date_time) < startOfToday);
      
      if (hasOverdue) {
        setRangeFilter('all');
        return;
      }
      
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      const hasToday = activeReminders.some(r => new Date(r.date_time) <= todayEnd);
      
      if (hasToday) {
        setRangeFilter('today');
        return;
      }
      
      const in7Days = new Date(now);
      in7Days.setDate(in7Days.getDate() + 7);
      const has7Days = activeReminders.some(r => new Date(r.date_time) <= in7Days);
      
      if (has7Days) {
        setRangeFilter('7days');
        return;
      }
      
      const in30Days = new Date(now);
      in30Days.setDate(in30Days.getDate() + 30);
      const has30Days = activeReminders.some(r => new Date(r.date_time) <= in30Days);
      
      if (has30Days) {
        setRangeFilter('30days');
        return;
      }
      
      setRangeFilter('all');
    }
  }, [activeReminders, activeTab, filterType]);

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

  // Alle zukünftigen Termine (für Zählung und "weitere Termine" Hinweis)
  const getAllFutureAppointments = () => {
    const reminders = activeTab === 'active' ? activeReminders : historyReminders;
    const now = new Date();
    return reminders
      .filter(r => r.type === 'appointment' && new Date(r.date_time) >= now)
      .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
  };

  const getFilteredReminders = () => {
    let reminders = activeTab === 'active' ? activeReminders : historyReminders;
    
    // Type filter
    if (filterType !== 'all') {
      reminders = reminders.filter(r => r.type === filterType);
    }
    
    // Termine-Tab: unterscheide zwischen Termin-Modi
    if (filterType === 'appointment') {
      const now = new Date();
      const futureAppointments = reminders
        .filter(r => new Date(r.date_time) >= now)
        .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
      
      if (rangeFilter === 'next-appointment') {
        return futureAppointments.slice(0, 1);
      }
      
      if (rangeFilter === 'next-3-appointments') {
        return futureAppointments.slice(0, 3);
      }
      
      // "Alle Termine": zeige alle zukünftigen
      return futureAppointments;
    }
    
    // Für andere Filter: wende rangeFilter normal an
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
    const grouped = groupReminders(reminders);
    
    return {
      all: grouped.length,
      medication: groupReminders(reminders.filter(r => r.type === 'medication')).length,
      appointment: groupReminders(reminders.filter(r => r.type === 'appointment')).length,
    };
  };

  const typeCounts = getTypeCounts();
  const filteredReminders = getFilteredReminders();

  const handleEdit = (reminder: Reminder, allReminders: Reminder[] = []) => {
    setEditingReminder(reminder);
    setEditingGroupReminders(allReminders.length > 0 ? allReminders : [reminder]);
    setPrefillData(null);
    setViewMode('form');
  };

  const handlePlanFollowUp = (prefill: ReminderPrefill) => {
    setEditingReminder(null);
    setPrefillData(prefill);
    setViewMode('form');
  };

  const handleCreateAnother = (prefill: ReminderPrefill) => {
    // Reset form to create mode with prefilled data
    setEditingReminder(null);
    setPrefillData(prefill);
    // Form will re-render with new prefill data
  };

  const handleMarkDone = async (id: string) => {
    markDoneMutation.mutate(id);
  };

  const handleCreate = (data: CreateReminderInput | CreateReminderInput[] | UpdateReminderInput) => {
    if (Array.isArray(data)) {
      createMultipleMutation.mutate(data, {
        onSuccess: (newReminders) => {
          setViewMode('list');
          setEditingReminder(null);
          setPrefillData(null);
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
      createMutation.mutate(data as CreateReminderInput, {
        onSuccess: (newReminder) => {
          setViewMode('list');
          setEditingReminder(null);
          setPrefillData(null);
          if (newReminder.notification_enabled && hasNotificationPermission) {
            notificationService.scheduleReminder(newReminder);
          }
        },
      });
    }
  };

  const handleUpdate = async (data: CreateReminderInput | CreateReminderInput[] | UpdateReminderInput) => {
    if (!editingReminder) return;

    // Group reconciliation: form returned array of desired reminders
    if (Array.isArray(data)) {
      try {
        // Delete all old reminders in the group
        const deletePromises = editingGroupReminders.map(r => remindersApi.delete(r.id));
        await Promise.all(deletePromises);
        // Create new ones
        const newReminders = await remindersApi.createMultiple(data);
        // Invalidate queries to refetch
        queryClient.invalidateQueries({ queryKey: ['reminders'] });
        queryClient.invalidateQueries({ queryKey: ['reminder-badge'] });
        queryClient.invalidateQueries({ queryKey: ['due-reminders'] });
        // Schedule notifications
        if (hasNotificationPermission) {
          newReminders.forEach((r) => {
            if (r.notification_enabled) {
              notificationService.scheduleReminder(r);
            }
          });
        }
        setViewMode('list');
        setEditingReminder(null);
        setEditingGroupReminders([]);
        setPrefillData(null);
      } catch (error) {
        console.error('Group update failed:', error);
        toast({ title: 'Fehler', description: 'Speichern fehlgeschlagen. Bitte erneut versuchen.', variant: 'destructive' });
      }
      return;
    }
    
    updateMutation.mutate(
      { id: editingReminder.id, input: data as UpdateReminderInput },
      {
        onSuccess: () => {
          setViewMode('list');
          setEditingReminder(null);
          setEditingGroupReminders([]);
          setPrefillData(null);
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
        setPrefillData(null);
      },
    });
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingReminder(null);
    setPrefillData(null);
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
      case 'next-appointment':
        return 'Nächster Termin';
      case 'next-3-appointments':
        return 'Nächste 3 Termine';
      case 'all-appointments':
        return 'Alle Termine';
      default:
        return 'Nächste 7 Tage';
    }
  };

  // Tab-Wechsel-Logik: Bei Termine-Tab automatisch "Nächste 3 Termine" anzeigen
  const handleFilterTypeChange = (newFilterType: FilterType) => {
    if (newFilterType === 'appointment') {
      // Merke den aktuellen Filter, bevor wir auf Termine wechseln
      if (rangeFilter !== 'next-appointment' && rangeFilter !== 'next-3-appointments' && rangeFilter !== 'all-appointments') {
        setLastNonAppointmentFilter(rangeFilter);
      }
      // Smart default: "Nächste 3 Termine" wenn genug vorhanden, sonst "Alle Termine"
      const futureCount = getAllFutureAppointments().length;
      if (futureCount >= 3) {
        setRangeFilter('next-3-appointments');
      } else if (futureCount > 0) {
        setRangeFilter('all-appointments');
      } else {
        setRangeFilter('all-appointments');
      }
    } else if (filterType === 'appointment') {
      // Wechsel von Termine weg: stelle den letzten Filter wieder her
      setRangeFilter(lastNonAppointmentFilter);
    }
    setFilterType(newFilterType);
  };

  const getEmptyStateForActive = () => {
    // Spezifischer Empty-State für "Termine" Tab
    if (filterType === 'appointment') {
      const futureAppts = getAllFutureAppointments();
      if (futureAppts.length === 0) {
        const hasAnyAppointments = activeReminders.some(r => r.type === 'appointment');
        return {
          icon: <Calendar className="w-12 h-12" />,
          title: 'Keine kommenden Termine',
          description: hasAnyAppointments 
            ? 'Alle Termine liegen in der Vergangenheit.'
            : 'Nutze "Neue Erinnerung", um einen Termin hinzuzufügen.',
          cta: (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setPrefillData({ type: 'appointment' } as any);
                setEditingReminder(null);
                setFormKey(prev => prev + 1);
                setViewMode('form');
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Neuen Termin hinzufügen
            </Button>
          ),
        };
      }
      // Should not happen with smart defaults, but safety net
      return {
        icon: <Calendar className="w-12 h-12" />,
        title: 'Keine Termine im gewählten Zeitraum',
        description: `Du hast ${futureAppts.length} kommende${futureAppts.length === 1 ? 'n' : ''} Termin${futureAppts.length === 1 ? '' : 'e'}.`,
        cta: (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setRangeFilter('all-appointments')}
          >
            Alle Termine anzeigen
          </Button>
        ),
      };
    }

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
        key={`reminder-form-${formKey}-${editingReminder?.id || 'new'}`}
        reminder={editingReminder || undefined}
        groupedReminders={editingGroupReminders.length > 0 ? editingGroupReminders : undefined}
        prefill={prefillData || undefined}
        onSubmit={editingReminder ? handleUpdate : handleCreate}
        onCancel={handleCancel}
        onDelete={editingReminder ? handleDelete : undefined}
        onCreateAnother={handleCreateAnother}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader 
        title="Erinnerungen" 
        onBack={onBack}
        action={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const newState = !someNotificationsEnabled;
              toggleAllMutation.mutate(newState, {
                onSuccess: () => {
                  toast({
                    title: newState ? 'Alle Erinnerungen aktiviert' : 'Alle Erinnerungen pausiert',
                    description: newState 
                      ? 'Du erhältst wieder Benachrichtigungen.'
                      : 'Du erhältst keine Benachrichtigungen mehr.',
                  });
                },
              });
            }}
            disabled={toggleAllMutation.isPending || activeReminders.length === 0}
            className="h-10 w-10"
            title={someNotificationsEnabled ? 'Alle pausieren' : 'Alle aktivieren'}
          >
            {someNotificationsEnabled ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>
        }
      />

      <div className="container mx-auto px-4 pb-6">
        <div className="mb-6">
          <Button
            onClick={() => {
              setPrefillData(null);
              setEditingReminder(null);
              setFormKey(prev => prev + 1); // Force form re-mount with fresh date
              setViewMode('form');
            }}
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
                onClick={() => handleFilterTypeChange('all')}
                className="whitespace-nowrap touch-manipulation"
              >
                Alle {typeCounts.all > 0 && `(${typeCounts.all})`}
              </Button>
              <Button
                size="sm"
                variant={filterType === 'medication' ? 'default' : 'outline'}
                onClick={() => handleFilterTypeChange('medication')}
                className="whitespace-nowrap touch-manipulation"
              >
                Medikamente {typeCounts.medication > 0 && `(${typeCounts.medication})`}
              </Button>
              <Button
                size="sm"
                variant={filterType === 'appointment' ? 'default' : 'outline'}
                onClick={() => handleFilterTypeChange('appointment')}
                className="whitespace-nowrap touch-manipulation"
              >
                Termine {typeCounts.appointment > 0 && `(${typeCounts.appointment})`}
              </Button>
            </div>

            <div className="flex justify-end mb-4">
              <Select 
                value={rangeFilter} 
                onValueChange={(v) => {
                  const newRange = v as RangeFilter;
                  setRangeFilter(newRange);
                  // Merke den Filter für Nicht-Termine-Tabs
                  if (filterType !== 'appointment') {
                    setLastNonAppointmentFilter(newRange);
                  }
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <SelectValue placeholder="Zeitraum wählen">
                      {getRangeLabel()}
                    </SelectValue>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {filterType === 'appointment' ? (
                    <>
                      <SelectItem value="next-appointment">Nächster Termin</SelectItem>
                      <SelectItem value="next-3-appointments">Nächste 3 Termine</SelectItem>
                      <SelectItem value="all-appointments">Alle Termine</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="today">Heute</SelectItem>
                      <SelectItem value="7days">Nächste 7 Tage</SelectItem>
                      <SelectItem value="30days">Nächste 30 Tage</SelectItem>
                      <SelectItem value="all">Alle</SelectItem>
                    </>
                  )}
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
                {groupReminders(filteredReminders).map((grouped) => (
                  <ReminderCard
                    key={grouped.reminder.id}
                    grouped={grouped}
                    onEdit={handleEdit}
                    onMarkDone={handleMarkDone}
                    onPlanFollowUp={handlePlanFollowUp}
                  />
                ))}
                
                {/* Hinweis auf weitere Termine bei begrenzter Anzeige */}
                {filterType === 'appointment' && (rangeFilter === 'next-appointment' || rangeFilter === 'next-3-appointments') && (() => {
                  const allFuture = getAllFutureAppointments();
                  const shownCount = rangeFilter === 'next-appointment' ? 1 : 3;
                  const additionalCount = allFuture.length - shownCount;
                  if (additionalCount > 0) {
                    return (
                      <button
                        onClick={() => setRangeFilter('all-appointments')}
                        className="w-full py-3 px-4 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>+ {additionalCount} weitere{additionalCount === 1 ? 'r' : ''} Termin{additionalCount === 1 ? '' : 'e'}</span>
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : (() => {
              const emptyState = getEmptyStateForActive();
              return (
                <div>
                  <EmptyState
                    icon={emptyState.icon}
                    title={emptyState.title}
                    description={emptyState.description}
                  />
                  {emptyState.cta && (
                    <div className="flex justify-center">
                      {emptyState.cta}
                    </div>
                  )}
                </div>
              );
            })()}
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
                {groupReminders(filteredReminders).map((grouped) => (
                  <ReminderCard
                    key={grouped.reminder.id}
                    grouped={grouped}
                    onEdit={handleEdit}
                    onMarkDone={handleMarkDone}
                    onPlanFollowUp={handlePlanFollowUp}
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
