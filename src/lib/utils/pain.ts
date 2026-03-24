export function formatPainLevel(text: string) {
  return (text || "").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function mapTextLevelToScore(level: string | number): number {
  // If already numeric, return as-is
  if (typeof level === 'number') return Math.max(0, Math.min(10, level));
  
  const t = (level || "").toLowerCase().replace(/_/g, " ");
  if (t.includes("sehr") && t.includes("stark")) return 9;
  if (t.includes("stark")) return 7;
  if (t.includes("mittel")) return 5;
  if (t.includes("leicht")) return 2;
  
  // Try to parse as number if it's numeric string
  const num = parseInt(level as string);
  if (!isNaN(num)) return Math.max(0, Math.min(10, num));
  
  return 0;
}

export function convertNumericToCategory(level: number): "leicht" | "mittel" | "stark" | "sehr_stark" {
  if (level >= 8) return "sehr_stark";
  if (level >= 6) return "stark";
  if (level >= 3) return "mittel";
  return "leicht";
}

/**
 * SSOT: Normalize pain_level to 0-10 numeric score.
 * Returns 0 for invalid/unknown values (safe for aggregation).
 */
export function normalizePainLevel(level: string | number): number {
  if (typeof level === 'number') return Math.max(0, Math.min(10, level));
  return mapTextLevelToScore(level);
}

/**
 * SSOT: Strict normalization — returns null for invalid/unknown values.
 * Use when distinguishing "no data" from "pain level 0" matters
 * (charts, calendar, data points where null = gap).
 */
export function normalizePainLevelStrict(level: string | number | null | undefined): number | null {
  if (level === null || level === undefined) return null;

  if (typeof level === 'number') {
    return level >= 0 && level <= 10 ? level : null;
  }

  const str = String(level).toLowerCase().trim().replace(/_/g, ' ');
  if (str === '' || str === '-') return null;

  // Exact text mappings (German)
  const MAPPING: Record<string, number> = {
    'keine': 0,
    'leicht': 2,
    'schwach': 2,
    'gering': 2,
    'mittel': 5,
    'moderat': 5,
    'mäßig': 5,
    'stark': 7,
    'heftig': 8,
    'sehr stark': 9,
    'extrem': 10,
    'unerträglich': 10,
  };

  // Fuzzy match for "sehr stark" variants
  if (str.includes('sehr') && str.includes('stark')) return 9;
  if (str in MAPPING) return MAPPING[str];

  // Partial matches
  if (str.includes('stark')) return 7;
  if (str.includes('mittel')) return 5;
  if (str.includes('leicht')) return 2;

  // Numeric string
  const num = parseInt(str, 10);
  if (!isNaN(num) && num >= 0 && num <= 10) return num;

  return null;
}

export function formatAuraType(aura: string): string {
  const auraLabels: Record<string, string> = {
    "keine": "Keine Aura",
    "visuell": "Visuelle Aura",
    "sensorisch": "Sensorische Aura", 
    "sprachlich": "Sprachliche Aura",
    "gemischt": "Gemischte Aura"
  };
  return auraLabels[aura] || aura;
}

export function formatPainLocation(location: string): string {
  const locationLabels: Record<string, string> = {
    "einseitig_links": "Einseitig links",
    "einseitig_rechts": "Einseitig rechts",
    "beidseitig": "Beidseitig",
    "stirn": "Stirnbereich",
    "nacken": "Nackenbereich",
    "schlaefe": "Schläfenbereich",
    "top_of_head_burning": "Kopfoberseite (brennen)"
  };
  return locationLabels[location] || location;
}

export function formatPainLocations(locations: string[]): string {
  if (!locations || locations.length === 0) return '';
  return locations.map(formatPainLocation).join(', ');
}

/**
 * UI display helper: Returns consistent label, numeric string and category for any pain_level.
 * Builds on SSOT normalization — no own semantic logic.
 */
export interface PainDisplay {
  /** Numeric 0-10 or null */
  score: number | null;
  /** e.g. "7/10", "–" */
  numeric: string;
  /** Human label: "Stark", "Leicht", "Keine Angabe" */
  label: string;
  /** Category for color coding */
  category: 'none' | 'leicht' | 'mittel' | 'stark' | 'sehr_stark' | 'unknown';
}

export function formatPainDisplay(level: string | number | null | undefined): PainDisplay {
  const score = normalizePainLevelStrict(level);

  if (score === null) {
    return { score: null, numeric: '–', label: 'Keine Angabe', category: 'unknown' };
  }

  const numeric = `${score}/10`;

  if (score === 0) return { score, numeric, label: 'Keine Schmerzen', category: 'none' };
  if (score <= 3) return { score, numeric, label: 'Leicht', category: 'leicht' };
  if (score <= 6) return { score, numeric, label: 'Mittel', category: 'mittel' };
  if (score <= 8) return { score, numeric, label: 'Stark', category: 'stark' };
  return { score, numeric, label: 'Sehr stark', category: 'sehr_stark' };
}

export function convertNumericPainToCategory(level: string): "leicht" | "mittel" | "stark" | "sehr_stark" {
  // If already a category, return as-is
  if (['leicht', 'mittel', 'stark', 'sehr_stark'].includes(level)) {
    return level as "leicht" | "mittel" | "stark" | "sehr_stark";
  }
  
  // Convert numeric (0-10) to categories
  const num = parseInt(level);
  if (isNaN(num)) return "leicht"; // fallback
  
  if (num >= 8) return "sehr_stark";  // 8-10
  if (num >= 6) return "stark";       // 6-7
  if (num >= 3) return "mittel";      // 3-5
  return "leicht";                    // 0-2
}