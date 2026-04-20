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
  source: "open-meteo";
  tempMin?: number;
  tempMax?: number;
  pressure?: number;
  humidity?: number;
  precipitationMm?: number;
};

/**
 * Fetch daily weather data via Open-Meteo (privacy-friendly, EU, no API key).
 * OpenWeatherMap support has been removed for DSGVO compliance.
 */
export async function fetchDailyWeather({ lat, lon, dateUTC, city }: FetchArgs): Promise<WeatherDay | null> {
  return fetchOpenMeteoHistorical({ lat, lon, dateUTC, city });
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
