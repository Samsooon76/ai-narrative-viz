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
    const { imageUrl, prompt, sceneTitle, projectId, sceneNumber } = await req.json();
    
    if (!imageUrl || !prompt || !projectId || sceneNumber === undefined) {
      return new Response(
        JSON.stringify({ error: 'imageUrl, prompt, projectId et sceneNumber sont requis' }),
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

      const base64Data = imageUrl.split(',')[1];
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      const fileName = `scene-${sceneTitle?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || Date.now()}-${Date.now()}.png`;
      
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

      const { data: { publicUrl } } = supabase.storage
        .from('generated-images')
        .getPublicUrl(fileName);

      finalImageUrl = publicUrl;
      console.log('Image uploadée vers Storage:', publicUrl);
    }

    console.log('Appel API HuggingFace via router...');

    // Soumettre à HuggingFace
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

    const queueData = await hfResponse.json();
    console.log('Request soumis à la queue HuggingFace:', JSON.stringify(queueData).substring(0, 200));

    const statusUrl = queueData.status_url;
    const responseUrl = queueData.response_url;
    
    if (!statusUrl || !responseUrl) {
      throw new Error('URLs de polling manquantes dans la réponse HuggingFace');
    }

    // Tâche en arrière-plan pour le polling et l'upload
    const backgroundTask = async () => {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      let attempts = 0;
      const maxAttempts = 60;
      
      console.log('Polling status_url:', statusUrl);
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const statusResponse = await fetch(statusUrl, {
          headers: { 
            'Authorization': `Bearer ${HF_TOKEN}`,
            'Content-Type': 'application/json'
          },
        });

        if (!statusResponse.ok) {
          console.error('Erreur status polling:', statusResponse.status);
          attempts++;
          continue;
        }

        const statusData = await statusResponse.json();
        console.log('Status:', statusData.status);

        if (statusData.status === 'COMPLETED') {
          const resultResponse = await fetch(responseUrl, {
            headers: { 
              'Authorization': `Bearer ${HF_TOKEN}`,
              'Content-Type': 'application/json'
            },
          });

          if (!resultResponse.ok) {
            console.error('Impossible de récupérer le résultat');
            return;
          }

          const resultData = await resultResponse.json();
          const videoUrl = resultData.video?.url || resultData.url;
          
          if (!videoUrl) {
            console.error('Pas d\'URL vidéo dans la réponse:', resultData);
            return;
          }

          console.log('Vidéo générée, téléchargement depuis:', videoUrl.substring(0, 100));

          const videoResponse = await fetch(videoUrl);
          if (!videoResponse.ok) {
            console.error('Impossible de télécharger la vidéo');
            return;
          }

          const videoArrayBuffer = await videoResponse.arrayBuffer();
          const videoBuffer = new Uint8Array(videoArrayBuffer);

          const fileName = `scene-${sceneTitle?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || Date.now()}-${Date.now()}.mp4`;

          const { error: uploadError } = await supabase.storage
            .from('animation-videos')
            .upload(fileName, videoBuffer, {
              contentType: 'video/mp4',
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('Erreur upload Storage:', uploadError);
            return;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('animation-videos')
            .getPublicUrl(fileName);

          console.log('Vidéo uploadée avec succès:', publicUrl);

          // Mettre à jour la DB avec l'URL de la vidéo
          const { data: project } = await supabase
            .from('video_projects')
            .select('images_data')
            .eq('id', projectId)
            .single();

          if (project?.images_data) {
            const imagesData = typeof project.images_data === 'string'
              ? JSON.parse(project.images_data)
              : project.images_data;

            const updatedImages = Array.isArray(imagesData)
              ? imagesData.map((img: any) => 
                  img.sceneNumber === sceneNumber 
                    ? { ...img, videoUrl: publicUrl }
                    : img
                )
              : imagesData;

            await supabase
              .from('video_projects')
              .update({ images_data: JSON.stringify(updatedImages) })
              .eq('id', projectId);
          }

          return;
        } else if (statusData.status === 'FAILED') {
          console.error('La génération vidéo a échoué');
          return;
        }
        
        attempts++;
      }
      
      console.error('Timeout: La génération a pris trop de temps');
    };

    // Démarrer la tâche en arrière-plan sans EdgeRuntime
    backgroundTask().catch(err => console.error('Erreur background task:', err));

    // Retourner immédiatement
    return new Response(
      JSON.stringify({ 
        status: 'processing',
        message: 'Génération de la vidéo en cours. Vérifiez dans quelques instants.'
      }),
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
