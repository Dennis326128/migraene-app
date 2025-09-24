export function formatPainLevel(text: string) {
  return (text || "").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function mapTextLevelToScore(level: string): number {
  const t = (level || "").toLowerCase();
  if (t.includes("sehr") && t.includes("stark")) return 9;
  if (t.includes("stark")) return 7;
  if (t.includes("mittel")) return 5;
  if (t.includes("leicht")) return 2;
  return 0;
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
    "schlaefe": "Schläfenbereich"
  };
  return locationLabels[location] || location;
}