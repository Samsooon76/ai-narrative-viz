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

    // Télécharger l'image et la convertir en bytes
    let imageBytes: Uint8Array;
    
    if (imageUrl.startsWith('data:')) {
      // Handle base64 data URL
      const base64Data = imageUrl.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      imageBytes = bytes;
    } else {
      // Handle regular URL
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error('Impossible de télécharger l\'image');
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      imageBytes = new Uint8Array(arrayBuffer);
    }

    console.log('Image téléchargée, génération de la vidéo...');

    // Utiliser l'API Provider de HuggingFace avec fal-ai
    // Endpoint spécial pour les providers
    const response = await fetch('https://api-inference.huggingface.co/providers/fal-ai/chetwinlow1/Ovi/image-to-video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {
          image: Array.from(imageBytes),
          prompt: prompt,
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
          JSON.stringify({ error: 'Erreur d\'authentification ou crédits épuisés. Vérifiez votre clé API HuggingFace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 503) {
        return new Response(
          JSON.stringify({ error: 'Le modèle est en cours de chargement. Réessayez dans 20-30 secondes.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erreur API: ${response.status} - ${errorText}`);
    }

    console.log('Vidéo générée, conversion en base64...');

    // La réponse devrait être la vidéo en binaire
    const contentType = response.headers.get('content-type');
    console.log('Content-Type:', contentType);
    
    if (contentType?.includes('application/json')) {
      // Si c'est du JSON, lire le contenu
      const jsonData = await response.json();
      console.log('Réponse JSON:', JSON.stringify(jsonData).substring(0, 200));
      
      // Peut contenir une URL vers la vidéo
      if (jsonData.video_url || jsonData.url) {
        const videoFetchUrl = jsonData.video_url || jsonData.url;
        const videoResponse = await fetch(videoFetchUrl);
        const videoBlob = await videoResponse.blob();
        const videoArrayBuffer = await videoBlob.arrayBuffer();
        const videoBase64 = btoa(String.fromCharCode(...new Uint8Array(videoArrayBuffer)));
        const videoUrl = `data:video/mp4;base64,${videoBase64}`;
        
        return new Response(
          JSON.stringify({ videoUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        throw new Error('Format de réponse inattendu: ' + JSON.stringify(jsonData).substring(0, 100));
      }
    } else {
      // La réponse est directement la vidéo
      const videoArrayBuffer = await response.arrayBuffer();
      const videoBase64 = btoa(String.fromCharCode(...new Uint8Array(videoArrayBuffer)));
      const videoUrl = `data:video/mp4;base64,${videoBase64}`;
      
      console.log('Vidéo générée avec succès, taille:', videoArrayBuffer.byteLength, 'bytes');

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
