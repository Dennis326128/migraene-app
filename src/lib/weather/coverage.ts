/**
 * SSOT coverage helpers for weather day features.
 */

import type { WeatherDayFeature } from './types';

/** Does this feature have any usable weather value? */
export function hasAnyWeatherValue(f: WeatherDayFeature): boolean {
  return f.pressureMb != null || f.temperatureC != null || f.humidity != null || f.pressureChange24h != null;
}

/** Does this feature have a 24h pressure delta? */
export function hasDelta(f: WeatherDayFeature): boolean {
  return f.pressureChange24h != null;
}
