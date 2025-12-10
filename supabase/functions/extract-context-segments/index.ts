import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NLP_VERSION = 'v1.0.0';

interface ContextSegment {
  segment_index: number;
  segment_type: string;
  source_text: string;
  normalized_summary: string | null;
  medication_name: string | null;
  medication_dose: string | null;
  medication_role: string | null;
  effect_rating: string | null;
  timing_relation: string | null;
  time_reference: string | null;
  factor_type: string | null;
  factor_value: string | null;
  confidence: number;
  is_ambiguous: boolean;
}

// Segment type patterns for classification
const SEGMENT_PATTERNS = {
  medication_event: [
    /\b(genommen|eingenommen|geschluckt|gespritzt|verwendet|gebraucht)\b/i,
    /\b(sumatriptan|ibuprofen|aspirin|paracetamol|triptan|ajovy|topiramat|amitriptylin|diazepam|zopiclon)\b/i,
    /\b(\d+\s*mg|\d+\s*tablette[n]?|\d+\s*spritze[n]?)\b/i,
  ],
  symptom_course: [
    /\b(migräne|kopfschmerz|attacke|anfall|schmerz)\b/i,
    /\b(aufgewacht|angefangen|begonnen|nachgelassen|verschwunden|besser|schlimmer)\b/i,
    /\b(am nächsten morgen|wieder|erneut|immer noch)\b/i,
  ],
  lifestyle_factor: [
    /\b(geschlafen|schlaf|müde|ausgeruht|wach)\b/i,
    /\b(gegessen|essen|getrunken|kaffee|alkohol|wasser|mahlzeit)\b/i,
    /\b(sport|training|yoga|spazieren|bewegung)\b/i,
    /\b(stress|entspannt|hektisch|ruhig)\b/i,
  ],
  trigger: [
    /\b(trigger|ausgelöst|verursacht|durch)\b/i,
    /\b(wetter|luftdruck|föhn|gewitter)\b/i,
    /\b(licht|lärm|geruch|bildschirm)\b/i,
    /\b(periode|menstruation|zyklus|regel)\b/i,
  ],
  time_pattern: [
    /\b(dienstag|mittwoch|montag|donnerstag|freitag|samstag|sonntag)\b/i,
    /\b(in folge|wieder|jedes mal|immer|regelmäßig)\b/i,
    /\b(morgen[s]?|abend[s]?|mittag[s]?|nacht[s]?)\b/i,
    /\b(wochenende|werktag|arbeitstag)\b/i,
  ],
};

// Effect rating keywords
const EFFECT_PATTERNS = {
  keine_wirkung: [/\bgar nicht|überhaupt nicht|null|keine wirkung|nichts gebracht|nicht geholfen\b/i],
  teilweise: [/\bteilweise|ein bisschen|etwas|leicht|minimal\b/i],
  gut: [/\bgut|geholfen|gewirkt|besser\b/i],
  sehr_gut: [/\bsehr gut|super|perfekt|komplett weg|völlig\b/i],
  verschlechterung: [/\bschlimmer|verschlimmert|verschlechtert|verstärkt\b/i],
};

// Lifestyle factor types
const FACTOR_PATTERNS = {
  schlaf: [/\bschlaf|geschlafen|müde|ausgeruht|wach|insomnie\b/i],
  stress: [/\bstress|hektisch|angespannt|entspannt|überfordert\b/i],
  ernaehrung: [/\bgegessen|essen|mahlzeit|hunger|nüchtern|fasten\b/i],
  koffein: [/\bkaffee|koffein|espresso|cola|energy\b/i],
  alkohol: [/\balkohol|wein|bier|sekt|getrunken\b/i],
  menstruation: [/\bperiode|menstruation|zyklus|regel|pms\b/i],
  wetter: [/\bwetter|luftdruck|föhn|gewitter|kalt|warm\b/i],
  sport: [/\bsport|training|yoga|laufen|fitness|bewegung\b/i],
};

// Medication role detection
const MED_ROLE_PATTERNS = {
  akut: [/\bakut|bei anfall|bei schmerzen|gegen die attacke\b/i],
  rescue: [/\brescue|notfall|wenn.*nicht hilft|zusätzlich\b/i],
  prophylaxe: [/\bprophylaxe|vorbeugend|täglich|regelmäßig|dauerhaft\b/i],
  begleit: [/\bdazu|außerdem|zusätzlich|begleitend\b/i],
};

function classifySegmentType(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Priority order for classification
  const typeOrder = ['medication_event', 'symptom_course', 'lifestyle_factor', 'trigger', 'time_pattern'];
  
  for (const type of typeOrder) {
    const patterns = SEGMENT_PATTERNS[type as keyof typeof SEGMENT_PATTERNS];
    const matchCount = patterns.filter(p => p.test(lowerText)).length;
    if (matchCount >= 1) {
      return type;
    }
  }
  
  return 'unknown';
}

function extractEffectRating(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  for (const [rating, patterns] of Object.entries(EFFECT_PATTERNS)) {
    if (patterns.some(p => p.test(lowerText))) {
      return rating;
    }
  }
  
  return null;
}

function extractFactorType(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  for (const [factor, patterns] of Object.entries(FACTOR_PATTERNS)) {
    if (patterns.some(p => p.test(lowerText))) {
      return factor;
    }
  }
  
  return null;
}

function extractMedicationRole(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  for (const [role, patterns] of Object.entries(MED_ROLE_PATTERNS)) {
    if (patterns.some(p => p.test(lowerText))) {
      return role;
    }
  }
  
  return null;
}

function extractMedicationInfo(text: string, userMeds: string[]): { name: string | null; dose: string | null } {
  const lowerText = text.toLowerCase();
  
  // Common medication synonyms
  const medSynonyms: Record<string, string[]> = {
    'sumatriptan': ['suma', 'sumat'],
    'ibuprofen': ['ibu', 'iboprofen'],
    'paracetamol': ['para', 'paracet'],
    'aspirin': ['ass', 'asa'],
    'diazepam': ['diaz', 'valium'],
  };
  
  let foundMed: string | null = null;
  
  // First check user's medications
  for (const med of userMeds) {
    const medLower = med.toLowerCase();
    const medWords = medLower.split(/\s+/);
    const primaryName = medWords[0];
    
    if (lowerText.includes(primaryName) || lowerText.includes(medLower)) {
      foundMed = med;
      break;
    }
  }
  
  // Check synonyms
  if (!foundMed) {
    for (const [canonical, syns] of Object.entries(medSynonyms)) {
      if (lowerText.includes(canonical) || syns.some(s => lowerText.includes(s))) {
        foundMed = canonical.charAt(0).toUpperCase() + canonical.slice(1);
        break;
      }
    }
  }
  
  // Extract dosage
  let dose: string | null = null;
  const doseMatch = text.match(/(\d+)\s*(mg|tablette[n]?|stück|spritze[n]?)/i);
  if (doseMatch) {
    dose = doseMatch[0];
  }
  
  return { name: foundMed, dose };
}

function extractTimeReference(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  // Time patterns
  const patterns = [
    { regex: /zweite[rn]?\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\s+in\s+folge/i, ref: 'zweiter_wochentag_in_folge' },
    { regex: /heute\s+(morgen|abend|mittag|nacht)/i, ref: 'heute_tageszeit' },
    { regex: /gestern\s+(morgen|abend|mittag|nacht)/i, ref: 'gestern_tageszeit' },
    { regex: /am\s+nächsten\s+morgen/i, ref: 'naechster_morgen' },
    { regex: /jede[rns]?\s+(woche|monat|tag)/i, ref: 'wiederkehrend' },
    { regex: /immer\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)s?/i, ref: 'wiederkehrend_wochentag' },
  ];
  
  for (const { regex, ref } of patterns) {
    if (regex.test(lowerText)) {
      return ref;
    }
  }
  
  return null;
}

function extractFactorValue(text: string, factorType: string | null): string | null {
  if (!factorType) return null;
  
  const lowerText = text.toLowerCase();
  
  const valuePatterns: Record<string, Array<{ regex: RegExp; value: string }>> = {
    schlaf: [
      { regex: /schlecht\s+geschlafen|wenig\s+geschlafen|kaum\s+geschlafen/i, value: 'wenig_schlaf' },
      { regex: /gut\s+geschlafen|ausgeschlafen|erholt/i, value: 'gut_geschlafen' },
    ],
    koffein: [
      { regex: /viel\s+kaffee|literweise\s+kaffee|zu\s+viel\s+kaffee/i, value: 'viel_kaffee' },
      { regex: /kein\s+kaffee|ohne\s+kaffee/i, value: 'kein_kaffee' },
    ],
    ernaehrung: [
      { regex: /nichts\s+gegessen|nicht\s+gegessen|nüchtern|kein\s+frühstück/i, value: 'nichts_gegessen' },
      { regex: /unregelmäßig\s+gegessen/i, value: 'unregelmaessig' },
    ],
    stress: [
      { regex: /viel\s+stress|sehr\s+stressig|unter\s+druck/i, value: 'hoher_stress' },
      { regex: /entspannt|relaxed|ruhig/i, value: 'entspannt' },
    ],
  };
  
  const patterns = valuePatterns[factorType];
  if (patterns) {
    for (const { regex, value } of patterns) {
      if (regex.test(lowerText)) {
        return value;
      }
    }
  }
  
  return null;
}

function splitIntoSegments(text: string): string[] {
  // Split by sentences and significant phrases
  const segments = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
  
  // If no good splits, try comma separation for complex sentences
  if (segments.length <= 1 && text.includes(',')) {
    const commaSplit = text
      .split(/,\s*(?=und|aber|weil|da|obwohl|dass)/i)
      .map(s => s.trim())
      .filter(s => s.length > 5);
    
    if (commaSplit.length > 1) {
      return commaSplit;
    }
  }
  
  return segments.length > 0 ? segments : [text];
}

function calculateConfidence(segment: Partial<ContextSegment>): number {
  let confidence = 0.5; // Base confidence
  
  // Boost for identified medication
  if (segment.medication_name) confidence += 0.15;
  
  // Boost for effect rating
  if (segment.effect_rating) confidence += 0.1;
  
  // Boost for specific factor value
  if (segment.factor_value) confidence += 0.1;
  
  // Boost for time reference
  if (segment.time_reference) confidence += 0.05;
  
  // Penalty for unknown type
  if (segment.segment_type === 'unknown') confidence -= 0.2;
  
  return Math.max(0.1, Math.min(1.0, confidence));
}

function processTextToSegments(text: string, userMeds: string[]): ContextSegment[] {
  const rawSegments = splitIntoSegments(text);
  const segments: ContextSegment[] = [];
  
  rawSegments.forEach((sourceText, index) => {
    const segmentType = classifySegmentType(sourceText);
    const effectRating = extractEffectRating(sourceText);
    const medInfo = extractMedicationInfo(sourceText, userMeds);
    const medRole = extractMedicationRole(sourceText);
    const factorType = extractFactorType(sourceText);
    const factorValue = extractFactorValue(sourceText, factorType);
    const timeRef = extractTimeReference(sourceText);
    const timingRelation = sourceText.toLowerCase().includes('am nächsten morgen') 
      ? 'naechster_morgen' 
      : sourceText.toLowerCase().includes('danach') 
        ? 'nach_auftreten' 
        : null;
    
    const segment: ContextSegment = {
      segment_index: index,
      segment_type: segmentType,
      source_text: sourceText,
      normalized_summary: null, // Will be filled by AI if available
      medication_name: medInfo.name,
      medication_dose: medInfo.dose,
      medication_role: medRole,
      effect_rating: effectRating,
      timing_relation: timingRelation,
      time_reference: timeRef,
      factor_type: factorType,
      factor_value: factorValue,
      confidence: 0,
      is_ambiguous: segmentType === 'unknown',
    };
    
    segment.confidence = calculateConfidence(segment);
    
    // Generate normalized summary
    const summaryParts: string[] = [];
    if (segment.medication_name) {
      summaryParts.push(`${segment.medication_name}${segment.medication_dose ? ` ${segment.medication_dose}` : ''}`);
      if (segment.effect_rating) {
        summaryParts.push(`(${segment.effect_rating.replace('_', ' ')})`);
      }
    }
    if (segment.factor_type && segment.factor_value) {
      summaryParts.push(`${segment.factor_type}: ${segment.factor_value.replace(/_/g, ' ')}`);
    }
    if (segment.time_reference) {
      summaryParts.push(`[${segment.time_reference.replace(/_/g, ' ')}]`);
    }
    
    segment.normalized_summary = summaryParts.length > 0 ? summaryParts.join(' ') : null;
    
    segments.push(segment);
  });
  
  return segments;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    const { voiceNoteId, text, userMeds = [] } = await req.json();
    
    console.log('📝 Processing context text:', text?.substring(0, 100) + '...');
    console.log('💊 User medications:', userMeds);

    if (!text || text.trim().length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Text ist erforderlich',
        segments: [] 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process text into segments
    const medNames = userMeds.map((m: any) => typeof m === 'string' ? m : m.name);
    const segments = processTextToSegments(text, medNames);
    
    console.log(`✅ Extracted ${segments.length} segments`);

    // If voiceNoteId provided, save segments to database
    if (voiceNoteId) {
      // Delete existing segments for this voice note
      await supabase
        .from('voice_note_segments')
        .delete()
        .eq('voice_note_id', voiceNoteId);

      // Insert new segments
      if (segments.length > 0) {
        const segmentsToInsert = segments.map(s => ({
          voice_note_id: voiceNoteId,
          ...s,
        }));

        const { error: insertError } = await supabase
          .from('voice_note_segments')
          .insert(segmentsToInsert);

        if (insertError) {
          console.error('❌ Failed to insert segments:', insertError);
        } else {
          console.log(`✅ Saved ${segments.length} segments to database`);
        }
      }

      // Update voice note NLP status
      await supabase
        .from('voice_notes')
        .update({
          nlp_status: 'processed',
          nlp_version: NLP_VERSION,
          nlp_processed_at: new Date().toISOString(),
        })
        .eq('id', voiceNoteId);
    }

    return new Response(JSON.stringify({
      segments,
      nlp_version: NLP_VERSION,
      segment_count: segments.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error processing context:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten',
      segments: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
