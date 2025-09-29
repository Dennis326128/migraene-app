import { berlinDateToday } from "@/lib/tz";

export interface ParsedVoiceEntry {
  selectedDate: string;
  selectedTime: string;
  painLevel: string;
  medications: string[];
  notes: string;
  isNow: boolean;
  confidence: {
    time: 'high' | 'medium' | 'low';
    pain: 'high' | 'medium' | 'low';
    meds: 'high' | 'medium' | 'low';
  };
  medicationEffect?: {
    rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good';
    medName?: string;
    sideEffects?: string[];
    confidence: 'high' | 'medium' | 'low';
  };
}

// Number words to digits mapping for German
const NUMBER_WORDS: Record<string, string> = {
  'null': '0',
  'eins': '1',
  'zwei': '2', 
  'drei': '3',
  'vier': '4',
  'fünf': '5',
  'sechs': '6',
  'sieben': '7',
  'acht': '8',
  'neun': '9',
  'zehn': '10'
};

// Time phrases for robust parsing
const TIME_PHRASES: Record<string, { hours?: number; minutes?: number; relative?: boolean }> = {
  'viertel nach': { minutes: 15, relative: true },
  'halb': { minutes: 30, relative: true },
  'viertel vor': { minutes: -15, relative: true },
  'drei viertel': { minutes: 45, relative: true },
  'heute morgen': { hours: 7, minutes: 0 },
  'heute mittag': { hours: 12, minutes: 0 },
  'heute abend': { hours: 20, minutes: 0 },
  'gestern morgen': { hours: 7, minutes: 0, relative: true },
  'gestern abend': { hours: 20, minutes: 0, relative: true }
};

// Convert number words to digits in text
export function convertNumberWords(text: string): string {
  let result = text;
  
  // Convert written numbers to digits
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, digit);
  }
  
  // Handle "X von zehn" patterns
  result = result.replace(/(\d+)\s+von\s+zehn/gi, '$1');
  
  return result;
}

// German pain level mapping
const PAIN_LEVEL_PATTERNS = [
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(10|zehn)/i, level: "sehr_stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(9|neun)/i, level: "sehr_stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(8|acht)/i, level: "sehr_stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(7|sieben)/i, level: "stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(6|sechs)/i, level: "stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(5|fünf)/i, level: "mittel" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(4|vier)/i, level: "mittel" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(3|drei)/i, level: "leicht" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(2|zwei)/i, level: "leicht" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(1|eins)/i, level: "leicht" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(0|null|kein)/i, level: "leicht" },
  
  // Alternative patterns with numbers first
  { pattern: /(10|zehn).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "sehr_stark" },
  { pattern: /(9|neun).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "sehr_stark" },
  { pattern: /(8|acht).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "sehr_stark" },
  { pattern: /(7|sieben).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "stark" },
  { pattern: /(6|sechs).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "stark" },
  { pattern: /(5|fünf).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "mittel" },
  { pattern: /(4|vier).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "mittel" },
  { pattern: /(3|drei).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "leicht" },
  { pattern: /(2|zwei).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "leicht" },
  { pattern: /(1|eins).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "leicht" },

  // Intensity words
  { pattern: /(sehr starke?|unerträglich|extremer?|heftige?).{0,30}(schmerz|migräne|kopfschmerz)/i, level: "sehr_stark" },
  { pattern: /(starke?|schwere?|massive?).{0,30}(schmerz|migräne|kopfschmerz)/i, level: "stark" },
  { pattern: /(mittlere?|mäßige?|normale?).{0,30}(schmerz|migräne|kopfschmerz)/i, level: "mittel" },
  { pattern: /(leichte?|schwache?|geringe?).{0,30}(schmerz|migräne|kopfschmerz)/i, level: "leicht" },
];

// Generate dynamic medication patterns from user's saved medications
export function generateUserMedicationPatterns(userMeds: Array<{ name: string }> = []): Array<{ name: string; pattern: RegExp; noDosage?: boolean }> {
  const patterns: Array<{ name: string; pattern: RegExp; noDosage?: boolean }> = [];
  
  console.log('🧬 Generating dynamic patterns for medications:', userMeds.map(m => m.name));
  
  userMeds.forEach(med => {
    const medName = med.name.toLowerCase();
    const medWords = medName.split(/\s+/);
    const primaryName = medWords[0]; // First word (e.g., "sumatriptan" from "Sumatriptan 100mg")
    
    // Extract dosage if present
    const dosageMatch = medName.match(/(\d+)\s*mg/);
    const dosage = dosageMatch ? dosageMatch[1] : null;
    
    // Generate abbreviations
    const abbreviations = [];
    if (medName.includes('sumatriptan')) abbreviations.push('suma');
    if (medName.includes('ibuprofen')) abbreviations.push('ibu');
    if (medName.includes('aspirin')) abbreviations.push('ass');
    if (medName.includes('paracetamol')) abbreviations.push('para');
    if (medName.includes('rizatriptan')) abbreviations.push('riza');
    if (medName.includes('almotriptan')) abbreviations.push('almo');
    if (medName.includes('naratriptan')) abbreviations.push('nara');
    
    // Build pattern variants
    const nameVariants = [primaryName, ...abbreviations];
    const namePattern = nameVariants.join('|');
    
    // Pattern 1: With flexible dosage
    if (dosage) {
      const dosageVariants = [
        dosage, // exact number
        dosage.replace(/(\d)00$/, '$1 hundert'), // 800 -> 8 hundert
        dosage.replace(/(\d)00$/, '$1hundert') // 800 -> 8hundert
      ];
      const dosagePattern = dosageVariants.join('|');
      
      const withDosagePattern = new RegExp(
        `\\b(${namePattern})(?:\\s*(?:${dosagePattern})\\s*(?:mg|milligramm)?)?(?:\\s*(?:tablette|kapsel|genommen|eingenommen))?\\b`,
        'i'
      );
      patterns.push({ name: med.name, pattern: withDosagePattern });
    }
    
    // Pattern 2: Without dosage requirement
    const noDosagePattern = new RegExp(
      `\\b(${namePattern})(?:\\s*(?:tablette|kapsel|genommen|eingenommen))?\\b`,
      'i'
    );
    patterns.push({ name: med.name, pattern: noDosagePattern, noDosage: true });
  });
  
  console.log('🧬 Generated patterns:', patterns.map(p => ({ name: p.name, pattern: p.pattern.source })));
  return patterns;
}

// Fallback patterns for common medications (when no user meds available)
const FALLBACK_MEDICATION_PATTERNS = [
  { name: "Sumatriptan", pattern: /(sumatriptan|suma).{0,20}(\d{1,3})/i },
  { name: "Ibuprofen", pattern: /(ibuprofen|ibu).{0,20}(\d{1,4})/i },
  { name: "Aspirin", pattern: /(aspirin|ass).{0,20}(\d{1,4})/i },
  { name: "Paracetamol", pattern: /(paracetamol|para).{0,20}(\d{1,4})/i },
  { name: "Sumatriptan", pattern: /\b(sumatriptan|suma)\s*(tablette|kapsel)?\b/i, noDosage: true },
  { name: "Ibuprofen", pattern: /\b(ibuprofen|ibu)\s*(tablette|kapsel)?\b/i, noDosage: true },
];

// Time patterns for German voice input  
const TIME_PATTERNS = [
  // Relative time patterns
  { pattern: /vor\s+(\d+|einer?|zwei|drei|vier|fünf|sechs)\s+(minute|minuten)/i, type: 'relative_minutes' },
  { pattern: /vor\s+(\d+|einer?|zwei|drei|vier|fünf|sechs)\s+(stunde|stunden)/i, type: 'relative_hours' },
  
  // Specific times
  { pattern: /(\d{1,2}):(\d{2})/i, type: 'time' },
  { pattern: /(\d{1,2})\s+uhr/i, type: 'hour' },
  { pattern: /(halb|viertel nach|viertel vor|drei viertel)\s+(\d+)/i, type: 'quarter' },
  
  // Day references
  { pattern: /(heute|gestern|vorgestern)/i, type: 'day' },
  { pattern: /(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/i, type: 'weekday' },
  
  // "Now" indicators
  { pattern: /(jetzt|gerade|sofort|eben)/i, type: 'now' }
];

function parseTime(text: string) {
  const now = new Date();
  const today = berlinDateToday();
  
  // Check for "now" indicators first
  for (const timePattern of TIME_PATTERNS) {
    if (timePattern.type === 'now') {
      const match = text.match(timePattern.pattern);
      if (match) {
        console.log('🕒 Time parsed as "now"');
        return { 
          date: today, 
          time: now.toTimeString().slice(0, 5), // Set current time
          isNow: true 
        };
      }
    }
  }
  
  // Try to parse relative time (vor X Minuten/Stunden)
  for (const timePattern of TIME_PATTERNS) {
    const match = text.match(timePattern.pattern);
    if (!match) continue;
    
    if (timePattern.type === 'relative_minutes') {
      const minutesStr = match[1];
      let minutes = parseInt(minutesStr) || convertWordToNumber(minutesStr) || 0;
      
      const targetTime = new Date(now.getTime() - minutes * 60 * 1000);
      const targetDate = targetTime.toISOString().split('T')[0];
      const targetTimeStr = targetTime.toTimeString().slice(0, 5);
      
      console.log(`🕒 Time parsed: ${minutes} minutes ago -> ${targetDate} ${targetTimeStr}`);
      return { 
        date: targetDate, 
        time: targetTimeStr,
        isNow: false 
      };
    }
    
    if (timePattern.type === 'relative_hours') {
      const hoursStr = match[1];
      let hours = parseInt(hoursStr) || convertWordToNumber(hoursStr) || 0;
      
      const targetTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const targetDate = targetTime.toISOString().split('T')[0];
      const targetTimeStr = targetTime.toTimeString().slice(0, 5);
      
      console.log(`🕒 Time parsed: ${hours} hours ago -> ${targetDate} ${targetTimeStr}`);
      return { 
        date: targetDate, 
        time: targetTimeStr,
        isNow: false 
      };
    }
    
    if (timePattern.type === 'time') {
      const hours = match[1];
      const minutes = match[2];
      const timeStr = `${hours.padStart(2, '0')}:${minutes}`;
      
      console.log(`🕒 Time parsed: specific time -> ${today} ${timeStr}`);
      return { 
        date: today, 
        time: timeStr,
        isNow: false 
      };
    }
    
    if (timePattern.type === 'day') {
      const dayRef = match[1].toLowerCase();
      let targetDate = today;
      
      if (dayRef === 'gestern') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        targetDate = yesterday.toISOString().split('T')[0];
      }
      
      console.log(`🕒 Time parsed: day reference -> ${targetDate}`);
      return { 
        date: targetDate, 
        time: now.toTimeString().slice(0, 5), // Set current time as default
        isNow: false 
      };
    }
  }
  
  // If no specific time found, assume "now"
  console.log('🕒 No specific time found, defaulting to "now"');
  return { 
    date: today, 
    time: now.toTimeString().slice(0, 5), // Always provide current time
    isNow: true 
  };
}

function convertWordToNumber(word: string): number {
  const wordNumbers: { [key: string]: number } = {
    'einer': 1, 'eine': 1, 'ein': 1,
    'zwei': 2,
    'drei': 3,
    'vier': 4,
    'fünf': 5,
    'sechs': 6
  };
  
  return wordNumbers[word.toLowerCase()] || 0;
}

function parsePainLevel(text: string): string {
  console.log(`🎯 [parsePainLevel] Input text: "${text}"`);
  
  // Step 1: Convert number words to digits first
  const convertedText = convertNumberWords(text);
  console.log(`🎯 [parsePainLevel] After number conversion: "${convertedText}"`);
  
  // Step 2: Look for direct numbers 0-10 (highest priority) - RETURN NUMERIC
  const directNumberMatch = convertedText.match(/\b([0-9]|10)\b/);
  if (directNumberMatch) {
    const level = parseInt(directNumberMatch[1]);
    if (level >= 0 && level <= 10) {
      console.log(`🎯 [parsePainLevel] Found direct number: ${level} -> HIGH confidence`);
      return level.toString(); // Return numeric value directly
    }
  }
  
  // Step 3: Try explicit numeric patterns with context - RETURN NUMERIC
  const numericMatch = convertedText.match(/\b(\d+)\s*(?:\/10|von\s*10|out\s*of\s*10)?\b/);
  if (numericMatch) {
    const level = parseInt(numericMatch[1]);
    if (level >= 0 && level <= 10) {
      console.log(`🎯 [parsePainLevel] Found contextual number: ${level} -> HIGH confidence`);
      return level.toString(); // Return numeric value directly
    }
  }
  
  // Step 4: Check number words first - RETURN NUMERIC
  const numberWordMatch = text.match(/\b(null|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)\b/i);
  if (numberWordMatch) {
    const word = numberWordMatch[1].toLowerCase();
    const numberMap: Record<string, number> = {
      'null': 0, 'eins': 1, 'zwei': 2, 'drei': 3, 'vier': 4, 'fünf': 5,
      'sechs': 6, 'sieben': 7, 'acht': 8, 'neun': 9, 'zehn': 10
    };
    if (numberMap[word] !== undefined) {
      console.log(`🎯 [parsePainLevel] Found number word: "${word}" = ${numberMap[word]} -> HIGH confidence`);
      return numberMap[word].toString(); // Return numeric value directly
    }
  }
  
  // Step 5: Fall back to category patterns (only if no numbers found)
  for (const painPattern of PAIN_LEVEL_PATTERNS) {
    if (painPattern.pattern.test(convertedText)) {
      console.log(`🎯 [parsePainLevel] Found category match: ${painPattern.level} -> MEDIUM confidence`);
      return painPattern.level; // Keep category for backward compatibility
    }
  }
  
  console.log('🎯 [parsePainLevel] No pain level found');
  return '';
}

function parseMedicationEffect(text: string): { rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good'; confidence: 'high' | 'medium' | 'low' } {
  const effectPatterns = [
    { pattern: /(gar nicht|überhaupt nicht|null|keine wirkung)/i, rating: 'none' as const },
    { pattern: /(schlecht|kaum|wenig|schwach)/i, rating: 'poor' as const },
    { pattern: /(mittel|ok|okay|mittelgut|etwas|teilweise)/i, rating: 'moderate' as const },
    { pattern: /(gut|besser|geholfen|wirksam)/i, rating: 'good' as const },
    { pattern: /(sehr gut|ausgezeichnet|perfekt|super|toll)/i, rating: 'very_good' as const },
  ];

  // Check for medication effect context
  const hasEffectContext = /(wirkung|gewirkt|geholfen|tablette|medikament)/i.test(text);
  
  for (const effectPattern of effectPatterns) {
    if (effectPattern.pattern.test(text)) {
      console.log(`💊 Medication effect parsed: ${effectPattern.rating}`);
      return {
        rating: effectPattern.rating,
        confidence: hasEffectContext ? 'high' : 'medium'
      };
    }
  }
  
  return undefined;
}

function parseMedications(text: string, userMeds: Array<{ name: string }> = []): string[] {
  const medications: string[] = [];
  
  console.log(`💊 [parseMedications] Input text: "${text}"`);
  console.log(`💊 [parseMedications] User medications:`, userMeds.map(m => m.name));
  
  // Use dynamic patterns if user medications are available
  const patterns = userMeds.length > 0 
    ? generateUserMedicationPatterns(userMeds)
    : FALLBACK_MEDICATION_PATTERNS;
  
  for (const medPattern of patterns) {
    const match = text.match(medPattern.pattern);
    
    if (match) {
      let medName: string;
      
      if (medPattern.noDosage) {
        // Use the exact saved medication name
        medName = medPattern.name;
        console.log(`💊 [parseMedications] Found medication without dosage: "${medName}" from pattern: ${medPattern.pattern.source}`);
      } else {
        // Try to preserve original name with dosage
        medName = medPattern.name;
        console.log(`💊 [parseMedications] Found medication with dosage: "${medName}" from pattern: ${medPattern.pattern.source}`);
      }
      
      // Avoid duplicates
      if (!medications.includes(medName)) {
        medications.push(medName);
      }
    }
  }
  
  console.log(`💊 [parseMedications] Final result:`, medications);
  return medications;
}

function extractNotes(text: string, parsedTime: any, parsedPain: string, parsedMeds: string[], userMeds: Array<{ name: string }> = []): string {
  let cleanedText = text;
  
  // Remove recognized time expressions
  for (const timePattern of TIME_PATTERNS) {
    cleanedText = cleanedText.replace(timePattern.pattern, '');
  }
  
  // Remove recognized pain expressions  
  for (const painPattern of PAIN_LEVEL_PATTERNS) {
    cleanedText = cleanedText.replace(painPattern.pattern, '');
  }
  
  // Remove recognized medications using dynamic patterns
  const patterns = userMeds.length > 0 
    ? generateUserMedicationPatterns(userMeds)
    : FALLBACK_MEDICATION_PATTERNS;
    
  for (const medPattern of patterns) {
    cleanedText = cleanedText.replace(medPattern.pattern, '');
  }
  
  // Clean up extra whitespace and punctuation
  cleanedText = cleanedText
    .replace(/\s+/g, ' ')
    .replace(/^\s*[,.\-:;]\s*/, '')
    .trim();
    
  return cleanedText;
}

// Determine confidence levels for parsed data
function calculateConfidence(text: string, parsedTime: any, parsedPain: string, parsedMeds: string[]): ParsedVoiceEntry['confidence'] {
  const normalizedText = convertNumberWords(text.toLowerCase());
  
  // Time confidence - if isNow=true, it's always high confidence
  let timeConfidence: 'high' | 'medium' | 'low' = 'low';
  if (parsedTime.isNow) {
    timeConfidence = 'high'; // "now" is explicit and clear
    console.log(`[Confidence] Time is "now" -> HIGH confidence`);
  } else if (parsedTime.time && parsedTime.time !== '') {
    timeConfidence = 'high'; // Explicit time mentioned
    console.log(`[Confidence] Explicit time "${parsedTime.time}" -> HIGH confidence`);
  } else {
    console.log(`[Confidence] No clear time -> LOW confidence`);
  }
  
  // Pain confidence - treat "0" as valid (no pain)
  let painConfidence: 'high' | 'medium' | 'low' = 'low';
  if (parsedPain && parsedPain !== '' && parsedPain !== '-') {
    // Direct numbers (0-10) get high confidence - "0" is valid!
    const isDirectNumber = /^[0-9]|10$/.test(parsedPain);
    // Check if original text contained number words (including "null" for 0)
    const hasNumberWords = /\b(null|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)\b/i.test(normalizedText);
    // Check for category patterns
    const hasCategoryPattern = /\b(leicht|mittel|stark|sehr.*stark)\b/i.test(parsedPain);
    
    if (isDirectNumber || hasNumberWords) {
      console.log(`[Confidence] Pain level "${parsedPain}" is direct number/word (0=no pain) -> HIGH confidence`);
      painConfidence = 'high';
    } else if (hasCategoryPattern) {
      console.log(`[Confidence] Pain level "${parsedPain}" is category pattern -> HIGH confidence`);
      painConfidence = 'high';
    } else {
      console.log(`[Confidence] Pain level "${parsedPain}" -> MEDIUM confidence`);
      painConfidence = 'medium';
    }
  } else {
    console.log(`[Confidence] No pain level found or invalid: "${parsedPain}" -> LOW confidence`);
  }
  
  // Medication confidence - always high (optional field)
  let medsConfidence: 'high' | 'medium' | 'low' = 'high';
  if (parsedMeds.length > 0) {
    const hasExplicitMeds = /\b(genommen|eingenommen|tablette|medikament|mg|gramm)\b/i.test(normalizedText);
    medsConfidence = hasExplicitMeds ? 'high' : 'medium';
    console.log(`[Confidence] Medications found -> ${medsConfidence} confidence`);
  } else {
    console.log(`[Confidence] No medications mentioned -> HIGH confidence (optional)`);
  }
  
  const result = { time: timeConfidence, pain: painConfidence, meds: medsConfidence };
  console.log(`[Confidence] Final calculated:`, result);
  return result;
}

// Check which required fields are missing for slot-filling
export function getMissingSlots(entry: ParsedVoiceEntry): ('time' | 'pain' | 'meds')[] {
  const missing: ('time' | 'pain' | 'meds')[] = [];
  
  console.log(`[getMissingSlots] Analyzing entry:`, {
    painLevel: entry.painLevel,
    isNow: entry.isNow,
    selectedDate: entry.selectedDate,
    selectedTime: entry.selectedTime,
    medications: entry.medications,
    confidence: entry.confidence
  });
  
  // Time is NEVER missing if isNow=true (this is the key fix!)
  if (!entry.isNow && (!entry.selectedDate || !entry.selectedTime)) {
    console.log(`[getMissingSlots] Time marked as missing - not isNow and missing date/time`);
    missing.push('time');
  } else {
    console.log(`[getMissingSlots] Time is OK - isNow=${entry.isNow}, date=${entry.selectedDate}, time=${entry.selectedTime}`);
  }
  
  // Pain is missing only if completely empty (but "0" = no pain is VALID!)
  if (!entry.painLevel || entry.painLevel === '' || entry.painLevel === '-') {
    console.log(`[getMissingSlots] Pain marked as missing - truly empty: "${entry.painLevel}"`);
    missing.push('pain');
  } else {
    console.log(`[getMissingSlots] Pain is VALID (including "0" = no pain): "${entry.painLevel}"`);
  }
  
  // Meds are completely optional - never mark as missing unless explicitly requested
  // (Remove automatic medication slot filling to avoid unnecessary delays)
  
  console.log(`[getMissingSlots] Final missing slots:`, missing);
  return missing;
}

export function parseGermanVoiceEntry(text: string, userMeds: Array<{ name: string }> = []): ParsedVoiceEntry {
  console.log('🎯 Parsing voice entry:', text);
  
  // Convert number words first
  const normalizedText = convertNumberWords(text);
  
  const timeResult = parseTime(normalizedText);
  const painLevel = parsePainLevel(normalizedText);
  const medications = parseMedications(normalizedText);
  const medicationEffect = parseMedicationEffect(normalizedText);
  const confidence = calculateConfidence(text, timeResult, painLevel, medications);
  
  const notes = extractNotes(normalizedText, timeResult, painLevel, medications);
  
  const result: ParsedVoiceEntry = {
    selectedDate: timeResult.date,
    selectedTime: timeResult.time,
    painLevel,
    medications,
    notes,
    isNow: timeResult.isNow,
    confidence,
    medicationEffect: medicationEffect && medicationEffect.rating !== 'none' ? medicationEffect : undefined
  };
  
  console.log('🎙️ Parsed result:', result);
  console.log('🎙️ Missing slots check:', getMissingSlots(result));
  return result;
}