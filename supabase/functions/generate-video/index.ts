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

    const HF_TOKEN = Deno.env.get('HUGGING_FACE_API_KEY');
    if (!HF_TOKEN) {
      throw new Error('HUGGING_FACE_API_KEY non configurée');
    }

    console.log('Génération vidéo avec HuggingFace pour:', sceneTitle);

    // Si l'image est en base64, l'uploader d'abord vers Storage
    let finalImageUrl = imageUrl;
    
    if (imageUrl.startsWith('data:image')) {
      console.log('Image en base64 détectée, upload vers Storage...');
      
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Extraire les données de l'image base64
      const base64Data = imageUrl.split(',')[1];
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      // Créer un nom de fichier unique
      const fileName = `scene-${sceneTitle?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || Date.now()}-${Date.now()}.png`;
      
      // Upload vers le bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('generated-images')
        .upload(fileName, imageBuffer, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Erreur upload base64 vers Storage:', uploadError);
        throw new Error(`Erreur upload image: ${uploadError.message}`);
      }

      // Obtenir l'URL publique
      const { data: { publicUrl } } = supabase.storage
        .from('generated-images')
        .getPublicUrl(fileName);

      finalImageUrl = publicUrl;
      console.log('Image uploadée vers Storage:', publicUrl);
    } else {
      console.log('Image URL publique fournie:', imageUrl.substring(0, 100));
    }

    console.log('Appel API HuggingFace via router...');

    // Appeler HuggingFace router pour fal-ai/ovi
    const hfResponse = await fetch('https://router.huggingface.co/fal-ai/fal-ai/ovi/image-to-video?_subdomain=queue', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: finalImageUrl,
        prompt: prompt,
      }),
    });

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      console.error('Erreur HuggingFace:', hfResponse.status, errorText);
      
      if (hfResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requêtes atteinte. Réessayez dans quelques instants.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (hfResponse.status === 402 || hfResponse.status === 403 || hfResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Erreur d\'authentification HuggingFace. Vérifiez votre clé API.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erreur HuggingFace: ${hfResponse.status} - ${errorText}`);
    }

    const hfData = await hfResponse.json();
    console.log('Réponse HuggingFace:', JSON.stringify(hfData).substring(0, 200));

    // Extraire l'URL de la vidéo générée
    const videoUrl = hfData.video?.url || hfData.url;
    
    if (!videoUrl) {
      console.error('Pas d\'URL vidéo dans la réponse:', hfData);
      throw new Error('Pas d\'URL vidéo retournée par HuggingFace');
    }

    console.log('Vidéo générée, téléchargement depuis:', videoUrl.substring(0, 100));

    // Télécharger la vidéo
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
