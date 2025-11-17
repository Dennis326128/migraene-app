/**
 * Tag-Extraktion aus Kontext-Notizen
 * Erkennt häufige Muster und konvertiert sie in strukturierte Tags
 */

export interface ExtractedTag {
  tag: string;
  category: 'mood' | 'sleep' | 'stress' | 'food' | 'activity' | 'wellbeing' | 'other';
  confidence: number;
}

// Kategorie-Muster mit Synonymen
const TAG_PATTERNS: Record<string, { category: ExtractedTag['category']; patterns: RegExp[] }> = {
  // Stimmung
  mood_good: {
    category: 'mood',
    patterns: [
      /\b(gut gelaunt|gute laune|fröhlich|glücklich|energiegeladen|motiviert|euphorisch)\b/gi,
    ]
  },
  mood_bad: {
    category: 'mood',
    patterns: [
      /\b(schlecht gelaunt|schlechte laune|niedergeschlagen|traurig|deprimiert|down)\b/gi,
    ]
  },
  mood_stressed: {
    category: 'mood',
    patterns: [
      /\b(gestresst|stress|angespannt|nervös|unruhig|überfordert)\b/gi,
    ]
  },
  mood_tired: {
    category: 'mood',
    patterns: [
      /\b(müde|erschöpft|kaputt|schlapp|kraftlos|ausgelaugt)\b/gi,
    ]
  },

  // Schlaf
  sleep_good: {
    category: 'sleep',
    patterns: [
      /\b(gut geschlafen|ausgeruht|erholsam geschlafen|durchgeschlafen)\b/gi,
    ]
  },
  sleep_bad: {
    category: 'sleep',
    patterns: [
      /\b(schlecht geschlafen|wenig geschlafen|kaum geschlafen|nicht geschlafen|schlaflos)\b/gi,
    ]
  },
  sleep_restless: {
    category: 'sleep',
    patterns: [
      /\b(unruhig geschlafen|oft aufgewacht|hin und her gewälzt)\b/gi,
    ]
  },

  // Stress
  stress_high: {
    category: 'stress',
    patterns: [
      /\b(viel stress|sehr stressig|hektisch|unter druck|deadline)\b/gi,
    ]
  },
  stress_low: {
    category: 'stress',
    patterns: [
      /\b(entspannt|ruhig|gelassen|stressfrei|ohne druck)\b/gi,
    ]
  },

  // Ernährung
  food_healthy: {
    category: 'food',
    patterns: [
      /\b(gesund gegessen|obst|gemüse|salat|vollkorn|ausgewogen)\b/gi,
    ]
  },
  food_unhealthy: {
    category: 'food',
    patterns: [
      /\b(fastfood|ungesund|pizza|burger|chips|süßigkeiten|schokolade)\b/gi,
    ]
  },
  food_hydration: {
    category: 'food',
    patterns: [
      /\b(viel getrunken|genug getrunken|viel wasser|ausreichend flüssigkeit)\b/gi,
    ]
  },
  food_dehydration: {
    category: 'food',
    patterns: [
      /\b(wenig getrunken|zu wenig getrunken|dehydriert|durstig)\b/gi,
    ]
  },
  food_irregular: {
    category: 'food',
    patterns: [
      /\b(wenig gegessen|nichts gegessen|mahlzeit ausgelassen|unregelmäßig)\b/gi,
    ]
  },

  // Aktivität
  activity_sport: {
    category: 'activity',
    patterns: [
      /\b(sport|training|joggen|laufen|fitnessstudio|yoga|schwimmen)\b/gi,
    ]
  },
  activity_walking: {
    category: 'activity',
    patterns: [
      /\b(spazieren|gelaufen|zu fuß|gewandert|unterwegs)\b/gi,
    ]
  },
  activity_sedentary: {
    category: 'activity',
    patterns: [
      /\b(sitzend|am schreibtisch|büro|viel gesessen|keine bewegung)\b/gi,
    ]
  },
  activity_active: {
    category: 'activity',
    patterns: [
      /\b(aktiv|viel bewegt|viel unterwegs|auf den beinen)\b/gi,
    ]
  },

  // Wohlbefinden
  wellbeing_good: {
    category: 'wellbeing',
    patterns: [
      /\b(fühle mich gut|geht mir gut|ausgeglichen|wohl|zufrieden)\b/gi,
    ]
  },
  wellbeing_bad: {
    category: 'wellbeing',
    patterns: [
      /\b(unwohl|nicht gut|schlecht gefühlt|mies)\b/gi,
    ]
  },
  wellbeing_tense: {
    category: 'wellbeing',
    patterns: [
      /\b(verspannt|nacken|schulter|rücken|verkrampft)\b/gi,
    ]
  },
};

// Tag-Labels für UI (ohne Prefix)
export const TAG_LABELS: Record<string, string> = {
  mood_good: 'Gut gelaunt',
  mood_bad: 'Schlecht gelaunt',
  mood_stressed: 'Gestresst',
  mood_tired: 'Müde',
  sleep_good: 'Gut geschlafen',
  sleep_bad: 'Schlecht geschlafen',
  sleep_restless: 'Unruhig geschlafen',
  stress_high: 'Viel Stress',
  stress_low: 'Entspannt',
  food_healthy: 'Gesund gegessen',
  food_unhealthy: 'Ungesund gegessen',
  food_hydration: 'Viel getrunken',
  food_dehydration: 'Wenig getrunken',
  food_irregular: 'Unregelmäßig gegessen',
  activity_sport: 'Sport',
  activity_walking: 'Spazieren',
  activity_sedentary: 'Sitzend',
  activity_active: 'Aktiv',
  wellbeing_good: 'Wohlfühlen',
  wellbeing_bad: 'Unwohl',
  wellbeing_tense: 'Verspannt',
};

/**
 * Extrahiert Tags aus einem Text
 */
export function extractTags(text: string): ExtractedTag[] {
  const found: ExtractedTag[] = [];
  const lowerText = text.toLowerCase();

  for (const [tagKey, { category, patterns }] of Object.entries(TAG_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = lowerText.match(pattern);
      if (matches && matches.length > 0) {
        // Konfidenz basierend auf Anzahl der Matches
        const confidence = Math.min(1.0, 0.6 + (matches.length * 0.2));
        
        found.push({
          tag: tagKey,
          category,
          confidence
        });
        break; // Nur einmal pro Tag
      }
    }
  }

  return found;
}

/**
 * Konvertiert Tag-Key zu lesbarem Label
 */
export function getTagLabel(tagKey: string): string {
  return TAG_LABELS[tagKey] || tagKey;
}

/**
 * Gruppiert Tags nach Kategorie
 */
export function groupTagsByCategory(tags: ExtractedTag[]): Record<string, ExtractedTag[]> {
  const grouped: Record<string, ExtractedTag[]> = {};
  
  for (const tag of tags) {
    if (!grouped[tag.category]) {
      grouped[tag.category] = [];
    }
    grouped[tag.category].push(tag);
  }
  
  return grouped;
}

/**
 * Extrahiert Hashtags aus Text (#Stress, #Müde, etc.)
 */
export function extractHashtags(text: string): string[] {
  const hashtagPattern = /#[\wäöüÄÖÜß-]+/g;
  const matches = text.match(hashtagPattern);
  return matches ? matches.map(tag => tag.toLowerCase()) : [];
}