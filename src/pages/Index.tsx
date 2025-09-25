import { useEffect } from "react";
import { PainApp } from "@/components/PainApp";
import { logDailyWeatherSnapshots } from "@/utils/weatherLogger";
import { backfillWeatherForRecentEntries } from "@/utils/backfillWeather";
import { getUserSettings } from "@/features/settings/api/settings.api";
import { useOptimizedCache } from "@/hooks/useOptimizedCache";

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
  }, [prefetchEssentials]);

  return <PainApp />;
};

export default Index;