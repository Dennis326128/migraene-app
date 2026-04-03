/**
 * voiceTimeParser.ts
 * Vollständiger Parser für deutsche Zeitausdrücke.
 * Erkennt relative, absolute und Tageszeit-basierte Ausdrücke.
 */

import {
  TIME_NUMBER_WORDS,
  HOUR_WORD_MAP,
  DAYTIME_MAP,
  WEEKDAY_MAP,
  NOW_WORDS,
} from './voiceGrammar';
import { normalizeText } from './voiceFuzzyMatcher';

// ============================================================
// === TYPEN ===
// ============================================================

export interface ParsedTime {
  date: string;         // YYYY-MM-DD
  time: string;         // HH:mm
  confidence: number;   // 0-1
  displayText: string;  // "vor 30 Minuten", "heute Morgen"
  isNow: boolean;
  isDefault: boolean;   // true wenn kein Zeitausdruck gefunden
  span: [number, number] | null; // Start/End-Index im Originaltext
}

// ============================================================
// === HILFSFUNKTIONEN ===
// ============================================================

/** Formatiert eine Zahl als zweistellige Zeichenkette (z.B. 7 → "07") */
function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

/** Wandelt ein Date-Objekt in YYYY-MM-DD */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Wandelt ein Date-Objekt in HH:mm */
function toTimeStr(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Subtrahiert Minuten von einem Datum und behandelt Mitternachts-Überlauf */
function subtractMinutes(now: Date, minutes: number): Date {
  const result = new Date(now.getTime() - minutes * 60 * 1000);
  return result;
}

/**
 * Parst ein Zahlwort oder eine Ziffer aus einem String.
 * @returns Zahl oder null wenn nicht erkennbar
 */
function parseNumberOrWord(token: string): number | null {
  const norm = normalizeText(token);

  // Ziffer direkt
  const num = parseInt(norm, 10);
  if (!isNaN(num)) return num;

  // Zahlwort-Lookup
  if (norm in TIME_NUMBER_WORDS) return TIME_NUMBER_WORDS[norm];

  return null;
}

/**
 * Erstellt ein Standard-Ergebnis für "jetzt"
 */
function makeNowResult(now: Date, displayText: string, span: [number, number] | null): ParsedTime {
  return {
    date: toDateStr(now),
    time: toTimeStr(now),
    confidence: 0.90,
    displayText,
    isNow: true,
    isDefault: false,
    span,
  };
}

/**
 * Erstellt ein Standard-Ergebnis (kein Zeitausdruck gefunden)
 */
function makeDefaultResult(now: Date): ParsedTime {
  return {
    date: toDateStr(now),
    time: toTimeStr(now),
    confidence: 0.50,
    displayText: 'jetzt',
    isNow: true,
    isDefault: true,
    span: null,
  };
}

// ============================================================
// === HAUPT-PARSER ===
// ============================================================

/**
 * Parst deutsche Zeitausdrücke aus einem Transkript.
 * Gibt das erste (am besten erkannte) Zeitobjekt zurück.
 *
 * @param text - Eingabetext (Sprach-Transkript)
 * @param now - Aktueller Zeitpunkt (default: Date.now())
 */
export function parseTimeExpression(text: string, now: Date = new Date()): ParsedTime {
  const norm = text.toLowerCase().trim();

  // ============================================================
  // 1. JETZT-WÖRTER
  // ============================================================
  for (const word of NOW_WORDS) {
    // Exakter Wort-Match (Wortgrenzen)
    const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
    const m = pattern.exec(norm);
    if (m) {
      return makeNowResult(now, word, [m.index, m.index + m[0].length]);
    }
  }

  // ============================================================
  // 2. RELATIVE AUSDRÜCKE: "vor X Minuten/Stunden"
  // ============================================================

  // "vor einer halben Stunde" = -30min
  {
    const pattern = /\bvor\s+(?:einer?\s+)?halben?\s+stunde\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const result = subtractMinutes(now, 30);
      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.95,
        displayText: 'vor einer halben Stunde',
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // "vor einer Viertelstunde" = -15min
  {
    const pattern = /\bvor\s+(?:einer?\s+)?viertelstunde\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const result = subtractMinutes(now, 15);
      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.95,
        displayText: 'vor einer Viertelstunde',
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // "vor anderthalb Stunden" / "vor eineinhalb Stunden" = -90min
  {
    const pattern = /\bvor\s+(?:anderthalb|eineinhalb|ein(?:\s+und\s+ein)?halb)\s+stunden?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const result = subtractMinutes(now, 90);
      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.95,
        displayText: 'vor anderthalb Stunden',
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // "vor X Stunden und Y Minuten"
  {
    const pattern = /\bvor\s+([\w]+)\s+stunden?\s+und\s+([\w]+)\s+minuten?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const hours = parseNumberOrWord(m[1]);
      const minutes = parseNumberOrWord(m[2]);
      if (hours !== null && minutes !== null) {
        const totalMin = hours * 60 + minutes;
        const result = subtractMinutes(now, totalMin);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.95,
          displayText: `vor ${hours} Stunden und ${minutes} Minuten`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // "vor einer Stunde" (= -60min)
  {
    const pattern = /\bvor\s+einer?\s+stunde\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const result = subtractMinutes(now, 60);
      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.95,
        displayText: 'vor einer Stunde',
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // "vor X Stunden" (Zahl oder Wort)
  {
    const pattern = /\bvor\s+([\w]+)\s+stunden?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const hours = parseNumberOrWord(m[1]);
      if (hours !== null && hours > 0 && hours <= 48) {
        const totalMin = hours * 60;
        const result = subtractMinutes(now, totalMin);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.95,
          displayText: `vor ${hours} Stunden`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // "vor X Minuten" (Zahl oder Wort)
  {
    const pattern = /\bvor\s+([\w]+)\s+minuten?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const minutes = parseNumberOrWord(m[1]);
      if (minutes !== null && minutes > 0 && minutes <= 300) {
        const result = subtractMinutes(now, minutes);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.95,
          displayText: `vor ${minutes} Minuten`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // ============================================================
  // 3. ABSOLUTE UHRZEITEN
  // ============================================================

  // "um 14:30", "um 14.30", "um 14,30"
  {
    const pattern = /\bum\s+(\d{1,2})[:.,](\d{2})\s*(?:uhr)?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const hour = parseInt(m[1], 10);
      const minute = parseInt(m[2], 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const result = new Date(now);
        result.setHours(hour, minute, 0, 0);
        // Wenn Zeit in der Zukunft liegt, Vortag
        if (result > now) result.setDate(result.getDate() - 1);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.97,
          displayText: `um ${pad2(hour)}:${pad2(minute)} Uhr`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // "um X Uhr Y" / "um X Uhr" (nummerisch)
  {
    const pattern = /\bum\s+(\d{1,2})\s+uhr\s*(\d{1,2})?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const hour = parseInt(m[1], 10);
      const minute = m[2] ? parseInt(m[2], 10) : 0;
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const result = new Date(now);
        result.setHours(hour, minute, 0, 0);
        if (result > now) result.setDate(result.getDate() - 1);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.97,
          displayText: `um ${pad2(hour)}:${pad2(minute)} Uhr`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // "8pm" → 20:00, "8am" → 08:00
  {
    const pattern = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
    const m = pattern.exec(norm);
    if (m) {
      let hour = parseInt(m[1], 10);
      const minute = m[2] ? parseInt(m[2], 10) : 0;
      const ampm = m[3].toLowerCase();
      if (ampm === 'pm' && hour !== 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const result = new Date(now);
        result.setHours(hour, minute, 0, 0);
        if (result > now) result.setDate(result.getDate() - 1);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.96,
          displayText: `${pad2(hour)}:${pad2(minute)} Uhr`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // "gegen X Uhr" / "gegen X"
  {
    const pattern = /\bgegen\s+(\d{1,2})\s*(?:uhr)?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const hour = parseInt(m[1], 10);
      if (hour >= 0 && hour <= 23) {
        const result = new Date(now);
        result.setHours(hour, 0, 0, 0);
        if (result > now) result.setDate(result.getDate() - 1);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.88,
          displayText: `gegen ${hour} Uhr`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // Reine Uhrzeit: "8:30", "08:30"
  {
    const pattern = /\b(\d{1,2}):(\d{2})\b/;
    const m = pattern.exec(norm);
    if (m) {
      const hour = parseInt(m[1], 10);
      const minute = parseInt(m[2], 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const result = new Date(now);
        result.setHours(hour, minute, 0, 0);
        if (result > now) result.setDate(result.getDate() - 1);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.90,
          displayText: `${pad2(hour)}:${pad2(minute)} Uhr`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // ============================================================
  // 4. DEUTSCHE UHRZEITFORMELN
  // ============================================================

  // "halb X" → Deutsche Logik: halb 3 = 02:30
  // Mit Kontext-Heuristik: "nachmittags" → 14:30
  {
    const pattern = /\bhalb\s+([\w]+)(?:\s+(nachmittags?|abends?|morgens?|mittags?|nachts?))?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      // Guard: "halb" im Medikamenten-Kontext (halbe Tablette) → nicht als Zeit parsen
      const context = norm.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20);
      const medContext = /tablette|pille|kapsel|sprüh|hub/i.test(context);
      if (!medContext) {
        const hourWord = m[1];
        let hour = parseNumberOrWord(hourWord) ?? (HOUR_WORD_MAP[normalizeText(hourWord)] ?? null);
        const qualifier = (m[2] ?? '').toLowerCase();

        if (hour !== null && hour >= 1 && hour <= 12) {
          // Deutsche Logik: "halb X" = (X-1):30
          const baseHour = hour - 1;
          let resolvedHour = baseHour;

          // PM-Kontext
          if (/nachmittag|abend/.test(qualifier) && baseHour < 12) {
            resolvedHour = baseHour + 12;
          } else if (/morgen|früh/.test(qualifier) && baseHour >= 12) {
            resolvedHour = baseHour - 12;
          }

          // Heuristik: Wenn keine Qualifier, dann nächste plausible Zeit relativ zu now
          if (!qualifier) {
            // Beide Kandidaten: AM und PM
            const candidateAM = baseHour;
            const candidatePM = baseHour + 12;
            const nowHour = now.getHours();
            // Bevorzuge nächste vergangene Zeit
            if (nowHour >= candidatePM) {
              resolvedHour = candidatePM;
            } else if (nowHour >= candidateAM) {
              resolvedHour = candidateAM;
            } else {
              // Beide in der Zukunft → gestern PM
              resolvedHour = candidatePM;
            }
          }

          const result = new Date(now);
          result.setHours(resolvedHour, 30, 0, 0);
          if (result > now) result.setDate(result.getDate() - 1);

          return {
            date: toDateStr(result),
            time: toTimeStr(result),
            confidence: qualifier ? 0.92 : 0.80,
            displayText: `halb ${hourWord}`,
            isNow: false,
            isDefault: false,
            span: [m.index, m.index + m[0].length],
          };
        }
      }
    }
  }

  // "viertel nach X" → X:15
  {
    const pattern = /\bviertel\s+nach\s+([\w]+)\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const hourToken = m[1];
      const hour = parseNumberOrWord(hourToken) ?? (HOUR_WORD_MAP[normalizeText(hourToken)] ?? null);
      if (hour !== null && hour >= 0 && hour <= 23) {
        const result = new Date(now);
        result.setHours(hour, 15, 0, 0);
        if (result > now) result.setDate(result.getDate() - 1);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.92,
          displayText: `viertel nach ${hourToken}`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // "viertel vor X" → (X-1):45
  {
    const pattern = /\bviertel\s+vor\s+([\w]+)\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const hourToken = m[1];
      const hour = parseNumberOrWord(hourToken) ?? (HOUR_WORD_MAP[normalizeText(hourToken)] ?? null);
      if (hour !== null && hour >= 1 && hour <= 24) {
        const resolvedHour = (hour - 1 + 24) % 24;
        const result = new Date(now);
        result.setHours(resolvedHour, 45, 0, 0);
        if (result > now) result.setDate(result.getDate() - 1);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.92,
          displayText: `viertel vor ${hourToken}`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // "X vor Y" (z.B. "fünf vor zwölf" → 11:55)
  {
    const pattern = /\b([\w]+)\s+vor\s+([\w]+)(?:\s+uhr)?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      // Guard: kein "vor X Minuten/Stunden"
      if (!/minuten?|stunden?/.test(m[2])) {
        const minToken = m[1];
        const hourToken = m[2];
        const mins = parseNumberOrWord(minToken);
        const hour = parseNumberOrWord(hourToken) ?? (HOUR_WORD_MAP[normalizeText(hourToken)] ?? null);
        if (mins !== null && hour !== null && mins > 0 && mins < 60 && hour >= 1 && hour <= 24) {
          const resolvedHour = (hour - 1 + 24) % 24;
          const resolvedMin = 60 - mins;
          const result = new Date(now);
          result.setHours(resolvedHour, resolvedMin, 0, 0);
          if (result > now) result.setDate(result.getDate() - 1);
          return {
            date: toDateStr(result),
            time: toTimeStr(result),
            confidence: 0.88,
            displayText: `${minToken} vor ${hourToken}`,
            isNow: false,
            isDefault: false,
            span: [m.index, m.index + m[0].length],
          };
        }
      }
    }
  }

  // "X nach Y" (z.B. "zehn nach drei" → 03:10)
  {
    const pattern = /\b([\w]+)\s+nach\s+([\w]+)(?:\s+uhr)?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const minToken = m[1];
      const hourToken = m[2];
      const mins = parseNumberOrWord(minToken);
      const hour = parseNumberOrWord(hourToken) ?? (HOUR_WORD_MAP[normalizeText(hourToken)] ?? null);
      if (mins !== null && hour !== null && mins > 0 && mins < 60 && hour >= 0 && hour <= 23) {
        const result = new Date(now);
        result.setHours(hour, mins, 0, 0);
        if (result > now) result.setDate(result.getDate() - 1);
        return {
          date: toDateStr(result),
          time: toTimeStr(result),
          confidence: 0.88,
          displayText: `${minToken} nach ${hourToken}`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // ============================================================
  // 5. TAGESZEITEN
  // ============================================================

  // "vorgestern" = Datum -2
  {
    const pattern = /\bvorgestern\b(?:\s+(morgen|früh|vormittag|mittag|nachmittag|abend|nacht))?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const qualifier = (m[1] ?? 'morgen').toLowerCase();
      const daytime = DAYTIME_MAP[qualifier] ?? DAYTIME_MAP['morgen'];
      const result = new Date(now);
      result.setDate(result.getDate() - 2);
      result.setHours(daytime.hour, daytime.minute, 0, 0);
      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.80,
        displayText: `vorgestern ${qualifier}`,
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // "letzte Nacht" → gestern 02:00
  {
    const pattern = /\bletzte[rn]?\s+nacht\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const result = new Date(now);
      result.setDate(result.getDate() - 1);
      result.setHours(2, 0, 0, 0);
      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.85,
        displayText: 'letzte Nacht',
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // "in der Nacht" → 02:00 (Vortag wenn aktuelle Zeit < 06:00, sonst heute Nacht)
  {
    const pattern = /\bin\s+der\s+nacht\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const result = new Date(now);
      result.setHours(2, 0, 0, 0);
      if (now.getHours() >= 6) {
        // Meint letzte Nacht
        result.setDate(result.getDate() - 1);
      }
      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.78,
        displayText: 'in der Nacht',
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // "gestern [Tageszeit]" / "gestern"
  {
    const pattern = /\bgestern\b(?:\s+(morgen|früh|frühmorgens|vormittag|mittag|nachmittag|abend|nacht|nachts))?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const qualifier = (m[1] ?? 'abend').toLowerCase();
      const daytime = DAYTIME_MAP[qualifier] ?? DAYTIME_MAP['abend'];
      const result = new Date(now);
      result.setDate(result.getDate() - 1);
      result.setHours(daytime.hour, daytime.minute, 0, 0);
      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.82,
        displayText: `gestern ${qualifier}`,
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // "heute [Tageszeit]"
  {
    const pattern = /\bheute\b(?:\s+(morgen|früh|frühmorgens|vormittag|mittag|nachmittag|abend|nacht|nachts))?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const qualifier = (m[1] ?? '').toLowerCase().trim();
      if (qualifier) {
        const daytime = DAYTIME_MAP[qualifier];
        if (daytime) {
          const result = new Date(now);
          result.setHours(daytime.hour, daytime.minute, 0, 0);
          return {
            date: toDateStr(result),
            time: toTimeStr(result),
            confidence: 0.78,
            displayText: `heute ${qualifier}`,
            isNow: false,
            isDefault: false,
            span: [m.index, m.index + m[0].length],
          };
        }
      }
    }
  }

  // Nur Tageszeiten (ohne "heute/gestern")
  for (const [key, daytime] of Object.entries(DAYTIME_MAP)) {
    if (key.includes(' ')) continue; // Multi-Wort-Keys bereits oben behandelt
    const pattern = new RegExp(`\\b${escapeRegex(key)}\\b`, 'i');
    const m = pattern.exec(norm);
    if (m) {
      // Guard: Nicht als Teil einer anderen Phrase
      const contextBefore = norm.slice(Math.max(0, m.index - 10), m.index);
      if (/gestern|heute|vorgestern/.test(contextBefore)) continue;

      const result = new Date(now);
      result.setHours(daytime.hour, daytime.minute, 0, 0);
      // Wenn in der Zukunft → gestern
      if (result > now) result.setDate(result.getDate() - 1);
      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.75,
        displayText: key,
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // ============================================================
  // 6. WOCHENTAGE
  // ============================================================
  for (const [dayName, dayOfWeek] of Object.entries(WEEKDAY_MAP)) {
    if (dayName.length < 3) continue; // Abkürzungen überspringen
    const pattern = new RegExp(`\\b${escapeRegex(dayName)}\\b(?:\\s+(morgen|früh|mittag|nachmittag|abend|nacht))?`, 'i');
    const m = pattern.exec(norm);
    if (m) {
      const qualifier = (m[1] ?? 'morgen').toLowerCase();
      const daytime = DAYTIME_MAP[qualifier] ?? DAYTIME_MAP['morgen'];

      // Letzten Vorkommen dieses Wochentags berechnen
      const result = new Date(now);
      const currentDay = result.getDay();
      let diff = currentDay - dayOfWeek;
      if (diff <= 0) diff += 7; // Sicherstellen: Vergangenheit
      result.setDate(result.getDate() - diff);
      result.setHours(daytime.hour, daytime.minute, 0, 0);

      return {
        date: toDateStr(result),
        time: toTimeStr(result),
        confidence: 0.75,
        displayText: `${dayName} ${qualifier}`,
        isNow: false,
        isDefault: false,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // ============================================================
  // 7. DATUM: "12.03.", "12.03.2026", "12.3."
  // ============================================================
  {
    const pattern = /\b(\d{1,2})[.](\d{1,2})[.](\d{4})?\b/;
    const m = pattern.exec(norm);
    if (m) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const result = new Date(year, month, day, now.getHours(), now.getMinutes(), 0, 0);
        return {
          date: toDateStr(result),
          time: toTimeStr(now),
          confidence: 0.88,
          displayText: `${pad2(day)}.${pad2(month + 1)}.${year}`,
          isNow: false,
          isDefault: false,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // ============================================================
  // 8. FALLBACK: Kein Zeitausdruck gefunden
  // ============================================================
  return makeDefaultResult(now);
}

// ============================================================
// === HILFSFUNKTION: REGEX ESCAPE ===
// ============================================================

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// === ALLE SPANS IM TEXT FINDEN ===
// ============================================================

/**
 * Gibt den Span des gefundenen Zeitausdrucks zurück,
 * oder null wenn kein Ausdruck gefunden wurde.
 */
export function getTimeSpan(
  text: string,
  now: Date = new Date()
): [number, number] | null {
  const parsed = parseTimeExpression(text, now);
  return parsed.span;
}
