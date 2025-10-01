import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CloudSun, Loader2, CheckCircle2, AlertCircle, Zap } from "lucide-react";

export const WeatherImportButton = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [useBatchMode, setUseBatchMode] = useState(true);

  const handleCleanImport = async () => {
    setIsImporting(true);
    setResult(null);
    setProgress(0);
    
    try {
      const functionName = useBatchMode ? 'batch-weather-import' : 'clean-weather-import';
      console.log(`🚀 Starting ${useBatchMode ? 'batch' : 'sequential'} import`);
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {}
      });

      if (error) {
        throw error;
      }

      setResult(data);
      setProgress(data.progress || 100);
      
      if (data.totalProcessed === 0) {
        toast.info("ℹ️ Alle Einträge haben bereits Wetterdaten - kein Import erforderlich.");
      } else if (data.successCount > 0 && data.failCount === 0) {
        const mode = useBatchMode ? '⚡ Batch-Modus' : 'Standard';
        toast.success(`✅ ${mode}: Import erfolgreich! ${data.successCount} Einträge mit Wetterdaten aktualisiert.`);
      } else if (data.successCount > 0 && data.failCount > 0) {
        toast.warning(`⚠️ Import teilweise erfolgreich: ${data.successCount} erfolgreich, ${data.failCount} fehlgeschlagen.`);
      } else if (data.failCount > 0) {
        toast.error(`❌ Import fehlgeschlagen für ${data.failCount} Einträge. Bitte überprüfen Sie Ihre Koordinaten in den Einstellungen.`);
      }
      
      if (data.errors && data.errors.length > 0) {
        console.log('Import-Fehler Details:', data.errors);
      }
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error(`❌ Import fehlgeschlagen: ${error.message}`);
    } finally {
      setIsImporting(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Button
          size="sm"
          variant={useBatchMode ? "default" : "outline"}
          onClick={() => setUseBatchMode(true)}
          disabled={isImporting}
        >
          <Zap className="w-3 h-3 mr-1" />
          Batch-Modus (schnell)
        </Button>
        <Button
          size="sm"
          variant={!useBatchMode ? "default" : "outline"}
          onClick={() => setUseBatchMode(false)}
          disabled={isImporting}
        >
          <CloudSun className="w-3 h-3 mr-1" />
          Standard (langsam)
        </Button>
      </div>

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
            {useBatchMode ? <Zap className="w-4 h-4 mr-2" /> : <CloudSun className="w-4 h-4 mr-2" />}
            Wetterdaten für alle Einträge importieren {useBatchMode ? '(Schnell)' : ''}
          </>
        )}
      </Button>

      {isImporting && progress > 0 && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">{progress}% abgeschlossen</p>
        </div>
      )}
      
      {result && (
        <div className={`p-4 rounded-lg text-sm border ${
          result.failCount === 0 ? 'bg-green-50 border-green-200' : 
          result.successCount > 0 ? 'bg-amber-50 border-amber-200' : 
          'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start gap-2 mb-3">
            {result.failCount === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-semibold mb-1">
                {result.totalProcessed === 0 ? 'Kein Import erforderlich' :
                 result.failCount === 0 ? 'Import erfolgreich abgeschlossen' :
                 result.successCount > 0 ? 'Import teilweise erfolgreich' :
                 'Import fehlgeschlagen'}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-4">
                  <span>Verarbeitet: <strong>{result.totalProcessed}</strong></span>
                  {result.successCount > 0 && (
                    <span className="text-green-700">✓ Erfolgreich: <strong>{result.successCount}</strong></span>
                  )}
                  {result.failCount > 0 && (
                    <span className="text-red-700">✗ Fehlgeschlagen: <strong>{result.failCount}</strong></span>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {result.debug && (
            <div className="text-xs text-muted-foreground pt-2 border-t">
              <div className="flex items-center gap-2">
                <span>Gesamt-Einträge: {result.debug.totalUserEntries}</span>
                <span>•</span>
                <span>Mit Wetterdaten: {result.debug.entriesWithWeather}</span>
                {result.debug.userHasFallbackCoords ? (
                  <span className="text-green-700">• ✓ Koordinaten konfiguriert</span>
                ) : (
                  <span className="text-red-700">• ⚠ Keine Koordinaten - Bitte in Einstellungen hinzufügen</span>
                )}
              </div>
            </div>
          )}
          
          {result.errors && result.errors.length > 0 && (
            <details className="mt-3 pt-3 border-t">
              <summary className="text-xs font-medium text-red-700 cursor-pointer hover:text-red-800">
                Fehlerdetails anzeigen ({result.errors.length} Fehler)
              </summary>
              <div className="mt-2 space-y-1 text-xs text-red-700 max-h-40 overflow-y-auto bg-white/50 p-2 rounded">
                {result.errors.map((error: string, index: number) => (
                  <div key={index} className="font-mono">• {error}</div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};