import { useEffect } from "react";
import { PainApp } from "@/components/PainApp";
import { logDailyWeatherSnapshots } from "@/utils/weatherLogger";
import { backfillWeatherForRecentEntries } from "@/utils/backfillWeather";
import { getUserSettings } from "@/features/settings/api/settings.api";
import { useOptimizedCache } from "@/hooks/useOptimizedCache";
import { getMigrationStatus, migratePainEntriesToEvents } from "@/services/migration.service";
import { toast } from "sonner";

const Index = () => {
  const { prefetchEssentials } = useOptimizedCache();

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);

    // Prefetch essential data for better performance
    prefetchEssentials();

    // a) Tägliche Wetter-Snapshots (06/12/18 Uhr)
    const keyA = "weather-snapshots-last";
    const lastA = localStorage.getItem(keyA);
    if (lastA !== today) {
      logDailyWeatherSnapshots().finally(() => localStorage.setItem(keyA, today));
    }

    // b) Verbesserter Migräne-Wetter-Backfill (letzte 7 Tage)
    const keyB = "migraine-weather-backfill-last";
    const lastB = localStorage.getItem(keyB);
    if (lastB !== today) {
      (async () => {
        try {
          const s = await getUserSettings().catch(() => null);
          const days = s?.backfill_days ?? 7; // Reduziert auf 7 Tage für bessere Performance
          
          const { backfillMigrainWeatherEntries } = await import("@/utils/migraineBackfill");
          const result = await backfillMigrainWeatherEntries(days);
          
          if (result.success > 0) {
            console.log(`✅ ${result.success} Migräne-Einträge mit Wetter-Daten ergänzt`);
          }
        } catch (error) {
          console.warn('⚠️ Wetter-Backfill Fehler:', error);
        } finally {
          localStorage.setItem(keyB, today);
        }
      })();
    }

    // c) Auto-Migration von Legacy Pain Entries
    const keyC = "auto-migration-last";
    const lastC = localStorage.getItem(keyC);
    if (lastC !== today) {
      (async () => {
        try {
          const status = await getMigrationStatus();
          
          // Nur migrieren wenn tatsächlich Legacy-Daten existieren
          if (status && status.painEntries > 0 && (status.needsMigration || status.events < status.painEntries * 0.8)) {
            toast.info("Migräne-Daten werden aktualisiert...");
            
            const result = await migratePainEntriesToEvents();
            
            if (result.successful > 0) {
              toast.success(`System aktualisiert! ${result.successful} Einträge migriert.`, {
                duration: 5000
              });
            } else if (result.errors.length > 0) {
              toast.error("Migration teilweise fehlgeschlagen. Bitte prüfen Sie die Einstellungen.");
            }
          }
        } catch (error) {
          console.warn('⚠️ Auto-Migration Fehler:', error);
          toast.error("Migration fehlgeschlagen. Sie können sie manuell in den Einstellungen starten.");
        } finally {
          localStorage.setItem(keyC, today);
        }
      })();
    }
  }, [prefetchEssentials]);

  return <PainApp />;
};

export default Index;