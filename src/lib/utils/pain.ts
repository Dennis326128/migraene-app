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

export function normalizePainLevel(level: string | number): number {
  if (typeof level === 'number') return Math.max(0, Math.min(10, level));
  return mapTextLevelToScore(level);
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