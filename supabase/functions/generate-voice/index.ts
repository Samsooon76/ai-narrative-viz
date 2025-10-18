import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { narration } = body;

    if (!narration || typeof narration !== 'string' || narration.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'La narration est requise et doit être une chaîne non vide' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const CARTESIA_API_KEY = Deno.env.get('CARTESIA_API_KEY');
    if (!CARTESIA_API_KEY) {
      throw new Error('CARTESIA_API_KEY non configurée dans les secrets Supabase');
    }

    const CARTESIA_VOICE_ID = 'bd94e5a0-2b7a-4762-9b91-6eac6342f852';
    const CARTESIA_MODEL = 'sonic-english';

    console.log(`Génération voix Cartesia pour narration: ${narration.substring(0, 50)}...`);

    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'X-API-Key': CARTESIA_API_KEY,
        'Cartesia-Version': '2025-04-16',
        'Content-Type': 'application/json',
        'Accept': 'audio/wav',
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL,
        transcript: narration.trim(),
        voice: {
          id: CARTESIA_VOICE_ID,
        },
        output_format: {
          container: 'wav',
          sample_rate: 16000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur API Cartesia:', response.status, errorText);
      throw new Error(`Erreur Cartesia ${response.status}: ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioUint8 = new Uint8Array(audioBuffer);

    // Convertir en base64
    let binary = '';
    for (let i = 0; i < audioUint8.length; i++) {
      binary += String.fromCharCode(audioUint8[i]);
    }
    const base64Audio = btoa(binary);

    console.log(`✓ Voix générée avec succès, durée: ${audioUint8.length} bytes`);

    return new Response(
      JSON.stringify({
        audioBase64: base64Audio,
        contentType: 'audio/wav',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erreur dans generate-voice:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
