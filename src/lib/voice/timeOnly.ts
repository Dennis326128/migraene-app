import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const TZ = 'Europe/Berlin';

// Tageszeiten → Default-Uhrzeiten
const PART_OF_DAY: Record<string, string> = {
  'morgens': '08:00',
  'vormittag': '10:00',
  'vormittags': '10:00',
  'mittag': '12:00',
  'mittags': '12:00',
  'nachmittag': '15:00',
  'nachmittags': '15:00',
  'abend': '20:00',
  'abends': '20:00',
  'nacht': '02:00',
  'nachts': '02:00'
};

/**
 * Rundet auf 15-Minuten-Intervalle
 */
function round15(d: Date): Date {
  const minutes = d.getMinutes();
  const rounded = Math.round(minutes / 15) * 15;
  d.setMinutes(rounded, 0, 0);
  return d;
}

/**
 * Parst Zeitangaben aus Voice-Eingabe → ISO-8601 UTC
 * 
 * Unterstützt:
 * - Relativ: "vor 2 Stunden", "vor 30 Minuten", "vor 1 Tag"
 * - Absolut: "um 14 Uhr", "14:30", "gestern Abend"
 * - Tageszeit: "morgens", "nachmittags", "abends"
 * 
 * @param text Voice-Transkript
 * @returns ISO-8601 UTC String (gerundet auf 15 Min.)
 */
export function parseOccurredAt(text: string): string {
  const lower = text.toLowerCase();
  const now = new Date();
  const berlinNow = toZonedTime(now, TZ);
  let base = new Date(berlinNow.getTime());

  // 1. Relative Zeitangaben: "vor X Minuten/Stunden/Tagen"
  const relativeMatch = lower.match(
    /\bvor\s+(\d+)\s*(min(?:ute)?(?:n)?|h|stunde(?:n)?|tag(?:e|en)?)\b/
  );
  
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    
    let milliseconds = 0;
    if (/min/i.test(unit)) {
      milliseconds = value * 60_000; // Minuten
    } else if (/h|stunde/i.test(unit)) {
      milliseconds = value * 3_600_000; // Stunden
    } else if (/tag/i.test(unit)) {
      milliseconds = value * 86_400_000; // Tage
    }
    
    base = new Date(berlinNow.getTime() - milliseconds);
    return fromZonedTime(round15(base), TZ).toISOString();
  }

  // 2. Gestern/Vorgestern
  if (/\bvorgestern\b/.test(lower)) {
    base.setDate(base.getDate() - 2);
  } else if (/\bgestern\b/.test(lower)) {
    base.setDate(base.getDate() - 1);
  }

  // 3. Exakte Uhrzeit: "14:30" oder "14:30 Uhr"
  const timeMatch = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    base.setHours(hour, minute, 0, 0);
    return fromZonedTime(round15(base), TZ).toISOString();
  }

  // 4. Nur Stunde: "um 14 Uhr" oder "14 Uhr"
  const hourMatch = lower.match(/\b(?:um\s*)?([01]?\d|2[0-3])\s*uhr\b/);
  if (hourMatch) {
    const hour = parseInt(hourMatch[1], 10);
    base.setHours(hour, 0, 0, 0);
    return fromZonedTime(round15(base), TZ).toISOString();
  }

  // 5. Tageszeit: "morgens", "nachmittags", etc.
  for (const [keyword, defaultTime] of Object.entries(PART_OF_DAY)) {
    if (lower.includes(keyword)) {
      const [h, m] = defaultTime.split(':').map(Number);
      base.setHours(h, m, 0, 0);
      return fromZonedTime(round15(base), TZ).toISOString();
    }
  }

  // 6. Fallback: JETZT (gerundet)
  return fromZonedTime(round15(base), TZ).toISOString();
}
