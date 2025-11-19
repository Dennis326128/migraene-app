import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SttMode = 'browser_only' | 'provider';
type SttProvider = 'none' | 'openai' | 'deepgram' | 'assemblyai';

interface SttResult {
  transcript: string;
  source: 'browser' | 'provider';
  confidence: number;
  error?: 'NO_TRANSCRIPT' | 'PROVIDER_ERROR';
}

interface TranscribeRequest {
  browserTranscript?: string;
  audioBase64?: string;
  language?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎤 Transcribe Voice: Request received');

    // Parse request body
    const { browserTranscript, audioBase64, language = 'de-DE' } = await req.json() as TranscribeRequest;

    // Get STT configuration from environment
    const sttMode: SttMode = (Deno.env.get('STT_MODE') === 'provider') ? 'provider' : 'browser_only';
    const sttProvider: SttProvider = (Deno.env.get('STT_PROVIDER') as SttProvider) || 'none';
    const sttApiKey = Deno.env.get('OPENAI_API_KEY');

    console.log(`🔧 STT Config: mode=${sttMode}, provider=${sttProvider}, hasKey=${!!sttApiKey}`);

    // ============================================================
    // MODE: browser_only (DEFAULT - KOSTENLOS)
    // ============================================================
    if (sttMode === 'browser_only') {
      console.log('📱 Browser-only mode: Using browser transcript');

      // Browser-Transkript vorhanden und nicht leer
      if (browserTranscript && browserTranscript.trim().length > 0) {
        const result: SttResult = {
          transcript: browserTranscript.trim(),
          source: 'browser',
          confidence: 0.7, // Fixer Wert für Browser-API
        };

        console.log(`✅ Browser transcript: "${result.transcript}"`);
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Browser-Transkript leer oder nicht vorhanden
      console.log('⚠️ No browser transcript available');
      const result: SttResult = {
        transcript: '',
        source: 'browser',
        confidence: 0,
        error: 'NO_TRANSCRIPT',
      };

      return new Response(
        JSON.stringify(result),
        { 
          status: 200, // Kein 400/500 Fehler
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // ============================================================
    // MODE: provider (FÜR SPÄTER - MIT OPENAI WHISPER)
    // ============================================================
    console.log(`🔊 Provider mode: Using ${sttProvider} provider`);

    // Provider konfiguriert und API-Key vorhanden
    if (sttProvider === 'openai' && sttApiKey && audioBase64) {
      try {
        console.log('🎯 Calling OpenAI Whisper API...');
        
        // Convert base64 to audio buffer
        const binaryString = atob(audioBase64);
        const audioBuffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          audioBuffer[i] = binaryString.charCodeAt(i);
        }
        console.log(`📊 Audio buffer size: ${audioBuffer.length} bytes`);

        // TODO: Implement OpenAI Whisper API call here
        // const formData = new FormData();
        // formData.append('file', new Blob([audioBuffer]), 'audio.webm');
        // formData.append('model', 'whisper-1');
        // formData.append('language', language.split('-')[0]);
        // 
        // const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        //   method: 'POST',
        //   headers: { 'Authorization': `Bearer ${sttApiKey}` },
        //   body: formData
        // });
        // 
        // const data = await response.json();
        // 
        // const result: SttResult = {
        //   transcript: data.text,
        //   source: 'provider',
        //   confidence: 0.9,
        // };
        // 
        // return new Response(
        //   JSON.stringify(result),
        //   { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        // );

        console.log('⚠️ OpenAI Whisper not yet implemented');
      } catch (error) {
        console.error('❌ Provider error:', error);
      }
    }

    // Fallback auf Browser-Transkript, wenn Provider nicht verfügbar
    if (browserTranscript && browserTranscript.trim().length > 0) {
      console.log('📝 Provider not available, falling back to browser transcript');
      const result: SttResult = {
        transcript: browserTranscript.trim(),
        source: 'browser',
        confidence: 0.7,
      };

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Kein Transkript verfügbar
    console.log('⚠️ No transcript available from any source');
    const result: SttResult = {
      transcript: '',
      source: 'browser',
      confidence: 0,
      error: 'NO_TRANSCRIPT',
    };

    return new Response(
      JSON.stringify(result),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Transcribe error:', error);
    const result: SttResult = {
      transcript: '',
      source: 'browser',
      confidence: 0,
      error: 'PROVIDER_ERROR',
    };

    return new Response(
      JSON.stringify(result),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
