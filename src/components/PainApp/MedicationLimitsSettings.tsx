import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Clock, Calendar, CalendarDays, Trash2, Loader2, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useDebounce } from "@/hooks/useDebounce";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { TouchSafeCollapsibleTrigger } from "@/components/ui/touch-collapsible";
import {
  useMedicationLimits,
  useCreateMedicationLimit,
  useUpdateMedicationLimit,
  useDeleteMedicationLimit,
  type MedicationLimit,
  type CreateMedicationLimitPayload
} from "@/features/medication-limits/hooks/useMedicationLimits";

const periodIcons = {
  day: Clock,
  week: Calendar,
  month: CalendarDays,
};

const periodLabels = {
  day: 'pro Tag',
  week: 'pro Woche',
  month: 'pro Monat',
};

interface MedicationLimitsSettingsProps {
  onNavigateToMedications?: () => void;
}

export function MedicationLimitsSettings({ onNavigateToMedications }: MedicationLimitsSettingsProps = {}) {
  const isMobile = useIsMobile();
  const { data: medications = [] } = useMeds();
  const { data: serverLimits = [] } = useMedicationLimits();
  const createLimit = useCreateMedicationLimit();
  const updateLimit = useUpdateMedicationLimit();
  const deleteLimit = useDeleteMedicationLimit();

  // Optimistic UI State
  const [localLimits, setLocalLimits] = useState<MedicationLimit[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());
  const [savingStates, setSavingStates] = useState<Map<string, 'pending' | 'saving' | 'saved'>>(new Map());
  const [expandedLimits, setExpandedLimits] = useState<Set<string>>(new Set());
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLimit, setNewLimit] = useState<CreateMedicationLimitPayload>({
    medication_name: '',
    limit_count: 10,
    period_type: 'month',
    is_active: true,
  });
  
  const pendingUpdatesRef = useRef<Map<string, Partial<CreateMedicationLimitPayload>>>(new Map());

  // Sync server limits to local state
  useEffect(() => {
    setLocalLimits(serverLimits);
  }, [serverLimits]);

  const availableMedications = medications.filter(
    med => !localLimits.some(limit => limit.medication_name === med.name)
  );

  // Show hint if no medications available
  if (medications.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <p className="text-muted-foreground mb-4">Noch keine Medikamente angelegt</p>
        {onNavigateToMedications && (
          <Button 
            variant="outline" 
            onClick={onNavigateToMedications}
          >
            Medikamente verwalten
          </Button>
        )}
      </div>
    );
  }

  const batchSave = async () => {
    const updates = Array.from(pendingUpdatesRef.current.entries());
    if (updates.length === 0) return;

    // Mark all as saving
    updates.forEach(([id]) => {
      setSavingStates(prev => new Map(prev).set(id, 'saving'));
    });

    try {
      await Promise.all(
        updates.map(([id, payload]) => updateLimit.mutateAsync({ id, payload }))
      );

      // Success feedback
      updates.forEach(([id]) => {
        setSavingStates(prev => new Map(prev).set(id, 'saved'));
        setPendingChanges(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

        // Auto-hide saved badge after 3s
        setTimeout(() => {
          setSavingStates(prev => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        }, 3000);
      });

      pendingUpdatesRef.current.clear();
    } catch (error) {
      // Revert to pending on error
      updates.forEach(([id]) => {
        setSavingStates(prev => new Map(prev).set(id, 'pending'));
      });
      
      toast({
        title: "Speicherfehler",
        description: "Änderungen konnten nicht gespeichert werden. Versuche es erneut.",
        variant: "destructive",
      });
    }
  };

  const [debouncedBatchSave] = useDebounce(batchSave, 3000);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (pendingUpdatesRef.current.size > 0) {
        batchSave();
      }
    };
  }, []);

  const handleCreateLimit = async () => {
    if (!newLimit.medication_name) {
      toast({
        title: "Fehler",
        description: "Bitte wähle ein Medikament aus.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createLimit.mutateAsync(newLimit);
      setNewLimit({
        medication_name: '',
        limit_count: 10,
        period_type: 'month',
        is_active: true,
      });
      setShowAddForm(false);
      toast({
        title: "Limit erstellt",
        description: `Limit für ${newLimit.medication_name} wurde erstellt.`,
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Limit konnte nicht erstellt werden.",
        variant: "destructive",
      });
    }
  };

  const handleOptimisticUpdate = (
    id: string,
    updates: Partial<MedicationLimit>
  ) => {
    // 1. Immediate local update
    setLocalLimits(prev => 
      prev.map(limit => limit.id === id ? { ...limit, ...updates } : limit)
    );

    // 2. Mark as pending
    setPendingChanges(prev => new Set(prev).add(id));
    setSavingStates(prev => new Map(prev).set(id, 'pending'));

    // 3. Queue for batch save
    const existing = pendingUpdatesRef.current.get(id) || {};
    pendingUpdatesRef.current.set(id, { ...existing, ...updates });

    // 4. Trigger debounced save
    debouncedBatchSave();
  };

  const handleImmediateSwitchUpdate = async (
    id: string,
    is_active: boolean
  ) => {
    // Immediate local update
    setLocalLimits(prev => 
      prev.map(limit => limit.id === id ? { ...limit, is_active } : limit)
    );

    try {
      await updateLimit.mutateAsync({ id, payload: { is_active } });
    } catch (error) {
      // Revert on error
      setLocalLimits(serverLimits);
      toast({
        title: "Fehler",
        description: "Änderungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteLimit = async (id: string, medicationName: string) => {
    try {
      await deleteLimit.mutateAsync(id);
      toast({
        title: "Limit gelöscht",
        description: `Limit für ${medicationName} wurde entfernt.`,
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Limit konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  const toggleAllLimits = async (active: boolean) => {
    // Optimistic update
    setLocalLimits(prev => prev.map(limit => ({ ...limit, is_active: active })));

    try {
      await Promise.all(
        localLimits.map(limit =>
          updateLimit.mutateAsync({
            id: limit.id,
            payload: { is_active: active }
          })
        )
      );
      toast({
        title: active ? "Alle Limits aktiviert" : "Alle Limits deaktiviert",
        description: `${localLimits.length} Limits wurden ${active ? 'aktiviert' : 'deaktiviert'}.`,
      });
    } catch (error) {
      // Revert on error
      setLocalLimits(serverLimits);
      toast({
        title: "Fehler",
        description: "Nicht alle Limits konnten aktualisiert werden.",
        variant: "destructive",
      });
    }
  };

  const getSavingBadge = (limitId: string) => {
    const state = savingStates.get(limitId);
    
    if (state === 'pending') {
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-300">
          • Nicht gespeichert
        </Badge>
      );
    }
    
    if (state === 'saving') {
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Speichert...
        </Badge>
      );
    }
    
    if (state === 'saved') {
      return (
        <Badge variant="default" className="bg-green-500">
          ✓ Gespeichert
        </Badge>
      );
    }
    
    return null;
  };

  const toggleExpanded = (id: string) => {
    setExpandedLimits(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={cn("font-medium", isMobile && "text-sm")}>Medikamentenlimits</h3>
        {localLimits.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllLimits(true)}
              disabled={localLimits.every(l => l.is_active)}
              className={cn(isMobile && "text-xs px-2")}
            >
              Alle an
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllLimits(false)}
              disabled={localLimits.every(l => !l.is_active)}
              className={cn(isMobile && "text-xs px-2")}
            >
              Alle aus
            </Button>
          </div>
        )}
      </div>

      <p className={cn("text-sm text-muted-foreground mb-4", isMobile && "text-xs")}>
        Verwalten Sie Ihre individuellen Medikamentenlimits, um Überkonsum zu vermeiden.
      </p>

      {/* Existing Limits */}
      <div className="space-y-2">
        {localLimits.map((limit) => {
          const PeriodIcon = periodIcons[limit.period_type as keyof typeof periodIcons];
          const isExpanded = expandedLimits.has(limit.id);
          
          return (
            <Collapsible
              key={limit.id}
              open={isExpanded}
              onOpenChange={() => toggleExpanded(limit.id)}
            >
              <div className="border rounded-lg overflow-hidden bg-secondary/5">
                <TouchSafeCollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-secondary/10 transition-colors">
                  <div className="flex items-center gap-2">
                    <PeriodIcon className={cn("h-4 w-4 text-muted-foreground", isMobile && "h-3 w-3")} />
                    <span className={cn("font-medium", isMobile && "text-sm")}>{limit.medication_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getSavingBadge(limit.id)}
                    <Badge variant={limit.is_active ? "default" : "secondary"} className={cn(isMobile && "text-xs px-1.5")}>
                      {limit.limit_count}x {periodLabels[limit.period_type]}
                    </Badge>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180", isMobile && "h-3 w-3")} />
                  </div>
                </TouchSafeCollapsibleTrigger>

                <CollapsibleContent>
                  <div className={cn("p-4 space-y-4 border-t", isMobile && "p-3 space-y-3")}>
                    <div className="flex items-center justify-between">
                      <Label className={cn("text-sm", isMobile && "text-xs")}>Aktiv</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={limit.is_active}
                          onCheckedChange={(checked) => handleImmediateSwitchUpdate(limit.id, checked)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLimit(limit.id, limit.medication_name)}
                          disabled={deleteLimit.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className={cn("h-4 w-4", isMobile && "h-3 w-3")} />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className={cn("text-sm text-muted-foreground", isMobile && "text-xs")}>
                        Maximale Anzahl: {limit.limit_count}x
                      </Label>
                      <Slider
                        value={[limit.limit_count]}
                        onValueChange={([value]) => handleOptimisticUpdate(limit.id, { limit_count: value })}
                        min={1}
                        max={30}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className={cn("text-sm text-muted-foreground", isMobile && "text-xs")}>Zeitraum</Label>
                      <Select
                        value={limit.period_type}
                        onValueChange={(value) => handleOptimisticUpdate(limit.id, { period_type: value as 'day' | 'week' | 'month' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Pro Tag</SelectItem>
                          <SelectItem value="week">Pro Woche</SelectItem>
                          <SelectItem value="month">Pro Monat</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}

        {localLimits.length === 0 && (
          <div className={cn("text-center py-8 text-muted-foreground", isMobile && "py-6 text-sm")}>
            Noch keine Medikamentenlimits festgelegt
          </div>
        )}
      </div>

      <Separator />

      {/* Add New Limit */}
      {availableMedications.length > 0 ? (
        <>
          {!showAddForm ? (
            <Button
              onClick={() => setShowAddForm(true)}
              variant="outline"
              className="w-full"
              size={isMobile ? "sm" : "default"}
            >
              <Plus className={cn("mr-2 h-4 w-4", isMobile && "h-3 w-3")} />
              Neues Limit hinzufügen
            </Button>
          ) : (
            <div className={cn("p-4 border-2 border-dashed rounded-lg space-y-4", isMobile && "p-3 space-y-3")}>
              <div className="flex items-center justify-between">
                <h3 className={cn("font-medium", isMobile && "text-sm")}>Neues Limit erstellen</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                >
                  Abbrechen
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className={cn(isMobile && "text-sm")}>Medikament</Label>
                  <Select
                    value={newLimit.medication_name}
                    onValueChange={(value) => setNewLimit({ ...newLimit, medication_name: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Medikament wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMedications.map((med) => (
                        <SelectItem key={med.id} value={med.name}>
                          {med.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className={cn(isMobile && "text-sm")}>Maximale Anzahl: {newLimit.limit_count}x</Label>
                  <Slider
                    value={[newLimit.limit_count]}
                    onValueChange={([value]) => setNewLimit({ ...newLimit, limit_count: value })}
                    min={1}
                    max={30}
                    step={1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className={cn(isMobile && "text-sm")}>Zeitraum</Label>
                  <Select
                    value={newLimit.period_type}
                    onValueChange={(value) => setNewLimit({ ...newLimit, period_type: value as 'day' | 'week' | 'month' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Pro Tag</SelectItem>
                      <SelectItem value="week">Pro Woche</SelectItem>
                      <SelectItem value="month">Pro Monat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleCreateLimit}
                  disabled={!newLimit.medication_name || createLimit.isPending}
                  className="w-full"
                  size={isMobile ? "sm" : "default"}
                >
                  {createLimit.isPending && <Loader2 className={cn("mr-2 h-4 w-4 animate-spin", isMobile && "h-3 w-3")} />}
                  Limit erstellen
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={cn("text-center py-4 text-sm text-muted-foreground", isMobile && "text-xs")}>
          Alle verfügbaren Medikamente haben bereits Limits.
          <br />
          Fügen Sie zuerst neue Medikamente hinzu.
        </div>
      )}
    </div>
  );
}
