import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { triggerAutoBackfill, checkUserCoordinates } from '@/lib/clientWeather';
import { backfillWeatherFromEntryCoordinates } from '@/utils/weatherBackfillFromEntries';
import { supabase } from '@/integrations/supabase/client';
import { Play, Pause, RotateCcw, Settings, CheckCircle, AlertCircle, Clock, MapPin } from 'lucide-react';

interface BackfillStats {
  totalMissingEntries: number;
  totalMissingEvents: number;
  entriesWithCoords: number;
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

      const [painEntriesResult, entriesWithCoordsResult] = await Promise.all([
        supabase
          .from('pain_entries')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)
          .is('weather_id', null),
        supabase
          .from('pain_entries')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)
          .is('weather_id', null)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
      ]);

      setStats({
        totalMissingEntries: painEntriesResult.count || 0,
        totalMissingEvents: 0, // Events system removed
        entriesWithCoords: entriesWithCoordsResult.count || 0,
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

  const startCoordinateBackfill = async () => {
    setProgress(prev => ({
      ...prev,
      isRunning: true,
      totalEntries: stats?.entriesWithCoords || 0,
      successCount: 0,
      failCount: 0,
      currentAction: 'GPS-Koordinaten Backfill...',
      logs: ['🚀 GPS-basiertes Backfill gestartet']
    }));

    try {
      const result = await backfillWeatherFromEntryCoordinates();
      setProgress(prev => ({
        ...prev,
        isRunning: false,
        successCount: result.successful,
        failCount: result.failed,
        currentAction: 'Abgeschlossen'
      }));

      toast({
        title: "GPS-Backfill abgeschlossen",
        description: `${result.successful} erfolgreich, ${result.failed} fehlgeschlagen`
      });

      await loadStats();
    } catch (error: any) {
      setProgress(prev => ({ ...prev, isRunning: false }));
      toast({
        title: "Fehler beim GPS-Backfill",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  return null;
}
