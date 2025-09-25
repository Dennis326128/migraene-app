import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Clock, Calendar, CalendarDays, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useMeds } from "@/features/meds/hooks/useMeds";
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
  const { data: limits = [] } = useMedicationLimits();
  const createLimit = useCreateMedicationLimit();
  const updateLimit = useUpdateMedicationLimit();
  const deleteLimit = useDeleteMedicationLimit();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newLimit, setNewLimit] = useState<CreateMedicationLimitPayload>({
    medication_name: '',
    limit_count: 10,
    period_type: 'month',
    is_active: true,
  });

  const availableMedications = medications.filter(
    med => !limits.some(limit => limit.medication_name === med.name)
  );

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

  const handleUpdateLimit = async (
    id: string,
    payload: Partial<CreateMedicationLimitPayload>
  ) => {
    try {
      await updateLimit.mutateAsync({ id, payload });
      toast({
        title: "Limit aktualisiert",
        description: "Die Änderungen wurden gespeichert.",
      });
    } catch (error) {
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
    try {
      await Promise.all(
        limits.map(limit =>
          updateLimit.mutateAsync({
            id: limit.id,
            payload: { is_active: active }
          })
        )
      );
      toast({
        title: active ? "Alle Limits aktiviert" : "Alle Limits deaktiviert",
        description: `${limits.length} Limits wurden ${active ? 'aktiviert' : 'deaktiviert'}.`,
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nicht alle Limits konnten aktualisiert werden.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Medikamenten-Limits
            <Badge variant="secondary">{limits.length}</Badge>
          </CardTitle>
          <CardDescription>
            Setze individuelle Limits für deine Medikamente, um Übergebrauch zu vermeiden.
            Du erhältst Warnungen, wenn du dich dem Limit näherst.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bulk Actions */}
          {limits.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Alle Limits</span>
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
          <div className="space-y-4">
            {limits.map((limit) => {
              const Icon = periodIcons[limit.period_type];
              return (
                <Card key={limit.id} className={`transition-opacity ${!limit.is_active ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="font-medium">{limit.medication_name}</div>
                        <Badge variant={limit.is_active ? "default" : "secondary"}>
                          <Icon className="h-3 w-3 mr-1" />
                          {limit.limit_count} {periodLabels[limit.period_type]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={limit.is_active}
                          onCheckedChange={(checked) =>
                            handleUpdateLimit(limit.id, { is_active: checked })
                          }
                          disabled={updateLimit.isPending}
                        />
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
                    
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Anzahl: {limit.limit_count}</Label>
                        <Slider
                          value={[limit.limit_count]}
                          onValueChange={([value]) =>
                            handleUpdateLimit(limit.id, { limit_count: value })
                          }
                          max={50}
                          min={1}
                          step={1}
                          className="mt-2"
                          disabled={updateLimit.isPending || !limit.is_active}
                        />
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">Zeitraum</Label>
                        <Select
                          value={limit.period_type}
                          onValueChange={(value: 'day' | 'week' | 'month') =>
                            handleUpdateLimit(limit.id, { period_type: value })
                          }
                          disabled={updateLimit.isPending || !limit.is_active}
                        >
                          <SelectTrigger className="mt-1">
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
                        max={50}
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

          {limits.length === 0 && availableMedications.length === 0 && (
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
