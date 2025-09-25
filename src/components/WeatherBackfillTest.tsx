import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { triggerAutoBackfill, checkUserCoordinates } from '@/lib/clientWeather';

export function WeatherBackfillTest() {
  const [isLoading, setIsLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState<any>(null);
  const [coordinates, setCoordinates] = useState<any>(null);
  const { toast } = useToast();

  const handleCheckCoordinates = async () => {
    try {
      setIsLoading(true);
      const result = await checkUserCoordinates();
      setCoordinates(result);
      
      toast({
        title: result.hasCoordinates ? "Koordinaten gefunden" : "Keine Koordinaten",
        description: result.hasCoordinates 
          ? `Lat: ${result.latitude}, Lon: ${result.longitude}`
          : "Bitte Standort in den Einstellungen festlegen",
        variant: result.hasCoordinates ? "default" : "destructive"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerAutoBackfill = async () => {
    try {
      setIsLoading(true);
      const result = await triggerAutoBackfill();
      setBackfillResult(result);
      
      toast({
        title: result.success ? "Backfill erfolgreich" : "Backfill fehlgeschlagen",
        description: result.message || `${result.successCount} Erfolg, ${result.failCount} Fehler`,
        variant: result.success ? "default" : "destructive"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>🌤️ Automatisches Wetter-Backfill System</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Button 
            onClick={handleCheckCoordinates}
            disabled={isLoading}
            variant="outline"
            className="w-full"
          >
            📍 Benutzer-Koordinaten prüfen
          </Button>
          
          {coordinates && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm">
                <strong>Koordinaten:</strong> {coordinates.hasCoordinates 
                  ? `${coordinates.latitude}, ${coordinates.longitude}` 
                  : "Nicht verfügbar"}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Button 
            onClick={handleTriggerAutoBackfill}
            disabled={isLoading}
            className="w-full"
          >
            🔄 Automatisches Wetter-Backfill starten
          </Button>
          
          {backfillResult && (
            <div className="p-3 bg-muted rounded-md space-y-2">
              <p className="text-sm">
                <strong>Ergebnis:</strong> {backfillResult.success ? "✅ Erfolgreich" : "❌ Fehlgeschlagen"}
              </p>
              <p className="text-sm">
                <strong>Bearbeitet:</strong> {backfillResult.totalProcessed || 0}
              </p>
              <p className="text-sm">
                <strong>Erfolgreich:</strong> {backfillResult.successCount || 0}
              </p>
              <p className="text-sm">
                <strong>Fehlgeschlagen:</strong> {backfillResult.failCount || 0}
              </p>
              {backfillResult.message && (
                <p className="text-sm text-muted-foreground">{backfillResult.message}</p>
              )}
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
          <p><strong>Neues System:</strong></p>
          <p>• Verwendet OpenWeatherMap API für bessere historische Daten</p>
          <p>• Backfill läuft automatisch für alle Einträge ohne Wetterdaten</p>
          <p>• Verarbeitet sowohl legacy pain_entries als auch neue events</p>
          <p>• Rate-Limiting verhindert API-Überlastung</p>
        </div>
      </CardContent>
    </Card>
  );
}