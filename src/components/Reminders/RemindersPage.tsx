import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Bell, BellOff, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReminderCard } from './ReminderCard';
import { groupReminders, type GroupedReminder } from '@/features/reminders/helpers/groupReminders';
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
type FilterType = 'aktuell' | 'medication' | 'appointment';
type RangeFilter = 'today' | '7days' | '30days' | 'all' | 'next-appointment' | 'next-3-appointments' | 'all-appointments';

interface RemindersPageProps {
  onBack?: () => void;
}

/**
 * Relevance window check: determines if a reminder is relevant for the "Aktuell" tab.
 * - Overdue: always visible
 * - Today: always visible
 * - Medication: visible if next trigger <= now + 24h
 * - Appointment: visible if date_time <= now + 2 days
 */
function isRelevantForAktuell(reminder: Reminder, now: Date): boolean {
  const reminderDate = new Date(reminder.date_time);

  // Overdue: always relevant
  if (reminderDate < now && reminder.status === 'pending') {
    return true;
  }

  // Today: always relevant
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  if (reminderDate <= endOfToday) {
    return true;
  }

  // Medication: 24h rolling window
  if (reminder.type === 'medication') {
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return reminderDate <= in24h;
  }

  // Appointment: 2 days rolling window
  if (reminder.type === 'appointment') {
    const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    return reminderDate <= in2Days;
  }

  return false;
}

export const RemindersPage = ({ onBack }: RemindersPageProps = {}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [editingGroupReminders, setEditingGroupReminders] = useState<Reminder[]>([]);
  const [prefillData, setPrefillData] = useState<ReminderPrefill | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('active');
  // Default filter type is "aktuell" (was "all")
  const [filterType, setFilterType] = useState<FilterType>('aktuell');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all');
  const [lastNonAppointmentFilter, setLastNonAppointmentFilter] = useState<RangeFilter>('all');
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const queryClient = useQueryClient();
  const { data: activeReminders = [], isLoading: loadingActive } = useActiveReminders();
  const { data: historyReminders = [], isLoading: loadingHistory } = useHistoryReminders();

  const createMutation = useCreateReminder();
  const createMultipleMutation = useCreateMultipleReminders();
  const updateMutation = useUpdateReminder();
  const deleteMutation = useDeleteReminder();
  const markDoneMutation = useMarkReminderDone();
  const toggleAllMutation = useToggleAllReminders();

  const allNotificationsEnabled = activeReminders.length > 0 && 
    activeReminders.every(r => r.notification_enabled);
  const someNotificationsEnabled = activeReminders.some(r => r.notification_enabled);

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

  // Alle zukünftigen Termine (für Zählung und "weitere Termine" Hinweis)
  const getAllFutureAppointments = () => {
    const reminders = activeTab === 'active' ? activeReminders : historyReminders;
    const now = new Date();
    return reminders
      .filter(r => r.type === 'appointment' && new Date(r.date_time) >= now)
      .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
  };

  /**
   * SINGLE SOURCE OF TRUTH: Returns visible reminders for a given tab type.
   * Counter and rendered list both use this function.
   *
   * Tab semantics:
   * - "aktuell": relevance-based (overdue + today + 24h meds + 2d appointments)
   * - "medication": all active medication reminders (with optional range filter)
   * - "appointment": all future appointments (with optional special modes)
   */
  const getVisibleRemindersForTab = (tab: FilterType): Reminder[] => {
    let reminders = activeTab === 'active' ? activeReminders : historyReminders;

    const now = new Date();

    // TAB: AKTUELL — relevance-based, no range dropdown
    if (tab === 'aktuell') {
      // Only pending/active reminders that are relevant now
      return reminders.filter(r => isRelevantForAktuell(r, now));
    }

    // TAB: MEDIKAMENTE — all active medication reminders with range filter
    if (tab === 'medication') {
      reminders = reminders.filter(r => r.type === 'medication');
      // Apply range filter for medication tab
      return applyDateRangeFilter(reminders);
    }

    // TAB: TERMINE — all future appointments with special modes
    if (tab === 'appointment') {
      reminders = reminders.filter(r => r.type === 'appointment');
      const futureAppointments = reminders
        .filter(r => new Date(r.date_time) >= now)
        .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());

      if (rangeFilter === 'next-appointment') {
        return futureAppointments.slice(0, 1);
      }
      if (rangeFilter === 'next-3-appointments') {
        return futureAppointments.slice(0, 3);
      }
      // 'all-appointments' or default: all future
      return futureAppointments;
    }

    return reminders;
  };

  /**
   * Date range filter for medication tab only.
   * Includes overdue items always.
   */
  const applyDateRangeFilter = (reminders: Reminder[]): Reminder[] => {
    if (activeTab !== 'active' || rangeFilter === 'all') {
      return reminders;
    }

    // Appointment-specific filters don't apply as date ranges
    if (rangeFilter === 'next-appointment' || rangeFilter === 'next-3-appointments' || rangeFilter === 'all-appointments') {
      return reminders;
    }

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

    return reminders.filter(r => {
      const reminderDate = new Date(r.date_time);
      const isOverdue = reminderDate < startOfToday;
      const isInRange = reminderDate <= endDate;
      return isOverdue || isInRange;
    });
  };

  // Rendered list: uses the active tab's visibility logic
  const visibleReminders = getVisibleRemindersForTab(filterType);

  /**
   * Counter uses same filtered+grouped dataset as rendered list per type.
   * badge = visible card count. Always.
   */
  const typeCounts = (() => {
    const aktuellGroups = groupReminders(getVisibleRemindersForTab('aktuell'));
    const medGroups = groupReminders(getVisibleRemindersForTab('medication'));
    const aptGroups = groupReminders(getVisibleRemindersForTab('appointment'));
    return {
      aktuell: aktuellGroups.length,
      medication: medGroups.length,
      appointment: aptGroups.length,
    };
  })();

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
    setEditingReminder(null);
    setPrefillData(prefill);
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

    if (Array.isArray(data)) {
      try {
        const deletePromises = editingGroupReminders.map(r => remindersApi.delete(r.id));
        await Promise.all(deletePromises);
        const newReminders = await remindersApi.createMultiple(data);
        queryClient.invalidateQueries({ queryKey: ['reminders'] });
        queryClient.invalidateQueries({ queryKey: ['reminder-badge'] });
        queryClient.invalidateQueries({ queryKey: ['due-reminders'] });
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
      case 'today': return 'Heute';
      case '7days': return 'Nächste 7 Tage';
      case '30days': return 'Nächste 30 Tage';
      case 'all': return 'Alle';
      case 'next-appointment': return 'Nächster Termin';
      case 'next-3-appointments': return 'Nächste 3 Termine';
      case 'all-appointments': return 'Alle Termine';
      default: return 'Alle';
    }
  };

  // Tab-Wechsel-Logik
  const handleFilterTypeChange = (newFilterType: FilterType) => {
    if (newFilterType === 'appointment') {
      if (rangeFilter !== 'next-appointment' && rangeFilter !== 'next-3-appointments' && rangeFilter !== 'all-appointments') {
        setLastNonAppointmentFilter(rangeFilter);
      }
      const futureCount = getAllFutureAppointments().length;
      if (futureCount >= 3) {
        setRangeFilter('next-3-appointments');
      } else {
        setRangeFilter('all-appointments');
      }
    } else if (filterType === 'appointment') {
      setRangeFilter(lastNonAppointmentFilter);
    }
    setFilterType(newFilterType);
  };

  const getEmptyStateForActive = () => {
    // Spezifischer Empty-State für "Aktuell" Tab
    if (filterType === 'aktuell') {
      return {
        icon: <Clock className="w-12 h-12" />,
        title: 'Aktuell ist nichts fällig',
        description: 'Medikamente und Termine findest du in den jeweiligen Tabs.',
      };
    }

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

    // Medikamente empty state
    if (filterType === 'medication') {
      if (activeReminders.filter(r => r.type === 'medication').length === 0) {
        return {
          icon: <Bell className="w-12 h-12" />,
          title: 'Keine Medikamenten-Erinnerungen',
          description: 'Nutze "Neue Erinnerung", um eine hinzuzufügen.',
        };
      }
      return {
        icon: <Clock className="w-12 h-12" />,
        title: `Keine Erinnerungen ${rangeFilter === 'today' ? 'für heute' : getRangeLabel().toLowerCase()}`,
        description: 'Ändere den Zeitraum oben rechts.',
      };
    }

    if (activeReminders.length === 0) {
      return {
        icon: <Bell className="w-12 h-12" />,
        title: 'Keine aktiven Erinnerungen',
        description: 'Nutze "Neue Erinnerung", um Medikamente oder Termine hinzuzufügen.',
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

  // Whether to show the range dropdown (hidden for "Aktuell" tab)
  const showRangeDropdown = filterType !== 'aktuell';

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
              setFormKey(prev => prev + 1);
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
            {/* Tab-Reihenfolge: Aktuell (Default) | Medikamente | Termine */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              <Button
                size="sm"
                variant={filterType === 'aktuell' ? 'default' : 'outline'}
                onClick={() => handleFilterTypeChange('aktuell')}
                className="whitespace-nowrap touch-manipulation"
              >
                Aktuell {typeCounts.aktuell > 0 && `(${typeCounts.aktuell})`}
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

            {/* Range dropdown: hidden for "Aktuell" tab, shown for Medikamente/Termine */}
            {showRangeDropdown && (
              <div className="flex justify-end mb-4">
                <Select 
                  value={rangeFilter} 
                  onValueChange={(v) => {
                    const newRange = v as RangeFilter;
                    setRangeFilter(newRange);
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
            )}

            {isLoading ? (
              <div className="space-y-3">
                <div className="h-24 bg-muted animate-pulse rounded-lg" />
                <div className="h-24 bg-muted animate-pulse rounded-lg" />
                <div className="h-24 bg-muted animate-pulse rounded-lg" />
              </div>
            ) : visibleReminders.length > 0 ? (
              <div className="space-y-3">
                {groupReminders(visibleReminders).map((grouped) => (
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
                variant={filterType === 'aktuell' ? 'default' : 'outline'}
                onClick={() => setFilterType('aktuell')}
                className="whitespace-nowrap touch-manipulation"
              >
                Alle {typeCounts.aktuell > 0 && `(${typeCounts.aktuell})`}
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
            ) : visibleReminders.length > 0 ? (
              <div className="space-y-3">
                {groupReminders(visibleReminders).map((grouped) => (
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
