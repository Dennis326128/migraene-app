import { useEffect } from "react";
import { PainApp } from "@/components/PainApp";
import { logDailyWeatherSnapshots } from "@/utils/weatherLogger";
import { backfillWeatherForRecentEntries } from "@/utils/backfillWeather";

const Index = () => {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);

    // a) Tägliche Snapshots (06/12/18)
    const keyA = "weather-snapshots-last";
    const lastA = localStorage.getItem(keyA);
    if (lastA !== today) {
      logDailyWeatherSnapshots().finally(() => localStorage.setItem(keyA, today));
    }

    // b) Eintrags-Wetter-Backfill (letzte 7 Tage)
    const keyB = "entries-weather-backfill-last";
    const lastB = localStorage.getItem(keyB);
    if (lastB !== today) {
      backfillWeatherForRecentEntries(7).finally(() => localStorage.setItem(keyB, today));
    }
  }, []);

  return <PainApp />;
};

export default Index;