import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fromDate, toDate } = await req.json();
    
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Keine Authentifizierung');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user ID from auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Authentifizierung fehlgeschlagen');

    // Check if AI analysis is enabled
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ai_enabled')
      .eq('user_id', user.id)
      .single();

    if (!profile?.ai_enabled) {
      return new Response(JSON.stringify({ 
        error: 'AI-Analyse ist in den Einstellungen deaktiviert' 
      }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Fetch voice notes
    const { data: notes, error: notesError } = await supabase
      .from('voice_notes')
      .select('occurred_at, text')
      .eq('user_id', user.id)
      .gte('occurred_at', fromDate)
      .lte('occurred_at', toDate)
      .order('occurred_at', { ascending: true });

    if (notesError) throw notesError;

    if (!notes || notes.length === 0) {
      return new Response(JSON.stringify({ 
        insights: 'Keine Voice-Notizen im gewählten Zeitraum gefunden.',
        analyzed_notes: 0,
        date_range: { from: fromDate, to: toDate }
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Anonymize data for LLM (only date, not exact time)
    const anonymizedNotes = notes.map(n => ({
      timestamp: new Date(n.occurred_at).toISOString().split('T')[0],
      text: n.text
    }));

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY nicht konfiguriert');

    const prompt = `Du bist ein medizinischer Assistent für Migräne-Analyse. Analysiere folgende Voice-Notizen eines Migräne-Patienten:

${anonymizedNotes.map(n => `[${n.timestamp}] ${n.text}`).join('\n\n')}

Erstelle eine strukturierte Analyse mit folgenden Punkten:

1. **Häufigste Trigger** (Schlaf, Stress, Ernährung, Wetter, etc.)
2. **Zeitliche Muster** (Wochentag, Uhrzeit, Frequenz)
3. **Medikations-Effizienz** (falls erwähnt)
4. **Frühwarn-Signale** (Aura, Vorankündigung)
5. **Empfehlungen** (was sollte der Patient mit dem Arzt besprechen)

Sei konkret und nenne Beispiele aus den Texten. Verwende deutsche Sprache und markdown-Formatierung.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Du bist ein hilfreicher medizinischer Assistent für Migräne-Patienten.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate Limit erreicht. Bitte später erneut versuchen.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Guthaben aufgebraucht. Bitte Credits hinzufügen.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI Gateway Error:', aiResponse.status, errorText);
      throw new Error(`AI-Analyse fehlgeschlagen: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const insights = aiData.choices[0].message.content;

    // Log metadata only (no content)
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'AI_ANALYSIS',
      table_name: 'voice_notes',
      old_data: {
        model: 'gemini-2.5-flash',
        notes_count: notes.length,
        tokens: aiData.usage?.total_tokens || 0
      }
    });

    return new Response(JSON.stringify({
      insights,
      analyzed_notes: notes.length,
      date_range: { from: fromDate, to: toDate }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
