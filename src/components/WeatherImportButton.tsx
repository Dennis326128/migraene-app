import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CloudSun, Loader2 } from "lucide-react";

export const WeatherImportButton = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCleanImport = async () => {
    setIsImporting(true);
    setResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('clean-weather-import', {
        body: {}
      });

      if (error) {
        throw error;
      }

      setResult(data);
      
      if (data.successCount > 0) {
        toast.success(`✅ Wetter-Import erfolgreich! ${data.successCount} von ${data.totalProcessed} Einträgen aktualisiert.`);
      } else if (data.totalProcessed === 0) {
        toast.info("ℹ️ Alle Einträge haben bereits Wetterdaten.");
      } else {
        toast.warning(`⚠️ Import abgeschlossen, aber ${data.failCount} Einträge fehlgeschlagen.`);
        if (data.errors && data.errors.length > 0) {
          console.log('Import errors:', data.errors);
        }
      }
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error(`❌ Import fehlgeschlagen: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button 
        onClick={handleCleanImport}
        disabled={isImporting}
        className="w-full"
        variant="outline"
      >
        {isImporting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Wetterdaten werden importiert...
          </>
        ) : (
          <>
            <CloudSun className="w-4 h-4 mr-2" />
            Wetterdaten für alle Einträge importieren
          </>
        )}
      </Button>
      
      {result && (
        <div className="p-3 bg-muted rounded-lg text-sm">
          <div className="font-medium mb-2">Import-Ergebnis:</div>
          <div className="space-y-1">
            <div>Verarbeitet: {result.totalProcessed} Einträge</div>
            <div className="text-green-600">Erfolgreich: {result.successCount}</div>
            {result.failCount > 0 && (
              <div className="text-red-600">Fehlgeschlagen: {result.failCount}</div>
            )}
            {result.debug && (
              <div className="text-xs text-muted-foreground mt-2">
                User: {result.debug.userId?.slice(0, 8)}...
                {result.debug.userHasFallbackCoords ? ' (📍 Fallback-Koordinaten verfügbar)' : ' (⚠️ Keine Fallback-Koordinaten)'}
              </div>
            )}
            {result.errors && result.errors.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-red-600 cursor-pointer">Fehler anzeigen ({result.errors.length})</summary>
                <div className="mt-1 space-y-1 text-xs text-red-600 max-h-32 overflow-y-auto">
                  {result.errors.map((error: string, index: number) => (
                    <div key={index}>• {error}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
};