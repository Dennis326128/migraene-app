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
      
      if (data.successful > 0) {
        toast.success(`✅ Wetter-Import erfolgreich! ${data.successful} von ${data.total} Einträgen aktualisiert.`);
      } else if (data.total === 0) {
        toast.info("ℹ️ Alle Einträge haben bereits Wetterdaten.");
      } else {
        toast.warning(`⚠️ Import abgeschlossen, aber ${data.failed} Einträge fehlgeschlagen.`);
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
            <div>Gesamt: {result.total} Einträge</div>
            <div className="text-green-600">Erfolgreich: {result.successful}</div>
            {result.failed > 0 && (
              <div className="text-red-600">Fehlgeschlagen: {result.failed}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};