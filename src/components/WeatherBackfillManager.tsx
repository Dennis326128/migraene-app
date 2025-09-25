import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { triggerAutoBackfill, checkUserCoordinates } from '@/lib/clientWeather';
import { supabase } from '@/integrations/supabase/client';
import { Play, Pause, RotateCcw, Settings, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface BackfillStats {
  totalMissingEntries: number;
  totalMissingEvents: number;
  hasCoordinates: boolean;
  userLatitude?: number;
  userLongitude?: number;
}

interface BackfillProgress {
  isRunning: boolean;
  currentEntry: number;
  totalEntries: number;
  successCount: number;
  failCount: number;
  currentAction: string;
  logs: string[];
}

export function WeatherBackfillManager() {
  const [stats, setStats] = useState<BackfillStats | null>(null);
  const [progress, setProgress] = useState<BackfillProgress>({
    isRunning: false,
    currentEntry: 0,
    totalEntries: 0,
    successCount: 0,
    failCount: 0,
    currentAction: '',
    logs: []
  });
  const [isPaused, setIsPaused] = useState(false);
  const { toast } = useToast();

  // Load initial stats
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Check user coordinates
      const coordsResult = await checkUserCoordinates();
      
      // Count entries without weather data
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [painEntriesResult, eventsResult] = await Promise.all([
        supabase
          .from('pain_entries')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)
          .is('weather_id', null),
        supabase
          .from('events')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)
          .is('weather_id', null)
      ]);

      setStats({
        totalMissingEntries: painEntriesResult.count || 0,
        totalMissingEvents: eventsResult.count || 0,
        hasCoordinates: coordsResult.hasCoordinates,
        userLatitude: coordsResult.latitude,
        userLongitude: coordsResult.longitude
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      toast({
        title: "Fehler beim Laden der Statistiken",
        description: "Konnte aktuelle Wetterdaten-Status nicht ermitteln",
        variant: "destructive"
      });
    }
  };

  const startBackfill = async () => {
    if (!stats?.hasCoordinates) {
      toast({
        title: "Keine Koordinaten",
        description: "Bitte zuerst Standort in den Einstellungen festlegen",
        variant: "destructive"
      });
      return;
    }

    setProgress(prev => ({
      ...prev,
      isRunning: true,
      currentEntry: 0,
      totalEntries: (stats.totalMissingEntries || 0) + (stats.totalMissingEvents || 0),
      successCount: 0,
      failCount: 0,
      currentAction: 'Starte Wetter-Backfill...',
      logs: ['🚀 Wetter-Backfill gestartet', '📡 Verbinde mit Wetter-Service...']
    }));

    try {
      const result = await triggerAutoBackfill();
      
      const completionLogs = [
        `🎉 Backfill abgeschlossen!`,
        `📊 Verarbeitet: ${result.totalProcessed || 0} Einträge`,
        `✅ Erfolgreich: ${result.successCount || 0}`,
        `❌ Fehlgeschlagen: ${result.failCount || 0}`
      ];

      // Add first 3 errors if any
      if (result.errors && result.errors.length > 0) {
        completionLogs.push('🔍 Erste Fehler:');
        result.errors.slice(0, 3).forEach((error: string) => {
          completionLogs.push(`  • ${error}`);
        });
        if (result.errors.length > 3) {
          completionLogs.push(`  ... und ${result.errors.length - 3} weitere`);
        }
      }
      
      setProgress(prev => ({
        ...prev,
        isRunning: false,
        successCount: result.successCount || 0,
        failCount: result.failCount || 0,
        currentAction: result.success ? 'Backfill abgeschlossen' : 'Backfill teilweise erfolgreich',
        logs: [...prev.logs, ...completionLogs]
      }));

      toast({
        title: result.success ? "Backfill erfolgreich" : "Backfill teilweise erfolgreich",
        description: `${result.successCount || 0} erfolgreich, ${result.failCount || 0} fehlgeschlagen`,
        variant: result.success && result.failCount === 0 ? "default" : "destructive"
      });

      // Reload stats
      await loadStats();
    } catch (error: any) {
      setProgress(prev => ({
        ...prev,
        isRunning: false,
        currentAction: 'Fehler aufgetreten',
        logs: [...prev.logs, `❌ Verbindungsfehler: ${error.message}`, '💡 Tipp: Versuchen Sie es später erneut oder verwenden Sie den manuellen Modus']
      }));

      toast({
        title: "Backfill fehlgeschlagen",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const pauseBackfill = () => {
    setIsPaused(!isPaused);
    setProgress(prev => ({
      ...prev,
      currentAction: isPaused ? 'Fortgesetzt...' : 'Pausiert',
      logs: [...prev.logs, isPaused ? '▶️ Fortgesetzt' : '⏸️ Pausiert']
    }));
  };

  const resetProgress = () => {
    setProgress({
      isRunning: false,
      currentEntry: 0,
      totalEntries: 0,
      successCount: 0,
      failCount: 0,
      currentAction: '',
      logs: []
    });
  };

  const progressPercentage = progress.totalEntries > 0 
    ? ((progress.successCount + progress.failCount) / progress.totalEntries) * 100 
    : 0;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Intelligentes Wetter-Backfill System
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Automatisches Nachtragen von Wetterdaten für alle vorhandenen Einträge
        </p>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Schmerzeinträge</p>
                <p className="text-2xl font-bold text-primary">
                  {stats?.totalMissingEntries || 0}
                </p>
                <p className="text-xs text-muted-foreground">ohne Wetterdaten</p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Events</p>
                <p className="text-2xl font-bold text-primary">
                  {stats?.totalMissingEvents || 0}
                </p>
                <p className="text-xs text-muted-foreground">ohne Wetterdaten</p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Standort</p>
                {stats?.hasCoordinates ? (
                  <>
                    <p className="text-sm font-bold text-green-600">Verfügbar</p>
                    <p className="text-xs text-muted-foreground">
                      {stats.userLatitude?.toFixed(2)}, {stats.userLongitude?.toFixed(2)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-red-600">Nicht verfügbar</p>
                    <p className="text-xs text-muted-foreground">In Einstellungen festlegen</p>
                  </>
                )}
              </div>
              {stats?.hasCoordinates ? (
                <CheckCircle className="w-8 h-8 text-green-500" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-500" />
              )}
            </div>
          </Card>
        </div>

        {/* Progress Section */}
        {(progress.isRunning || progress.totalEntries > 0) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Fortschritt</h3>
              <div className="flex gap-2">
                <Badge variant={progress.isRunning ? "default" : "secondary"}>
                  {progress.isRunning ? "Läuft" : "Gestoppt"}
                </Badge>
                {isPaused && <Badge variant="outline">Pausiert</Badge>}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{progress.currentAction}</span>
                <span>{progress.successCount + progress.failCount} / {progress.totalEntries}</span>
              </div>
              <Progress value={progressPercentage} className="w-full" />
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Erfolgreich: {progress.successCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span>Fehlgeschlagen: {progress.failCount}</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={startBackfill}
            disabled={progress.isRunning || !stats?.hasCoordinates}
            className="flex-1 min-w-[200px]"
          >
            <Play className="w-4 h-4 mr-2" />
            {progress.isRunning ? 'Läuft...' : 'Wetter-Backfill starten'}
          </Button>
          
          {progress.isRunning && (
            <Button 
              variant="outline"
              onClick={pauseBackfill}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </Button>
          )}
          
          <Button 
            variant="outline"
            onClick={resetProgress}
            disabled={progress.isRunning}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          
          <Button 
            variant="outline"
            onClick={loadStats}
            disabled={progress.isRunning}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>

        {/* Live Logs */}
        {progress.logs.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Live-Protokoll</h3>
            <div className="bg-muted rounded-lg p-4 max-h-48 overflow-y-auto">
              {progress.logs.map((log, index) => (
                <div key={index} className="text-sm font-mono py-1">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Information Box */}
        <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            ℹ️ Wie funktioniert das Wetter-Backfill?
          </h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Verwendet kostenlose Open-Meteo API für historische Wetterdaten</li>
            <li>• Verarbeitet Einträge in Batches zur besseren Performance</li>
            <li>• Automatisches Rate-Limiting verhindert API-Überlastung</li>
            <li>• Robuste Datum/Zeit-Verarbeitung mit Fallback-Mechanismus</li>
            <li>• Bereits vorhandene Wetterdaten werden nicht überschrieben</li>
            <li>• Bei Fehlern wird automatisch auf timestamp_created zurückgegriffen</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}