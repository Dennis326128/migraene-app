type FetchArgs = {
  lat: number; 
  lon: number;
  dateUTC: Date;       // Mit 00:00 UTC für den Zieltag
  city?: string;
};

export type WeatherDay = {
  dateISO: string;     // yyyy-mm-ddT00:00:00.000Z
  lat?: number; 
  lon?: number; 
  city?: string;
  source: "openweather" | "open-meteo";
  tempMin?: number; 
  tempMax?: number;
  pressure?: number; 
  humidity?: number;
  precipitationMm?: number;
};

// Provider aus ENV oder Fallback
const getProvider = (): "openweather" | "open-meteo" => {
  if (typeof window !== 'undefined') return "open-meteo"; // Client-side fallback
  return (process?.env?.WEATHER_PROVIDER as "openweather" | "open-meteo") || "open-meteo";
};

export async function fetchDailyWeather({ lat, lon, dateUTC, city }: FetchArgs): Promise<WeatherDay | null> {
  const dateISO = new Date(dateUTC); 
  dateISO.setUTCHours(0, 0, 0, 0);
  
  const PROVIDER = getProvider();
  const base: WeatherDay = { 
    dateISO: dateISO.toISOString(), 
    lat, 
    lon, 
    city, 
    source: PROVIDER 
  };

  try {
    if (PROVIDER === "openweather") {
      const key = process?.env?.OPENWEATHER_API_KEY;
      if (!key) {
        console.warn("OPENWEATHER_API_KEY fehlt, nutze open-meteo fallback");
        return await fetchOpenMeteoHistorical({ lat, lon, dateUTC, city });
      }
      
      // OpenWeather Timemachine: nimmt Unix-Sekunden innerhalb ~5 Tagen
      const ts = Math.floor(dateISO.getTime() / 1000) + 12 * 3600; // 12:00 UTC mitten am Tag
      const url = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${lat}&lon=${lon}&dt=${ts}&appid=${key}&units=metric`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OpenWeather ${res.status}: ${res.statusText}`);
      
      const json = await res.json();

      // Einfache Aggregation (min/max/avg aus stündlichen Daten)
      const hours = Array.isArray(json?.data ?? json?.hourly) ? (json.data ?? json.hourly) : [];
      if (!hours.length) return base;

      const temps = hours.map((h: any) => h.temp ?? h.temperature).filter((t: any) => t != null);
      const hums = hours.map((h: any) => h.humidity).filter((v: any) => v != null);
      const press = hours.map((h: any) => h.pressure).filter((v: any) => v != null);
      const rain = hours.map((h: any) => (h.rain?.["1h"] ?? h.precipitation ?? 0));

      if (!temps.length) return base;

      return {
        ...base,
        tempMin: Math.min(...temps),
        tempMax: Math.max(...temps),
        humidity: hums.length ? Math.round(hums.reduce((a: number, b: number) => a + b, 0) / hums.length) : undefined,
        pressure: press.length ? Math.round(press.reduce((a: number, b: number) => a + b, 0) / press.length) : undefined,
        precipitationMm: Math.round(rain.reduce((a: number, b: number) => a + b, 0) * 10) / 10,
      };
    }

    // Fallback: Open-Meteo (historisch tageweise)
    return await fetchOpenMeteoHistorical({ lat, lon, dateUTC, city });

  } catch (e) {
    console.warn("fetchDailyWeather error:", e);
    return null;
  }
}

async function fetchOpenMeteoHistorical({ lat, lon, dateUTC, city }: FetchArgs): Promise<WeatherDay | null> {
  const dateISO = new Date(dateUTC);
  dateISO.setUTCHours(0, 0, 0, 0);
  
  const base: WeatherDay = { 
    dateISO: dateISO.toISOString(), 
    lat, 
    lon, 
    city, 
    source: "open-meteo" 
  };

  try {
    const day = new Date(dateISO);
    const yyyy = day.getUTCFullYear();
    const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(day.getUTCDate()).padStart(2, "0");
    const range = `${yyyy}-${mm}-${dd}`;
    
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${range}&end_date=${range}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,pressure_msl_mean,relative_humidity_2m_mean&timezone=UTC`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open-meteo ${res.status}: ${res.statusText}`);
    
    const j = await res.json();
    const d = j?.daily;
    if (!d) return base;
    
    return {
      ...base,
      tempMin: d.temperature_2m_min?.[0],
      tempMax: d.temperature_2m_max?.[0],
      precipitationMm: d.precipitation_sum?.[0],
      pressure: Array.isArray(d.pressure_msl_mean) ? Math.round(d.pressure_msl_mean[0]) : undefined,
      humidity: Array.isArray(d.relative_humidity_2m_mean) ? Math.round(d.relative_humidity_2m_mean[0]) : undefined,
    };
  } catch (e) {
    console.warn("fetchOpenMeteoHistorical error:", e);
    return null;
  }
}