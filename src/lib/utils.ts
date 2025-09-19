import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility: Kombiniert Tailwind- und andere Klassen.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Wandelt den numerischen Mondphasenwert (0 - 1) von OpenWeather in eine lesbare Beschreibung um.
 * Quelle: OpenWeatherMap API Dokumentation
 */
export function getMoonPhaseName(phase?: number): string {
  if (phase === undefined || phase === null) return "Unbekannt";

  // Sicherstellen, dass der Wert zwischen 0 und 1 liegt
  const p = Math.max(0, Math.min(phase, 1));

  if (p === 0 || p === 1) return "Neumond";
  if (p > 0 && p < 0.25) return "Zunehmende Sichel";
  if (p === 0.25) return "Erstes Viertel";
  if (p > 0.25 && p < 0.5) return "Zunehmender Halbmond";
  if (p === 0.5) return "Vollmond";
  if (p > 0.5 && p < 0.75) return "Abnehmender Halbmond";
  if (p === 0.75) return "Letztes Viertel";
  if (p > 0.75 && p < 1) return "Abnehmende Sichel";

  return "Unbekannt";
}
