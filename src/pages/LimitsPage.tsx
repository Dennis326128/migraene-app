import React, { useState, useEffect, useRef } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Plus, Trash2, Check, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import {
  useMedicationLimits,
  useCreateMedicationLimit,
  useUpdateMedicationLimit,
  useDeleteMedicationLimit,
  type MedicationLimit,
  type CreateMedicationLimitPayload,
} from "@/features/medication-limits/hooks/useMedicationLimits";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useUserDefaults } from "@/features/settings/hooks/useUserSettings";
import { LimitsStatusOverview } from "@/components/PainApp/LimitsStatusOverview";
import { cn } from "@/lib/utils";

interface LimitsPageProps {
  onBack: () => void;
  onNavigateToMedications?: () => void;
}

const periodLabels: Record<string, string> = {
  day: "pro Tag",
  week: "pro Woche",
  month: "pro Monat",
};

export function LimitsPage({ onBack, onNavigateToMedications }: LimitsPageProps) {
  const queryClient = useQueryClient();
  const { data: serverLimits = [], isLoading: limitsLoading } = useMedicationLimits();
  const { data: medications = [], isLoading: medsLoading } = useMeds();
  const { data: userDefaults } = useUserDefaults();
  const createLimit = useCreateMedicationLimit();
  const updateLimit = useUpdateMedicationLimit();
  const deleteLimit = useDeleteMedicationLimit();

  const [activeTab, setActiveTab] = useState("status");
  const [warningThreshold, setWarningThreshold] = useState<string>("90");
  
  // Local limits state for optimistic updates
  const [localLimits, setLocalLimits] = useState<MedicationLimit[]>([]);
  const [savingStates, setSavingStates] = useState<Record<string, 'pending' | 'saving' | 'saved'>>({});
  
  // Add new limit form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLimit, setNewLimit] = useState<Partial<CreateMedicationLimitPayload>>({
    limit_count: 10,
    period_type: 'month',
  });

  // Sync server limits to local state
  useEffect(() => {
    if (serverLimits.length > 0 || !limitsLoading) {
      setLocalLimits(serverLimits);
    }
  }, [serverLimits, limitsLoading]);

  // Initialize warning threshold from user defaults
  useEffect(() => {
    if (userDefaults?.medication_limit_warning_threshold_pct) {
      setWarningThreshold(String(userDefaults.medication_limit_warning_threshold_pct));
    }
  }, [userDefaults]);

  // Available medications (not yet having a limit)
  const availableMedications = medications.filter(
    (med) => med.is_active && !localLimits.some((l) => l.medication_name === med.name)
  );

  // Handle warning threshold change
  const handleThresholdChange = async (value: string) => {
    setWarningThreshold(value);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      await supabase.from('user_profiles').upsert({
        user_id: user.id,
        medication_limit_warning_threshold_pct: parseInt(value, 10),
      }, { onConflict: 'user_id' });
      
      queryClient.invalidateQueries({ queryKey: ['user_defaults'] });
    } catch (error) {
      console.error('Failed to save threshold:', error);
    }
  };

  // Handle creating a new limit
  const handleCreateLimit = async () => {
    if (!newLimit.medication_name) {
      toast.error("Bitte wähle ein Medikament");
      return;
    }

    try {
      await createLimit.mutateAsync({
        medication_name: newLimit.medication_name,
        limit_count: newLimit.limit_count || 10,
        period_type: newLimit.period_type || 'month',
        is_active: true,
      });
      
      toast.success("Limit erstellt");
      setShowAddForm(false);
      setNewLimit({ limit_count: 10, period_type: 'month' });
    } catch (error) {
      toast.error("Fehler beim Erstellen");
    }
  };

  // Handle immediate limit update (for dropdowns)
  const handleLimitUpdate = async (id: string, payload: Partial<CreateMedicationLimitPayload>) => {
    setLocalLimits(prev => prev.map(l => 
      l.id === id ? { ...l, ...payload } : l
    ));
    setSavingStates(prev => ({ ...prev, [id]: 'saving' }));

    try {
      await updateLimit.mutateAsync({ id, payload });
      setSavingStates(prev => ({ ...prev, [id]: 'saved' }));
      setTimeout(() => {
        setSavingStates(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 1500);
    } catch (error) {
      setLocalLimits(serverLimits);
      setSavingStates(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.error("Fehler beim Speichern");
    }
  };

  // Handle toggle active state
  const handleToggleActive = async (id: string, isActive: boolean) => {
    setLocalLimits(prev => prev.map(l => 
      l.id === id ? { ...l, is_active: isActive } : l
    ));

    try {
      await updateLimit.mutateAsync({ id, payload: { is_active: isActive } });
    } catch (error) {
      setLocalLimits(serverLimits);
      toast.error("Fehler beim Speichern");
    }
  };

  // Handle delete
  const handleDeleteLimit = async (id: string) => {
    try {
      await deleteLimit.mutateAsync(id);
      toast.success("Limit gelöscht");
    } catch (error) {
      toast.error("Fehler beim Löschen");
    }
  };

  // Toggle all limits
  const toggleAllLimits = async (enabled: boolean) => {
    setLocalLimits(prev => prev.map(l => ({ ...l, is_active: enabled })));

    try {
      await Promise.all(
        localLimits.map(l => 
          updateLimit.mutateAsync({ id: l.id, payload: { is_active: enabled } })
        )
      );
    } catch (error) {
      setLocalLimits(serverLimits);
      toast.error("Fehler beim Speichern");
    }
  };

  const isLoading = limitsLoading || medsLoading;

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <AppHeader title="Übergebrauch & Limits" onBack={onBack} />
        <div className="container mx-auto p-4 max-w-md">
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  // No medications available
  if (medications.filter(m => m.is_active).length === 0) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <AppHeader title="Übergebrauch & Limits" onBack={onBack} />
        <div className="container mx-auto p-4 max-w-md">
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground mb-4">
                Füge zuerst Medikamente hinzu, um Limits festzulegen.
              </p>
              <Button onClick={onNavigateToMedications}>
                Zu Medikamente
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <AppHeader 
        title="Übergebrauch & Limits" 
        onBack={onBack}
      />

      <div className="container mx-auto p-4 max-w-md space-y-4">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="status">Aktueller Stand</TabsTrigger>
            <TabsTrigger value="limits">Limits</TabsTrigger>
          </TabsList>

          {/* Tab: Aktueller Stand */}
          <TabsContent value="status" className="mt-4">
            <LimitsStatusOverview
              onSwitchToLimitsTab={() => setActiveTab("limits")}
            />
          </TabsContent>

          {/* Tab: Limits */}
          <TabsContent value="limits" className="mt-4 space-y-4">
            {/* Explanation */}
            <p className="text-sm text-muted-foreground">
              Lege Grenzwerte fest, um Medikamenten-Übergebrauch zu vermeiden.
            </p>

            {/* Add New Limit Button */}
            <Button
              variant="outline"
              className="w-full h-12"
              onClick={() => setShowAddForm(!showAddForm)}
              disabled={availableMedications.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" />
              Neues Limit hinzufügen
            </Button>

            {/* Add Form (inline) */}
            {showAddForm && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Medikament</label>
                    <Select
                      value={newLimit.medication_name || ""}
                      onValueChange={(v) => setNewLimit(prev => ({ ...prev, medication_name: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Wählen..." />
                      </SelectTrigger>
                      <SelectContent className="bg-background border shadow-lg z-50">
                        {availableMedications.map((med) => (
                          <SelectItem key={med.id} value={med.name}>
                            {med.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1 space-y-2">
                      <label className="text-sm font-medium">Anzahl</label>
                      <Select
                        value={String(newLimit.limit_count || 10)}
                        onValueChange={(v) => setNewLimit(prev => ({ ...prev, limit_count: parseInt(v, 10) }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border shadow-lg z-50">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex-1 space-y-2">
                      <label className="text-sm font-medium">Zeitraum</label>
                      <Select
                        value={newLimit.period_type || "month"}
                        onValueChange={(v) => setNewLimit(prev => ({ ...prev, period_type: v as 'day' | 'week' | 'month' }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border shadow-lg z-50">
                          <SelectItem value="day">pro Tag</SelectItem>
                          <SelectItem value="week">pro Woche</SelectItem>
                          <SelectItem value="month">pro Monat</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      className="flex-1"
                      onClick={() => setShowAddForm(false)}
                    >
                      Abbrechen
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleCreateLimit}
                      disabled={!newLimit.medication_name || createLimit.isPending}
                    >
                      {createLimit.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Speichern"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Warning Threshold */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Warnung bei</span>
                  </div>
                </div>
                <ToggleGroup 
                  type="single" 
                  value={warningThreshold}
                  onValueChange={(v) => v && handleThresholdChange(v)}
                  className="justify-start"
                >
                  <ToggleGroupItem value="80" className="flex-1">80%</ToggleGroupItem>
                  <ToggleGroupItem value="90" className="flex-1">90%</ToggleGroupItem>
                  <ToggleGroupItem value="100" className="flex-1">100%</ToggleGroupItem>
                </ToggleGroup>
              </CardContent>
            </Card>

            {/* Limits List */}
            {localLimits.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Deine Limits</h2>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleAllLimits(true)}
                      className="text-xs h-7 px-2"
                    >
                      Alle an
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleAllLimits(false)}
                      className="text-xs h-7 px-2"
                    >
                      Alle aus
                    </Button>
                  </div>
                </div>

                {localLimits.map((limit) => (
                  <Card key={limit.id} className={cn(!limit.is_active && "opacity-60")}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{limit.medication_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Select
                              value={String(limit.limit_count)}
                              onValueChange={(v) => handleLimitUpdate(limit.id, { limit_count: parseInt(v, 10) })}
                              disabled={!limit.is_active}
                            >
                              <SelectTrigger className="h-8 w-16 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-background border shadow-lg z-50">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30].map((n) => (
                                  <SelectItem key={n} value={String(n)}>
                                    {n}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={limit.period_type}
                              onValueChange={(v) => handleLimitUpdate(limit.id, { period_type: v as 'day' | 'week' | 'month' })}
                              disabled={!limit.is_active}
                            >
                              <SelectTrigger className="h-8 w-28 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-background border shadow-lg z-50">
                                <SelectItem value="day">pro Tag</SelectItem>
                                <SelectItem value="week">pro Woche</SelectItem>
                                <SelectItem value="month">pro Monat</SelectItem>
                              </SelectContent>
                            </Select>
                            {savingStates[limit.id] === 'saving' && (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                            {savingStates[limit.id] === 'saved' && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            checked={limit.is_active}
                            onCheckedChange={(checked) => handleToggleActive(limit.id, checked)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteLimit(limit.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground">
                    Noch keine Limits festgelegt.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default LimitsPage;
