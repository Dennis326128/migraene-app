// Shared helper: compute pressure_change_24h directly from Open-Meteo Archive.
// Strategy: fetch hourly surface_pressure for [date-1, date], pick the index
// closest to `at` and the index 24h earlier, return rounded Δ (hPa).
// Returns null if the archive does not provide usable data.
//
// `fetchImpl` is injectable so the function is testable without network.

export interface ArchiveResponse {
  hourly?: {
    time?: string[];
    surface_pressure?: (number | null)[];
  };
}

export async function fetchPressureDelta24hFromArchive(
  lat: number,
  lon: number,
  atIso: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const at = new Date(atIso);
    if (Number.isNaN(at.getTime())) return null;

    const prev = new Date(at.getTime() - 24 * 60 * 60 * 1000);
    const startDate = prev.toISOString().split('T')[0];
    const endDate = at.toISOString().split('T')[0];

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=surface_pressure&timezone=UTC`;
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const data = (await res.json()) as ArchiveResponse;

    const times = data?.hourly?.time;
    const pressures = data?.hourly?.surface_pressure;
    if (!Array.isArray(times) || !Array.isArray(pressures) || times.length === 0) return null;

    const pickClosest = (targetMs: number): number | null => {
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < times.length; i++) {
        // Open-Meteo returns naïve ISO without "Z" when timezone=UTC; coerce to UTC.
        const isoUtc = times[i].endsWith('Z') ? times[i] : times[i] + 'Z';
        const t = new Date(isoUtc).getTime();
        const diff = Math.abs(t - targetMs);
        if (diff < bestDiff && pressures[i] != null) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) return null;
      // Reject matches > 3h away — protects against sparse archive coverage.
      if (bestDiff > 3 * 60 * 60 * 1000) return null;
      return pressures[bestIdx] as number;
    };

    const pNow = pickClosest(at.getTime());
    const pPrev = pickClosest(prev.getTime());
    if (pNow == null || pPrev == null) return null;

    return Math.round(pNow - pPrev);
  } catch (_err) {
    return null;
  }
}
