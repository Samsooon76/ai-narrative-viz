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
    let imageBuffer: ArrayBuffer;
    
    if (imageUrl.startsWith('data:')) {
      // Handle base64 data URL
      const base64Data = imageUrl.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      imageBuffer = bytes.buffer;
    } else {
      // Handle regular URL
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error('Impossible de télécharger l\'image');
      }
      imageBuffer = await imageResponse.arrayBuffer();
    }

    // Utiliser l'API HuggingFace Inference avec le provider fal-ai
    // L'endpoint correct est celui du modèle spécifique
    const response = await fetch('https://api-inference.huggingface.co/models/chetwinlow1/Ovi', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
        'Content-Type': 'application/json',
        'x-use-cache': 'false',
      },
      body: JSON.stringify({
        inputs: {
          image: Array.from(new Uint8Array(imageBuffer)),
          prompt: prompt,
        },
        parameters: {
          provider: 'fal-ai',
        }
      }),
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

      if (response.status === 503) {
        return new Response(
          JSON.stringify({ error: 'Le modèle est en cours de chargement. Réessayez dans quelques secondes.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erreur API: ${response.status} - ${errorText}`);
    }

    // Récupérer la vidéo générée (peut être en format binaire)
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('video')) {
      // La réponse est directement une vidéo
      const videoBlob = await response.blob();
      const videoBuffer = await videoBlob.arrayBuffer();
      const videoBase64 = btoa(String.fromCharCode(...new Uint8Array(videoBuffer)));
      const videoUrl = `data:video/mp4;base64,${videoBase64}`;
      
      console.log('Vidéo générée avec succès');

      return new Response(
        JSON.stringify({ videoUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // La réponse est en JSON avec l'URL ou les données
      const data = await response.json();
      console.log('Réponse API:', JSON.stringify(data).substring(0, 200));
      
      // Adapter selon la structure de réponse réelle de l'API
      let videoUrl;
      if (data.video) {
        videoUrl = data.video;
      } else if (data.url) {
        videoUrl = data.url;
      } else if (Array.isArray(data) && data.length > 0) {
        // Si la réponse est un array de bytes
        const videoBase64 = btoa(String.fromCharCode(...new Uint8Array(data)));
        videoUrl = `data:video/mp4;base64,${videoBase64}`;
      } else {
        throw new Error('Format de réponse inattendu: ' + JSON.stringify(data).substring(0, 100));
      }
      
      console.log('Vidéo générée avec succès');

      return new Response(
        JSON.stringify({ videoUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Erreur dans generate-video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
