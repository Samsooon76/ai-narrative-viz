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
    const { prompt, sceneTitle } = await req.json();
    
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Le prompt est requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY non configurée');
    }

    console.log('Génération image pour:', sceneTitle);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          { 
            role: 'user', 
            content: `Create a highly dynamic and cinematic 9:16 vertical portrait image perfect for animation and video storytelling.

IMAGE REQUIREMENTS:
- Dynamic composition with clear action or movement potential
- Expressive characters with strong emotions and gestures
- Dramatic lighting that creates depth and atmosphere
- Compelling foreground and background elements for parallax animation
- Cinematic framing with visual storytelling elements
- Rich details that will be captivating when animated

SCENE TO ILLUSTRATE:
${prompt}

Generate a visually stunning image in English that tells a story and can be brought to life through animation. Focus on drama, movement potential, and captivating visual details.` 
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur API Lovable AI:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requêtes atteinte. Réessayez dans quelques instants.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Crédits Lovable AI épuisés. Veuillez recharger votre compte.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erreur API: ${response.status}`);
    }

    const data = await response.json();
    
    console.log('Réponse API complète:', JSON.stringify(data));
    
    // Extraire l'image base64 de la réponse
    const images = data.choices?.[0]?.message?.images;
    
    if (!images || images.length === 0) {
      console.error('Structure de la réponse:', JSON.stringify(data, null, 2));
      throw new Error('Aucune image générée dans la réponse API');
    }

    // Vérifier la structure de l'image
    const imageData = images[0];
    if (!imageData?.image_url?.url) {
      console.error('Structure image invalide:', JSON.stringify(imageData, null, 2));
      throw new Error('Structure de l\'image invalide');
    }

    const imageUrl = imageData.image_url.url;
    
    console.log('Image générée avec succès');

    return new Response(
      JSON.stringify({ imageUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erreur dans generate-image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
