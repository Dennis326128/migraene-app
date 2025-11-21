import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: generate-doctor-summary
 * 
 * Generiert einen extrem kurzen, arztorientierten KI-Kurzbericht
 * aus Migräne-Tagebuch-Daten für PDF-Reports.
 * 
 * Input: { fromDate, toDate }
 * Output: { summary: string } - max. 5-6 Bulletpoints, je ~150 Zeichen
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { fromDate, toDate } = await req.json();

    if (!fromDate || !toDate) {
      return new Response(
        JSON.stringify({ error: 'fromDate and toDate required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tagebuch-Einträge laden
    const { data: entries, error: entriesError } = await supabaseClient
      .from('pain_entries')
      .select(`
        id,
        timestamp_created,
        selected_date,
        selected_time,
        pain_level,
        aura_type,
        pain_location,
        medications,
        notes
      `)
      .eq('user_id', user.id)
      .gte('selected_date', fromDate.split('T')[0])
      .lte('selected_date', toDate.split('T')[0])
      .order('selected_date', { ascending: true });

    if (entriesError) {
      console.error('Error fetching entries:', entriesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch entries' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ 
          summary: "**Keine Einträge im Berichtszeitraum**\n\n• Datenlage unzureichend für Analyse.\n• Patient sollte regelmäßiger dokumentieren." 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Medikamenten-Effekte laden
    const entryIds = entries.map(e => e.id);
    const { data: effects } = await supabaseClient
      .from('medication_effects')
      .select('entry_id, med_name, effect_rating')
      .in('entry_id', entryIds);

    // Prompt für kurzen Arztbericht
    const prompt = `Du bist eine medizinisch neutrale KI. Werte Migräne-Tagebuchdaten aus und erstelle einen sehr kurzen, sachlichen Kurzbericht für Ärzt:innen.

WICHTIGE VORGABEN:
- Fokus auf Auffälligkeiten und relevante Muster, nicht auf allgemeine Erklärungen
- KEINE Selbstdiagnosen, KEINE Therapieempfehlungen, KEINE Spekulationen
- Kein Smalltalk, keine Anrede, keine Emojis
- Sprache: Deutsch
- Maximal 5-6 Bulletpoints, jede Bullet maximal ca. 150 Zeichen
- Wenn Datenlage dünn ist, kurz erwähnen ohne lange Ausführung

STRUKTUR:
Überschrift: "**Kurzbericht – Migränedaten (ärztliche Übersicht)**"

Danach 3-6 Bulletpoints:
• Verlauf (z.B. Häufigkeit, Zunahme/Abnahme)
• Intensität (z.B. typische Schmerzstärke, Spitzen)
• Auffällige Zeitmuster (z.B. zyklisch, am Wochenende etc., nur falls klar)
• Medikation: Wirksamkeit / fehlende Wirkung / Übergebrauchstendenz
• Besondere Warnhinweise (z.B. sehr lange Attacken, Status-ähnlich, häufige Notfallmedikation)

VERMEIDE:
- Formulierungen wie "Sie sollten...", "Empfohlen wäre..."
- Laienerklärungen von Migräne an sich

DATEN:

Berichtszeitraum: ${fromDate.split('T')[0]} bis ${toDate.split('T')[0]}
Anzahl Einträge: ${entries.length}

Einträge:
${entries.map(e => {
  const date = e.selected_date || e.timestamp_created?.split('T')[0];
  const time = e.selected_time || '';
  const pain = e.pain_level || 'unbekannt';
  const meds = e.medications?.join(', ') || 'keine';
  
  // Finde Effekte für diesen Eintrag
  const entryEffects = effects?.filter(eff => eff.entry_id === e.id) || [];
  const effectsText = entryEffects.length > 0 
    ? entryEffects.map(eff => `${eff.med_name}:${eff.effect_rating}`).join(', ')
    : 'keine Bewertung';
  
  return `${date} ${time}: Schmerz ${pain}, Aura ${e.aura_type || 'keine'}, Meds ${meds}, Wirkung ${effectsText}`;
}).join('\n')}

Gib NUR den fertig formatierten Text zurück.`;

    // Lovable AI aufrufen
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Du bist ein medizinischer KI-Assistent, der prägnante, arztorientierte Zusammenfassungen erstellt.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content || 'Keine Analyse verfügbar';

    return new Response(
      JSON.stringify({ summary }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-doctor-summary:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
