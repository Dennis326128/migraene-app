import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VoiceEntrySchema {
  timestampISO: string | null;
  painIntensity: number | null;
  meds: Array<{ name: string; doseMg?: number }> | null;
  hadAura: boolean | null;
  sideEffects: string[] | null;
  notes: string | null;
  missing: string[];
  sourceText: string;
  confidence: {
    time: 'high' | 'medium' | 'low';
    pain: 'high' | 'medium' | 'low';
    meds: 'high' | 'medium' | 'low';
  };
}

// Medication synonym mapping
const MED_SYNONYMS: Record<string, string> = {
  'suma': 'Sumatriptan',
  'sumat': 'Sumatriptan',
  'ibu': 'Ibuprofen',
  'ass': 'Aspirin',
  'aspirin': 'Aspirin',
  'para': 'Paracetamol',
  'riza': 'Rizatriptan',
  'almo': 'Almotriptan',
  'nara': 'Naratriptan',
};

function normalizeMedName(medName: string): string {
  const lowerName = medName.toLowerCase().trim();
  
  // Check synonyms first
  for (const [syn, canonical] of Object.entries(MED_SYNONYMS)) {
    if (lowerName.startsWith(syn)) {
      return canonical;
    }
  }
  
  // Return original if no synonym found
  return medName;
}

function parseMedications(text: string, userMeds: Array<{ name: string }>): Array<{ name: string; doseMg?: number }> {
  const meds: Array<{ name: string; doseMg?: number }> = [];
  const lowerText = text.toLowerCase();
  
  console.log('🔍 Parsing medications from:', text);
  console.log('📋 User medications:', userMeds.map(m => m.name));
  
  // Try to match user medications
  for (const userMed of userMeds) {
    const medName = userMed.name.toLowerCase();
    const medWords = medName.split(/\s+/);
    const primaryName = medWords[0];
    
    // Extract dosage from saved medication name
    const savedDosageMatch = medName.match(/(\d+)\s*mg/);
    const savedDosage = savedDosageMatch ? parseInt(savedDosageMatch[1]) : null;
    
    // Check for abbreviations
    const abbreviations: string[] = [];
    if (medName.includes('sumatriptan')) abbreviations.push('suma', 'sumat');
    if (medName.includes('ibuprofen')) abbreviations.push('ibu');
    if (medName.includes('aspirin')) abbreviations.push('ass');
    if (medName.includes('paracetamol')) abbreviations.push('para');
    
    const variants = [primaryName, medName, ...abbreviations];
    
    // Check if any variant matches
    let found = false;
    for (const variant of variants) {
      const regex = new RegExp(`\\b${variant}\\b`, 'i');
      if (regex.test(lowerText)) {
        found = true;
        
        // Try to extract dosage from context
        const dosageRegex = new RegExp(`${variant}\\s*(\\d+)`, 'i');
        const dosageMatch = text.match(dosageRegex);
        const spokenDosage = dosageMatch ? parseInt(dosageMatch[1]) : null;
        
        // Use spoken dosage if available, otherwise use saved dosage
        const finalDosage = spokenDosage || savedDosage;
        
        meds.push({
          name: userMed.name, // Use original saved name
          doseMg: finalDosage || undefined
        });
        
        console.log(`✅ Found medication: ${userMed.name} (${finalDosage || 'no dosage'}mg)`);
        break;
      }
    }
  }
  
  return meds;
}

function parsePainIntensity(text: string): number | null {
  const lowerText = text.toLowerCase();
  
  // Direct numbers (0-10)
  const directMatch = lowerText.match(/\b([0-9]|10)\b/);
  if (directMatch) {
    const level = parseInt(directMatch[1]);
    if (level >= 0 && level <= 10) {
      console.log(`🎯 Found pain level: ${level}`);
      return level;
    }
  }
  
  // German number words
  const numberWords: Record<string, number> = {
    'null': 0, 'eins': 1, 'zwei': 2, 'drei': 3, 'vier': 4,
    'fünf': 5, 'sechs': 6, 'sieben': 7, 'acht': 8, 'neun': 9, 'zehn': 10
  };
  
  for (const [word, num] of Object.entries(numberWords)) {
    if (new RegExp(`\\b${word}\\b`).test(lowerText)) {
      console.log(`🎯 Found pain level (word): ${word} = ${num}`);
      return num;
    }
  }
  
  // Intensity words
  if (/(sehr starke?|unerträglich|extrem)/i.test(text)) return 9;
  if (/(starke?|schwere?|heftig)/i.test(text)) return 7;
  if (/(mittel|mäßig)/i.test(text)) return 5;
  if (/(leicht|schwach|gering)/i.test(text)) return 3;
  
  return null;
}

function parseTimeToISO(text: string): string | null {
  const now = new Date();
  const berlinOffset = 1 * 60 * 60 * 1000; // UTC+1 (CET)
  
  // "Now" indicators
  if (/(jetzt|gerade|sofort|eben)/i.test(text)) {
    return new Date(now.getTime() + berlinOffset).toISOString();
  }
  
  // Relative time: "vor X Stunden"
  const hoursMatch = text.match(/vor\s+(\d+|einer?|zwei|drei)\s+stunden?/i);
  if (hoursMatch) {
    const hoursWord = hoursMatch[1];
    const hours = parseInt(hoursWord) || ({'einer': 1, 'eine': 1, 'zwei': 2, 'drei': 3}[hoursWord.toLowerCase()] || 1);
    const targetTime = new Date(now.getTime() - hours * 60 * 60 * 1000 + berlinOffset);
    return targetTime.toISOString();
  }
  
  // Relative time: "vor X Minuten"
  const minutesMatch = text.match(/vor\s+(\d+)\s+minuten?/i);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1]);
    const targetTime = new Date(now.getTime() - minutes * 60 * 1000 + berlinOffset);
    return targetTime.toISOString();
  }
  
  // Specific time: "14:30"
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const targetTime = new Date(now);
    targetTime.setHours(hours, minutes, 0, 0);
    return new Date(targetTime.getTime() + berlinOffset).toISOString();
  }
  
  // Default: now
  return new Date(now.getTime() + berlinOffset).toISOString();
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    const { transcript, userMeds = [] } = await req.json();
    
    if (!transcript || typeof transcript !== 'string') {
      throw new Error('Invalid transcript');
    }

    console.log('🎤 Processing transcript:', transcript);
    console.log('👤 User medications:', userMeds);

    // Parse components
    const timestampISO = parseTimeToISO(transcript);
    const painIntensity = parsePainIntensity(transcript);
    const meds = parseMedications(transcript, userMeds);
    
    // Check for aura indicators
    const hasAuraIndicator = /(aura|flimmern|sehstörung|visuell)/i.test(transcript);
    const hadAura = hasAuraIndicator ? true : null;
    
    // Extract remaining text as notes
    let notes = transcript;
    // Remove parsed components from notes
    notes = notes.replace(/\b([0-9]|10)\b/g, '');
    notes = notes.replace(/(jetzt|gerade|vor\s+\d+\s+(stunden?|minuten?))/gi, '');
    notes = notes.replace(/(sehr starke?|starke?|mittel|leicht)/gi, '');
    userMeds.forEach(med => {
      const regex = new RegExp(`\\b${med.name}\\b`, 'gi');
      notes = notes.replace(regex, '');
    });
    notes = notes.replace(/\s+/g, ' ').trim();
    notes = notes || null;
    
    // Calculate missing fields
    const missing: string[] = [];
    if (!timestampISO) missing.push('time');
    if (painIntensity === null) missing.push('pain');
    if (!meds || meds.length === 0) missing.push('meds');
    
    // Confidence calculation
    const confidence = {
      time: timestampISO ? 'high' : 'low',
      pain: painIntensity !== null ? 'high' : 'low',
      meds: meds.length > 0 ? 'high' : 'low'
    } as const;
    
    const result: VoiceEntrySchema = {
      timestampISO,
      painIntensity,
      meds: meds.length > 0 ? meds : null,
      hadAura,
      sideEffects: null,
      notes,
      missing,
      sourceText: transcript,
      confidence
    };

    console.log('✅ Parsed result:', result);

    // Log to debug table
    try {
      await supabase.from('voice_entries_debug').insert({
        user_id: user.id,
        source_text: transcript,
        parsed_json: result,
        missing_fields: missing,
        confidence_scores: confidence
      });
    } catch (logError) {
      console.warn('⚠️ Failed to log to debug table:', logError);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error',
        missing: ['time', 'pain', 'meds']
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
