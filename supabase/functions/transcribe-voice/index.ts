import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎤 Transcribe Voice: Request received');

    // Parse request body
    const { audioBase64, fallbackTranscript, language = 'de-DE' } = await req.json();

    // Get STT configuration from environment
    const sttProvider = Deno.env.get('STT_PROVIDER') || 'none';
    const sttApiKey = Deno.env.get('STT_API_KEY');

    console.log(`🔧 STT Config: provider=${sttProvider}, hasKey=${!!sttApiKey}`);

    // Fallback mode: No external provider or no API key
    if (sttProvider === 'none' || !sttApiKey) {
      console.log('📝 Using fallback transcript (no external STT provider)');
      
      if (!fallbackTranscript) {
        return new Response(
          JSON.stringify({ 
            error: 'No fallback transcript provided and no STT provider configured' 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Return fallback transcript with medium confidence
      return new Response(
        JSON.stringify({
          transcript: fallbackTranscript,
          confidence: 0.7,
          provider: 'fallback'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // External STT provider mode
    console.log(`🔊 Processing with ${sttProvider} provider`);

    // Convert base64 to audio buffer if provided
    let audioBuffer: Uint8Array | null = null;
    if (audioBase64) {
      try {
        const binaryString = atob(audioBase64);
        audioBuffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          audioBuffer[i] = binaryString.charCodeAt(i);
        }
        console.log(`📊 Audio buffer size: ${audioBuffer.length} bytes`);
      } catch (e) {
        console.error('❌ Failed to decode audio:', e);
      }
    }

    // Provider-specific implementation
    switch (sttProvider) {
      case 'whisper':
        // TODO: Implement Whisper API call
        // For now, return fallback
        console.log('⚠️ Whisper not yet implemented, using fallback');
        return new Response(
          JSON.stringify({
            transcript: fallbackTranscript || '',
            confidence: 0.6,
            provider: 'whisper-fallback',
            note: 'Whisper integration pending'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'deepgram':
        console.log('⚠️ Deepgram not yet implemented, using fallback');
        return new Response(
          JSON.stringify({
            transcript: fallbackTranscript || '',
            confidence: 0.6,
            provider: 'deepgram-fallback'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'assemblyai':
        console.log('⚠️ AssemblyAI not yet implemented, using fallback');
        return new Response(
          JSON.stringify({
            transcript: fallbackTranscript || '',
            confidence: 0.6,
            provider: 'assemblyai-fallback'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      default:
        console.warn(`❓ Unknown provider: ${sttProvider}`);
        return new Response(
          JSON.stringify({
            transcript: fallbackTranscript || '',
            confidence: 0.5,
            provider: 'unknown-fallback'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ Transcribe error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        transcript: '',
        confidence: 0.0
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
