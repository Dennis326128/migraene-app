import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchPressureDelta24hFromArchive } from "./pressureDelta24h.ts";

// ─────────────────────────────────────────────────────────────────────────
// Mock fetch helper
// ─────────────────────────────────────────────────────────────────────────

function mockFetch(payload: unknown, ok = true): typeof fetch {
  return (async () => {
    return {
      ok,
      json: async () => payload,
    } as Response;
  }) as unknown as typeof fetch;
}

// Helper to build 48h hourly time/pressure arrays starting at startIso.
function buildHourly(startIso: string, pressures: (number | null)[]) {
  const startMs = new Date(startIso).getTime();
  const times: string[] = [];
  for (let i = 0; i < pressures.length; i++) {
    const d = new Date(startMs + i * 3600_000);
    // Open-Meteo returns "YYYY-MM-DDTHH:00" without Z when timezone=UTC.
    times.push(d.toISOString().slice(0, 16));
  }
  return { hourly: { time: times, surface_pressure: pressures } };
}

// ─────────────────────────────────────────────────────────────────────────
// Core happy path: Δ is computed from hourly archive
// ─────────────────────────────────────────────────────────────────────────

Deno.test("computes positive Δ24h from hourly archive (rising pressure)", async () => {
  // 48 hours starting at 2025-06-01T00:00 UTC.
  // T-24h pressure = 1000, T pressure = 1006 → Δ = +6 hPa
  const pressures = new Array(48).fill(null).map((_, i) => 1000 + (i >= 24 ? 6 : 0));
  const fetchImpl = mockFetch(buildHourly("2025-06-01T00:00:00Z", pressures));
  const delta = await fetchPressureDelta24hFromArchive(52.5, 13.4, "2025-06-02T00:00:00Z", fetchImpl);
  assertEquals(delta, 6);
});

Deno.test("computes negative Δ24h from hourly archive (falling pressure)", async () => {
  const pressures = new Array(48).fill(null).map((_, i) => (i >= 24 ? 995 : 1010));
  const fetchImpl = mockFetch(buildHourly("2025-06-01T00:00:00Z", pressures));
  const delta = await fetchPressureDelta24hFromArchive(52.5, 13.4, "2025-06-02T00:00:00Z", fetchImpl);
  assertEquals(delta, -15);
});

Deno.test("rounds Δ24h to nearest integer", async () => {
  // T-24h = 1000.0, T = 1003.7  → Δ rounded = 4
  const pressures = [...new Array(24).fill(1000.0), 1003.7, ...new Array(23).fill(1003.7)];
  const fetchImpl = mockFetch(buildHourly("2025-06-01T00:00:00Z", pressures));
  const delta = await fetchPressureDelta24hFromArchive(52.5, 13.4, "2025-06-02T00:00:00Z", fetchImpl);
  assertEquals(delta, 4);
});

// ─────────────────────────────────────────────────────────────────────────
// Failure / null paths
// ─────────────────────────────────────────────────────────────────────────

Deno.test("returns null when archive HTTP request fails", async () => {
  const fetchImpl = mockFetch({}, false);
  const delta = await fetchPressureDelta24hFromArchive(52.5, 13.4, "2025-06-02T00:00:00Z", fetchImpl);
  assertEquals(delta, null);
});

Deno.test("returns null when hourly arrays are empty", async () => {
  const fetchImpl = mockFetch({ hourly: { time: [], surface_pressure: [] } });
  const delta = await fetchPressureDelta24hFromArchive(52.5, 13.4, "2025-06-02T00:00:00Z", fetchImpl);
  assertEquals(delta, null);
});

Deno.test("returns null when T or T-24h slot is missing pressure", async () => {
  // 48h all null
  const pressures = new Array(48).fill(null);
  const fetchImpl = mockFetch(buildHourly("2025-06-01T00:00:00Z", pressures));
  const delta = await fetchPressureDelta24hFromArchive(52.5, 13.4, "2025-06-02T00:00:00Z", fetchImpl);
  assertEquals(delta, null);
});

Deno.test("returns null for invalid date input", async () => {
  const fetchImpl = mockFetch(buildHourly("2025-06-01T00:00:00Z", new Array(48).fill(1010)));
  const delta = await fetchPressureDelta24hFromArchive(52.5, 13.4, "not-a-date", fetchImpl);
  assertEquals(delta, null);
});

Deno.test("rejects matches more than 3h away from target time", async () => {
  // Only one data point at T (no T-24h slot anywhere near). 4h is > 3h tolerance.
  const times = ["2025-06-02T00:00", "2025-06-02T04:00"];
  const surface_pressure: (number | null)[] = [1010, 1015];
  const fetchImpl = mockFetch({ hourly: { time: times, surface_pressure } });
  // Asking for 2025-06-02T00:00 — closest "prev" would be 2025-06-01T00:00 which is missing
  const delta = await fetchPressureDelta24hFromArchive(52.5, 13.4, "2025-06-02T00:00:00Z", fetchImpl);
  assertEquals(delta, null);
});
