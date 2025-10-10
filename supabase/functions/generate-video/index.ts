import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, prompt, sceneTitle } = await req.json();
    
    if (!imageUrl || !prompt) {
      return new Response(
        JSON.stringify({ error: 'L\'URL de l\'image et le prompt sont requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const HUGGING_FACE_API_KEY = Deno.env.get('HUGGING_FACE_API_KEY');
    if (!HUGGING_FACE_API_KEY) {
      throw new Error('HUGGING_FACE_API_KEY non configurée');
    }

    console.log('Génération vidéo pour:', sceneTitle);

    // Télécharger l'image depuis l'URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Impossible de télécharger l\'image');
    }
    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Créer le FormData pour l'API Hugging Face
    const formData = new FormData();
    formData.append('image', new Blob([imageBuffer]), 'image.png');
    formData.append('prompt', prompt);
    formData.append('model', 'chetwinlow1/Ovi');

    const response = await fetch('https://api-inference.huggingface.co/models/image-to-video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
        'x-use-provider': 'fal-ai',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur API Hugging Face:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requêtes atteinte. Réessayez dans quelques instants.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Crédits Hugging Face épuisés ou clé API invalide.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erreur API: ${response.status}`);
    }

    // Récupérer la vidéo générée
    const videoBlob = await response.blob();
    const videoBuffer = await videoBlob.arrayBuffer();
    const videoBase64 = btoa(String.fromCharCode(...new Uint8Array(videoBuffer)));
    const videoUrl = `data:video/mp4;base64,${videoBase64}`;
    
    console.log('Vidéo générée avec succès');

    return new Response(
      JSON.stringify({ videoUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erreur dans generate-video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
