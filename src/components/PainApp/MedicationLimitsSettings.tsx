import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Clock, Calendar, CalendarDays, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useDebounce } from "@/hooks/useDebounce";
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

export function MedicationLimitsSettings() {
  const { data: medications = [] } = useMeds();
  const { data: serverLimits = [] } = useMedicationLimits();
  const createLimit = useCreateMedicationLimit();
  const updateLimit = useUpdateMedicationLimit();
  const deleteLimit = useDeleteMedicationLimit();

  // Optimistic UI State
  const [localLimits, setLocalLimits] = useState<MedicationLimit[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());
  const [savingStates, setSavingStates] = useState<Map<string, 'pending' | 'saving' | 'saved'>>(new Map());
  
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Medikamenten-Limits
            <Badge variant="secondary">{localLimits.length}</Badge>
          </CardTitle>
          <CardDescription>
            Setze individuelle Limits für deine Medikamente, um Übergebrauch zu vermeiden.
            Du erhältst Warnungen, wenn du dich dem Limit näherst.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bulk Actions */}
          {localLimits.length > 0 && (
            <div className="flex items-center justify-between p-5 bg-muted/50 rounded-lg">
              <span className="text-base font-semibold">Alle Limits</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAllLimits(true)}
                  disabled={updateLimit.isPending}
                >
                  Alle aktivieren
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAllLimits(false)}
                  disabled={updateLimit.isPending}
                >
                  Alle deaktivieren
                </Button>
              </div>
            </div>
          )}

          {/* Existing Limits */}
          <div className="space-y-5">
            {localLimits.map((limit) => {
              const Icon = periodIcons[limit.period_type];
              const savingState = savingStates.get(limit.id);
              const isDisabled = savingState === 'saving' || !limit.is_active;
              
              return (
                <Card key={limit.id} className={`transition-opacity ${!limit.is_active ? 'opacity-60' : ''}`}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-base font-semibold">{limit.medication_name}</div>
                        <Badge variant={limit.is_active ? "default" : "secondary"}>
                          <Icon className="h-3 w-3 mr-1" />
                          {limit.limit_count} {periodLabels[limit.period_type]}
                        </Badge>
                        {getSavingBadge(limit.id)}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center min-w-[44px] min-h-[44px]">
                          <Switch
                            checked={limit.is_active}
                            onCheckedChange={(checked) =>
                              handleImmediateSwitchUpdate(limit.id, checked)
                            }
                            disabled={updateLimit.isPending}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLimit(limit.id, limit.medication_name)}
                          disabled={deleteLimit.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-5">
                      <div className="min-h-[60px]">
                        <Label className="text-base font-medium">Anzahl: {limit.limit_count}</Label>
                        <Slider
                          value={[limit.limit_count]}
                          onValueChange={([value]) =>
                            handleOptimisticUpdate(limit.id, { limit_count: value })
                          }
                          max={30}
                          min={1}
                          step={1}
                          className="mt-2 py-6"
                          disabled={isDisabled}
                        />
                      </div>
                      
                      <div>
                        <Label className="text-base font-medium">Zeitraum</Label>
                        <Select
                          value={limit.period_type}
                          onValueChange={(value: 'day' | 'week' | 'month') =>
                            handleOptimisticUpdate(limit.id, { period_type: value })
                          }
                          disabled={isDisabled}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="day">pro Tag</SelectItem>
                            <SelectItem value="week">pro Woche</SelectItem>
                            <SelectItem value="month">pro Monat</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Add New Limit */}
          {availableMedications.length > 0 && (
            <>
              <Separator />
              
              {!showAddForm ? (
                <Button 
                  onClick={() => setShowAddForm(true)}
                  className="w-full"
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Neues Limit hinzufügen
                </Button>
              ) : (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Neues Limit</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddForm(false)}
                      >
                        Abbrechen
                      </Button>
                    </div>
                    
                    <div>
                      <Label>Medikament</Label>
                      <Select
                        value={newLimit.medication_name}
                        onValueChange={(value) =>
                          setNewLimit(prev => ({ ...prev, medication_name: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Medikament auswählen" />
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
                    
                    <div>
                      <Label>Anzahl: {newLimit.limit_count}</Label>
                      <Slider
                        value={[newLimit.limit_count]}
                        onValueChange={([value]) =>
                          setNewLimit(prev => ({ ...prev, limit_count: value }))
                        }
                        max={30}
                        min={1}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label>Zeitraum</Label>
                      <Select
                        value={newLimit.period_type}
                        onValueChange={(value: 'day' | 'week' | 'month') =>
                          setNewLimit(prev => ({ ...prev, period_type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">pro Tag</SelectItem>
                          <SelectItem value="week">pro Woche</SelectItem>
                          <SelectItem value="month">pro Monat</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button 
                      onClick={handleCreateLimit}
                      disabled={createLimit.isPending || !newLimit.medication_name}
                      className="w-full"
                    >
                      Limit erstellen
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {localLimits.length === 0 && availableMedications.length === 0 && (
            <div className="text-center p-8 text-muted-foreground">
              <p>Keine Medikamente verfügbar.</p>
              <p className="text-sm">Füge zuerst Medikamente hinzu, um Limits zu setzen.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
