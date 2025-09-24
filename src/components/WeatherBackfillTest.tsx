import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { triggerDailyBackfill, checkUserCoordinates } from "@/lib/clientWeather";

export const WeatherBackfillTest = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [coordinates, setCoordinates] = useState<any>(null);

  const handleCheckCoordinates = async () => {
    try {
      const coords = await checkUserCoordinates();
      setCoordinates(coords);
      
      if (coords.hasCoordinates) {
        toast({
          title: "✅ Koordinaten vorhanden",
          description: `Lat: ${coords.latitude}, Lon: ${coords.longitude}`,
        });
      } else {
        toast({
          title: "⚠️ Keine Koordinaten",
          description: "Standort muss erst in den Einstellungen gesetzt werden",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleTriggerBackfill = async () => {
    setLoading(true);
    try {
      const result = await triggerDailyBackfill();
      setResult(result);
      
      toast({
        title: "🌤️ Wetter-Backfill abgeschlossen",
        description: `✅ ${result.ok} erfolgreich, ⏭️ ${result.skip} übersprungen, ❌ ${result.fail} fehlgeschlagen`,
      });
    } catch (error) {
      toast({
        title: "Fehler beim Backfill",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 m-4">
      <h2 className="text-lg font-semibold mb-4">🧪 Wetter-Backfill Test</h2>
      
      <div className="space-y-4">
        <div>
          <Button 
            onClick={handleCheckCoordinates}
            variant="outline"
            className="w-full"
          >
            📍 Benutzer-Koordinaten prüfen
          </Button>
          
          {coordinates && (
            <div className="mt-2 p-3 bg-muted rounded text-sm">
              <strong>Status:</strong> {coordinates.hasCoordinates ? "✅ Koordinaten vorhanden" : "❌ Keine Koordinaten"}
              {coordinates.hasCoordinates && (
                <>
                  <br />
                  <strong>Lat:</strong> {coordinates.latitude}
                  <br />
                  <strong>Lon:</strong> {coordinates.longitude}
                </>
              )}
            </div>
          )}
        </div>

        <div>
          <Button 
            onClick={handleTriggerBackfill}
            disabled={loading}
            className="w-full"
          >
            {loading ? "🔄 Lädt..." : "🌤️ Täglichen Wetter-Backfill starten"}
          </Button>
          
          {result && (
            <div className="mt-2 p-3 bg-muted rounded text-sm">
              <strong>Ergebnis:</strong>
              <br />
              ✅ Erfolgreich: {result.ok}
              <br />
              ⏭️ Übersprungen: {result.skip}
              <br />
              ❌ Fehlgeschlagen: {result.fail}
              <br />
              <strong>Nachricht:</strong> {result.message}
              <br />
              <strong>Zeitstempel:</strong> {result.timestamp}
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          <p><strong>Hinweis:</strong> Der Backfill holt Wetter-Daten für GESTERN (Europe/Berlin) und verknüpft sie mit Migräne-Einträgen.</p>
          <p><strong>Idempotenz:</strong> Mehrfache Ausführung ist sicher - bereits vorhandene Daten werden übersprungen.</p>
        </div>
      </div>
    </Card>
  );
};