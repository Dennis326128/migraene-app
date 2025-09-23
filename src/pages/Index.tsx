import { useEffect } from "react";
import { PainApp } from "@/components/PainApp";
import { logDailyWeatherSnapshots } from "@/utils/weatherLogger";

const Index = () => {
  useEffect(() => {
    const key = "weather-snapshots-last";
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem(key);
    if (last !== today) {
      logDailyWeatherSnapshots().finally(() => localStorage.setItem(key, today));
    }
  }, []);
  return <PainApp />;
};

export default Index;
