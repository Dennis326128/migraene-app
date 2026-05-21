import { describe, it, expect } from 'vitest';
import { computeWeatherCoverage } from '../weatherCoverage';

const mk = (date: string, full = true) => ({
  snapshot_date: date,
  pressure_mb: full ? 1015 : null,
  temperature_c: full ? 12 : null,
  pressure_change_24h: full ? -2 : null,
});

describe('computeWeatherCoverage', () => {
  it('reports ok status when ≥85% coverage', () => {
    const days = Array.from({ length: 10 }, (_, i) =>
      mk(`2026-05-${String(i + 1).padStart(2, '0')}`),
    );
    const r = computeWeatherCoverage({
      fromISO: '2026-05-01',
      toISO: '2026-05-10',
      weather: days,
    });
    expect(r.totalDays).toBe(10);
    expect(r.daysWithUsableWeather).toBe(10);
    expect(r.status).toBe('ok');
    expect(r.missingDays).toEqual([]);
  });

  it('flags limited at 50–85%', () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      mk(`2026-05-${String(i + 1).padStart(2, '0')}`),
    );
    const r = computeWeatherCoverage({
      fromISO: '2026-05-01',
      toISO: '2026-05-10',
      weather: days,
    });
    expect(r.status).toBe('limited');
    expect(r.daysWithUsableWeather).toBe(7);
  });

  it('flags insufficient under 50%', () => {
    const days = Array.from({ length: 4 }, (_, i) =>
      mk(`2026-05-${String(i + 1).padStart(2, '0')}`),
    );
    const r = computeWeatherCoverage({
      fromISO: '2026-05-01',
      toISO: '2026-05-10',
      weather: days,
    });
    expect(r.status).toBe('insufficient');
    expect(r.missingDays.length).toBe(6);
  });

  it('reports pain-day gaps and pain-free comparison days', () => {
    const r = computeWeatherCoverage({
      fromISO: '2026-05-01',
      toISO: '2026-05-05',
      weather: [mk('2026-05-01'), mk('2026-05-02'), mk('2026-05-04')],
      painDays: ['2026-05-01', '2026-05-03'],
    });
    expect(r.painDaysWithoutWeather).toEqual(['2026-05-03']);
    expect(r.painFreeDaysWithWeather).toBe(2); // 05-02, 05-04
  });

  it('ignores partial rows for usability count', () => {
    const r = computeWeatherCoverage({
      fromISO: '2026-05-01',
      toISO: '2026-05-02',
      weather: [mk('2026-05-01', false), mk('2026-05-02')],
    });
    expect(r.daysWithWeather).toBe(2);
    expect(r.daysWithUsableWeather).toBe(1);
  });
});
