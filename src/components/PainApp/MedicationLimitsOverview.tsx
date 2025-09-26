import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import { 
  useMedicationLimits, 
  useCreateMedicationLimit, 
  useUpdateMedicationLimit, 
  useDeleteMedicationLimit,
  useCheckMedicationLimits,
  type CreateMedicationLimitPayload 
} from "@/features/medication-limits/hooks/useMedicationLimits";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";

export function MedicationLimitsOverview() {
  const { toast } = useToast();
  const [newLimit, setNewLimit] = useState<CreateMedicationLimitPayload>({
    medication_name: "",
    limit_count: 10,
    period_type: "week"
  });

  const { data: limits = [], isLoading: limitsLoading } = useMedicationLimits();
  const { data: medications = [] } = useMeds();
  const { data: entries = [] } = useEntries();
  const createLimit = useCreateMedicationLimit();
  const updateLimit = useUpdateMedicationLimit();
  const deleteLimit = useDeleteMedicationLimit();
  const checkLimits = useCheckMedicationLimits();

  // Get medication usage from entries over last 30 days
  const medicationUsage = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const recentEntries = entries.filter(entry => 
      new Date(entry.timestamp_created) >= thirtyDaysAgo &&
      entry.medications && entry.medications.length > 0
    );

    const usage: Record<string, number> = {};
    recentEntries.forEach(entry => {
      entry.medications?.forEach(med => {
        usage[med] = (usage[med] || 0) + 1;
      });
    });

    return usage;
  }, [entries]);

  // Calculate status for each limit
  const limitsWithStatus = useMemo(() => {
    return limits.map(limit => {
      const usage = medicationUsage[limit.medication_name] || 0;
      const percentage = Math.round((usage / limit.limit_count) * 100);
      
      let status: 'safe' | 'warning' | 'exceeded';
      if (percentage <= 60) status = 'safe';
      else if (percentage <= 100) status = 'warning';
      else status = 'exceeded';

      return {
        ...limit,
        currentUsage: usage,
        percentage,
        status
      };
    });
  }, [limits, medicationUsage]);

  const handleCreateLimit = async () => {
    if (!newLimit.medication_name.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte Medikamentenname eingeben",
        variant: "destructive"
      });
      return;
    }

    try {
      await createLimit.mutateAsync(newLimit);
      setNewLimit({ medication_name: "", limit_count: 10, period_type: "week" });
      toast({
        title: "Limit erstellt",
        description: `Limit für ${newLimit.medication_name} wurde erstellt`
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Limit konnte nicht erstellt werden",
        variant: "destructive"
      });
    }
  };

  const handleDeleteLimit = async (id: string, medicationName: string) => {
    try {
      await deleteLimit.mutateAsync(id);
      toast({
        title: "Limit gelöscht",
        description: `Limit für ${medicationName} wurde gelöscht`
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Limit konnte nicht gelöscht werden",
        variant: "destructive"
      });
    }
  };

  const toggleLimitActive = async (limit: any) => {
    try {
      await updateLimit.mutateAsync({
        id: limit.id,
        payload: { is_active: !limit.is_active }
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Status konnte nicht geändert werden",
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'safe': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'exceeded': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'exceeded': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (limitsLoading) {
    return <div className="text-center py-8">Lade Medikamentenlimits...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Create New Limit */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Neues Medikamentenlimit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Select
                value={newLimit.medication_name}
                onValueChange={(value) => setNewLimit(prev => ({ ...prev, medication_name: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Medikament wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {medications.map(med => (
                    <SelectItem key={med.id} value={med.name}>
                      {med.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <Input
                type="number"
                min="1"
                value={newLimit.limit_count}
                onChange={(e) => setNewLimit(prev => ({ ...prev, limit_count: parseInt(e.target.value) || 1 }))}
                placeholder="Anzahl"
              />
            </div>
            <div className="w-32">
              <Select
                value={newLimit.period_type}
                onValueChange={(value: "day" | "week" | "month") => setNewLimit(prev => ({ ...prev, period_type: value }))}
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
            <Button onClick={handleCreateLimit} disabled={createLimit.isPending}>
              {createLimit.isPending ? "..." : "Hinzufügen"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Limits Overview */}
      {limitsWithStatus.length === 0 ? (
        <EmptyState
          icon="💊"
          title="Keine Medikamentenlimits"
          description="Erstellen Sie Limits für Ihre Medikamente, um den Überverbrauch zu überwachen. Empfohlene Limits werden automatisch basierend auf WHO-Standards gesetzt."
        />
      ) : (
        <div className="grid gap-4">
          {limitsWithStatus.map(limit => (
            <Card key={limit.id} className={`border-l-4 ${
              limit.status === 'safe' ? 'border-l-green-500' :
              limit.status === 'warning' ? 'border-l-yellow-500' :
              'border-l-red-500'
            }`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(limit.status)}
                    <div>
                      <h3 className="font-semibold">{limit.medication_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {limit.currentUsage}/{limit.limit_count} {
                          limit.period_type === 'day' ? 'pro Tag' :
                          limit.period_type === 'week' ? 'pro Woche' :
                          'pro Monat'
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(limit.status)}>
                      {limit.status === 'safe' ? '✅ Sicher' :
                       limit.status === 'warning' ? '⚠️ Achtung' :
                       '🚨 Überschritten'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleLimitActive(limit)}
                    >
                      {limit.is_active ? "Aktiv" : "Inaktiv"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteLimit(limit.id, limit.medication_name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Progress 
                    value={Math.min(100, limit.percentage)} 
                    className={`h-2 ${
                      limit.status === 'safe' ? '[&>div]:bg-green-500' :
                      limit.status === 'warning' ? '[&>div]:bg-yellow-500' :
                      '[&>div]:bg-red-500'
                    }`}
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Letzte 30 Tage: {limit.currentUsage}x eingenommen
                    </span>
                    <span className={
                      limit.status === 'safe' ? 'text-green-600' :
                      limit.status === 'warning' ? 'text-yellow-600' :
                      'text-red-600'
                    }>
                      {limit.percentage}%
                    </span>
                  </div>
                </div>

                {limit.status === 'exceeded' && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-700">
                      🚨 <strong>Limit überschritten!</strong> Konsultieren Sie Ihren Arzt, bevor Sie weitere Dosen einnehmen.
                    </p>
                  </div>
                )}
                
                {limit.status === 'warning' && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-700">
                      ⚠️ <strong>Vorsicht:</strong> Sie nähern sich dem empfohlenen Limit für {limit.medication_name}.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 30-Day Summary */}
      <Card>
        <CardHeader>
          <CardTitle>30-Tage-Übersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {limitsWithStatus.filter(l => l.status === 'safe').length}
              </div>
              <div className="text-sm text-green-700">Sichere Medikamente</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">
                {limitsWithStatus.filter(l => l.status === 'warning').length}
              </div>
              <div className="text-sm text-yellow-700">Warnungen</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {limitsWithStatus.filter(l => l.status === 'exceeded').length}
              </div>
              <div className="text-sm text-red-700">Überschreitungen</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}