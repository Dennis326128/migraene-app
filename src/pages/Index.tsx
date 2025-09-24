import { useEffect } from "react";
import { PainApp } from "@/components/PainApp";
import { logDailyWeatherSnapshots } from "@/utils/weatherLogger";
import { backfillWeatherForRecentEntries } from "@/utils/backfillWeather";
import { getUserSettings } from "@/features/settings/api/settings.api";

const Index = () => {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);

    // a) Tägliche Snapshots (06/12/18)
    const keyA = "weather-snapshots-last";
    const lastA = localStorage.getItem(keyA);
    if (lastA !== today) {
      logDailyWeatherSnapshots().finally(() => localStorage.setItem(keyA, today));
    }

    // b) Eintrags-Wetter-Backfill (letzte 30 Tage)
    const keyB = "entries-weather-backfill-last";
    const lastB = localStorage.getItem(keyB);
    if (lastB !== today) {
      (async () => {
        const s = await getUserSettings().catch(() => null);
        const days = s?.backfill_days ?? 30;
        backfillWeatherForRecentEntries(days).finally(() => localStorage.setItem(keyB, today));
      })();
    }
  }, []);

  return <PainApp />;
};

export default Index;