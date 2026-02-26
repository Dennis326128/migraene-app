/**
 * DEV-only collapsible debug panel for weather diagnostics.
 * Shows entry weather status, snapshot fallback info, and join reason.
 */
import React, { useState } from 'react';

export type WeatherMissingReason =
  | 'OK'
  | 'NO_LOCATION'
  | 'WEATHER_PENDING'
  | `WEATHER_FAILED:${string}`
  | 'NO_WEATHER_ID_AND_NO_SNAPSHOT'
  | 'WEATHER_ID_MISSING_LOG'
  | 'UNKNOWN';

export interface WeatherDebugInfo {
  entryId: number | string;
  selectedDate: string | null;
  selectedTime: string | null;
  timestampCreated: string | null;
  weatherId: number | null;
  weatherStatus: string | null;
  weatherErrorCode: string | null;
  weatherRetryCount: number | null;
  weatherErrorAt: string | null;
  hasEntryWeather: boolean;
  snapshotFallbackUsed: boolean;
  snapshotWeatherId: number | null;
  missingReason: WeatherMissingReason;
}

/**
 * Determine why weather is missing for an entry.
 */
export function explainWeatherMissing(params: {
  weatherId: number | null;
  weatherStatus: string | null;
  weatherErrorCode: string | null;
  hasEntryWeather: boolean;
  snapshotAvailable: boolean;
  hasLocation: boolean;
}): WeatherMissingReason {
  const { weatherId, weatherStatus, weatherErrorCode, hasEntryWeather, snapshotAvailable, hasLocation } = params;

  if (hasEntryWeather) return 'OK';
  if (snapshotAvailable) return 'OK';

  if (!hasLocation) return 'NO_LOCATION';
  if (weatherStatus === 'pending') return 'WEATHER_PENDING';
  if (weatherStatus === 'failed') return `WEATHER_FAILED:${weatherErrorCode || 'UNKNOWN'}`;
  if (weatherId != null && !hasEntryWeather) return 'WEATHER_ID_MISSING_LOG';
  if (weatherId == null && !snapshotAvailable) return 'NO_WEATHER_ID_AND_NO_SNAPSHOT';

  return 'UNKNOWN';
}

export function WeatherDebugPanel({ info }: { info: WeatherDebugInfo }) {
  const [open, setOpen] = useState(false);

  // Only render in DEV or when VITE_WEATHER_DEBUG flag is set
  const isDebugEnabled = import.meta.env.DEV || import.meta.env.VITE_WEATHER_DEBUG === 'true';
  if (!isDebugEnabled) return null;

  const reasonColor =
    info.missingReason === 'OK' ? 'text-green-500' :
    info.missingReason.startsWith('WEATHER_FAILED') ? 'text-red-400' :
    info.missingReason === 'WEATHER_PENDING' ? 'text-yellow-400' :
    'text-orange-400';

  return (
    <div className="mt-2 border border-border/30 rounded text-[10px] font-mono bg-muted/20">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left px-2 py-0.5 text-muted-foreground/50 hover:text-muted-foreground/80 flex items-center gap-1"
      >
        <span>{open ? '▼' : '▶'}</span>
        <span>Weather Debug</span>
        <span className={reasonColor}>[{info.missingReason}]</span>
      </button>
      {open && (
        <div className="px-2 pb-1 space-y-0.5 text-muted-foreground/60">
          <Row label="entry.id" value={info.entryId} />
          <Row label="selected_date" value={info.selectedDate} />
          <Row label="selected_time" value={info.selectedTime} />
          <Row label="timestamp_created" value={info.timestampCreated} />
          <Row label="weather_id" value={info.weatherId} />
          <Row label="weather_status" value={info.weatherStatus} />
          <Row label="weather_error_code" value={info.weatherErrorCode} />
          <Row label="weather_retry_count" value={info.weatherRetryCount} />
          <Row label="weather_error_at" value={info.weatherErrorAt} />
          <Row label="hasEntryWeather" value={info.hasEntryWeather} />
          <Row label="snapshotFallback" value={info.snapshotFallbackUsed} />
          <Row label="snapshot.id" value={info.snapshotWeatherId} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  const display = value === null || value === undefined ? '–' : String(value);
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground/40 min-w-[120px]">{label}:</span>
      <span>{display}</span>
    </div>
  );
}
