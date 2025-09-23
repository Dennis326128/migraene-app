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