import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, ArrowRight, AlertTriangle, CheckCircle, Cloud, PlusCircle } from "lucide-react";
import { migratePainEntriesToEvents, getMigrationStatus, enhancedWeatherBackfill, type MigrationResult } from "@/services/migration.service";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function MigrationPanel() {
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [weatherResult, setWeatherResult] = useState<MigrationResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['migration-status'],
    queryFn: getMigrationStatus
  });

  const migrationMutation = useMutation({
    mutationFn: migratePainEntriesToEvents,
    onSuccess: (result) => {
      setMigrationResult(result);
      queryClient.invalidateQueries({ queryKey: ['migration-status'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast({ 
        title: "✅ Migration abgeschlossen", 
        description: `${result.successful} Einträge erfolgreich migriert` 
      });
    },
    onError: (error) => {
      toast({ 
        title: "❌ Migration fehlgeschlagen", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const weatherMutation = useMutation({
    mutationFn: () => enhancedWeatherBackfill(30),
    onSuccess: (result) => {
      setWeatherResult(result);
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      toast({ 
        title: "🌤️ Wetter-Daten aktualisiert", 
        description: `${result.successful} Einträge mit Wetter-Daten ergänzt` 
      });
    },
    onError: (error) => {
      toast({ 
        title: "❌ Wetter-Update fehlgeschlagen", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">Prüfe Migrations-Status...</div>
        </CardContent>
      </Card>
    );
  }

  // Handle empty system first
  if (status?.isEmpty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-blue-500" />
            Erste Schritte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Ihr System ist bereit! Erstellen Sie Ihren ersten Migräne-Eintrag, um mit der Auswertung zu beginnen.
          </p>
          <div className="text-xs text-muted-foreground">
            💡 Tipp: Nach einigen Einträgen können Sie hier Wetter-Daten ergänzen und Analysen durchführen.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status?.needsMigration && !migrationResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            System aktuell
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Ihr System verwendet bereits das neueste Event-System.
          </p>
          <Button
            onClick={() => weatherMutation.mutate()}
            disabled={weatherMutation.isPending}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Cloud className="h-4 w-4" />
            {weatherMutation.isPending ? "Aktualisiere..." : "Wetter-Daten ergänzen"}
          </Button>
          
          {weatherResult && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Wetter-Update: {weatherResult.successful} erfolgreich, {weatherResult.failed} fehlgeschlagen
                {weatherResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">Details anzeigen</summary>
                    <ul className="text-xs mt-1 space-y-1">
                      {weatherResult.errors.slice(0, 5).map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          System-Migration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Migration zu verbessertem Event-System mit erweiterten Funktionen
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-muted/50 p-3 rounded-lg">
              <div className="font-medium">Legacy Einträge</div>
              <div className="text-2xl font-bold text-orange-600">{status.painEntries}</div>
              <div className="text-xs text-muted-foreground">pain_entries</div>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg">
              <div className="font-medium">Neue Events</div>
              <div className="text-2xl font-bold text-green-600">{status.events}</div>
              <div className="text-xs text-muted-foreground">events</div>
            </div>
          </div>
        )}

        {!migrationResult && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Migration erforderlich:</strong> Ihre Daten werden zum neuen Event-System migriert. 
              Dies ermöglicht erweiterte Funktionen wie Medikamenten-Tracking und bessere Analysen.
              <div className="mt-2">
                <strong>Was wird migriert:</strong>
                <ul className="text-xs mt-1 space-y-1">
                  <li>• Alle Migräne-Einträge → Events</li>
                  <li>• Medikamente → Strukturierte Medikamenten-Daten</li>
                  <li>• Symptome bleiben erhalten</li>
                  <li>• Wetter-Daten werden verknüpft</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => migrationMutation.mutate()}
            disabled={migrationMutation.isPending}
            className="flex items-center gap-2"
          >
            <ArrowRight className="h-4 w-4" />
            {migrationMutation.isPending ? "Migriere..." : "Migration starten"}
          </Button>
          
          <Button
            onClick={() => weatherMutation.mutate()}
            disabled={weatherMutation.isPending}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Cloud className="h-4 w-4" />
            {weatherMutation.isPending ? "Aktualisiere..." : "Wetter ergänzen"}
          </Button>
        </div>

        {migrationMutation.isPending && (
          <div className="space-y-2">
            <div className="text-sm">Migration läuft...</div>
            <Progress value={undefined} className="w-full" />
          </div>
        )}

        {migrationResult && (
          <Alert className={migrationResult.failed > 0 ? "border-orange-200" : "border-green-200"}>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Migration abgeschlossen:</strong>
              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div>Verarbeitet: {migrationResult.totalProcessed}</div>
                <div className="text-green-600">Erfolgreich: {migrationResult.successful}</div>
                <div className="text-red-600">Fehlgeschlagen: {migrationResult.failed}</div>
              </div>
              {migrationResult.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer">Fehler anzeigen ({migrationResult.errors.length})</summary>
                  <ul className="text-xs mt-1 space-y-1 max-h-32 overflow-y-auto">
                    {migrationResult.errors.map((error, i) => (
                      <li key={i} className="text-red-600">{error}</li>
                    ))}
                  </ul>
                </details>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}