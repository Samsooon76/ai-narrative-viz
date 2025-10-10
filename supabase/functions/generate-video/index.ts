import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

    const FAL_KEY = Deno.env.get('FAL_KEY');
    if (!FAL_KEY) {
      throw new Error('FAL_KEY non configurée');
    }

    console.log('Génération vidéo avec fal.ai pour:', sceneTitle);
    console.log('Image URL:', imageUrl.substring(0, 100));

    // Appeler l'API fal.ai avec le modèle Ovi
    const response = await fetch('https://fal.run/fal-ai/ovi/video', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: prompt,
        duration: 4, // 4 secondes
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur API fal.ai:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requêtes atteinte. Réessayez dans quelques instants.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Erreur d\'authentification ou crédits épuisés. Vérifiez votre clé API fal.ai.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erreur API fal.ai: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Réponse fal.ai:', JSON.stringify(data).substring(0, 200));

    // Extraire l'URL de la vidéo générée
    const videoUrl = data.video?.url || data.url;
    
    if (!videoUrl) {
      console.error('Pas d\'URL vidéo dans la réponse:', data);
      throw new Error('Pas d\'URL vidéo retournée par fal.ai');
    }

    console.log('Vidéo générée, téléchargement depuis:', videoUrl.substring(0, 100));

    // Télécharger la vidéo depuis fal.ai
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Impossible de télécharger la vidéo: ${videoResponse.status}`);
    }

    const videoArrayBuffer = await videoResponse.arrayBuffer();
    const videoBuffer = new Uint8Array(videoArrayBuffer);

    console.log('Vidéo téléchargée, taille:', videoBuffer.length, 'bytes. Upload vers Storage...');

    // Upload vers Supabase Storage
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const fileName = `scene-${sceneTitle?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || Date.now()}-${Date.now()}.mp4`;
    const filePath = `${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('animation-videos')
      .upload(filePath, videoBuffer, {
        contentType: 'video/mp4',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Erreur upload Storage:', uploadError);
      throw new Error(`Erreur upload: ${uploadError.message}`);
    }

    // Obtenir l'URL publique
    const { data: { publicUrl } } = supabase.storage
      .from('animation-videos')
      .getPublicUrl(filePath);

    console.log('Vidéo uploadée avec succès:', publicUrl);

    return new Response(
      JSON.stringify({ videoUrl: publicUrl }),
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
