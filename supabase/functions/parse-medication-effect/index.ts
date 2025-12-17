import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== 'string') {
      throw new Error('Transcript is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Call Lovable AI to parse medication effect
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Du bist ein Assistent für eine Migräne-App. Extrahiere aus deutschen Spracheingaben strukturierte Informationen zur Medikamenten-Wirkung.

WICHTIG - 6-Stufen-Skala (0-5):
- effectScore: 0-5 (0=Keine Wirkung, 1=Gering, 2=Mittel, 3=Gut, 4=Sehr gut, 5=Perfekt)
- Erkenne Formulierungen:
  "gar nicht geholfen" / "keine Wirkung" / "null" → 0
  "kaum geholfen" / "gering" / "wenig" → 1
  "mittelmäßig" / "mittel" / "so lala" → 2
  "gut geholfen" / "gut" → 3
  "sehr gut" / "richtig gut" → 4
  "perfekt" / "super" / "komplett schmerzfrei" → 5
- Erkenne auch Prozentwerte: "50%" → 2-3, "80%" → 4, "100%" → 5
- sideEffects: Liste von Nebenwirkungen (Übelkeit, Schwindel, Müdigkeit, Kopfschmerzen, Magenschmerzen, Herzrasen, Schwitzen, etc.)
- notesSummary: Kurze Zusammenfassung (1-2 Sätze) von Infos, die nicht in effectScore/sideEffects passen

Antworte NUR mit validem JSON im folgenden Format:
{
  "effectScore": number | null,
  "sideEffects": string[],
  "notesSummary": string
}`
          },
          {
            role: 'user',
            content: transcript
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('AI gateway error');
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON from response
    let parsed;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      parsed = JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Invalid JSON in AI response');
    }

    return new Response(
      JSON.stringify({
        effectScore: parsed.effectScore ?? null,
        sideEffects: Array.isArray(parsed.sideEffects) ? parsed.sideEffects : [],
        notesSummary: typeof parsed.notesSummary === 'string' ? parsed.notesSummary : '',
        confidence: 'medium' as const
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('parse-medication-effect error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        effectScore: null,
        sideEffects: [],
        notesSummary: '',
        confidence: 'low' as const
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
