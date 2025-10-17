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
    const {
      prompt,
      sceneTitle,
      styleId,
      stylePrompt,
    } = await req.json();
    
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Le prompt est requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FAL_KEY =
      Deno.env.get('FAL_KEY') ??
      Deno.env.get('FAL_API_KEY') ??
      Deno.env.get('FALAI_API_KEY') ??
      Deno.env.get('FAL_AI_API_KEY');

    if (!FAL_KEY) {
      throw new Error('Aucune clé API Fal.ai détectée. Configurez FAL_KEY (ou FAL_API_KEY) avec votre token.');
    }

    console.log('Génération image avec Minimax pour:', sceneTitle, 'style:', styleId);

    const DEFAULT_STYLE_ID = 'nano-banana';
    const STYLE_LIBRARY: Record<string, string> = {
      'arcane': 'Arcane animated series look, painterly steampunk lighting, vivid rim glow, expressive portraits, layered brush textures.',
      'desaturated-toon': 'Muted atmospheric 2D toon, long expressive shadows, soft mist, refined silhouettes, understated palette.',
      'digital-noir': 'Angular neo-noir graphic novel, hard-edged shading, geometric shapes, teal-green monochrome, cinematic contrast.',
      'bold-graphic': 'Bold poster-like comic art, thick silhouettes, crisp graphic blocks, red-and-black high contrast, strong negative space.',
      'muted-adventure': 'Soft cinematic adventure painting, wide depth, earthy palette, atmospheric haze, story-rich environmental cues.',
      'whimsical-cartoon': 'Playful surreal animation style, exaggerated proportions, bouncing curves, candy colors, lively expressions.',
      'late-night-action': 'Nighttime action anime, backlit silhouettes, sharp highlights, tense motion, neon reflections.',
      [DEFAULT_STYLE_ID]: 'Nano Banana stylized anime realism, saturated neon palette, hyper detailed characters, precise contour lines, motion-friendly staging, dynamic lighting.'
    };

    const resolvedStyleId = (typeof styleId === 'string' && styleId.trim().length > 0) ? styleId.trim() : DEFAULT_STYLE_ID;
    const fallbackStyle = STYLE_LIBRARY[resolvedStyleId] ?? STYLE_LIBRARY[DEFAULT_STYLE_ID];
    const resolvedStylePrompt = (typeof stylePrompt === 'string' && stylePrompt.trim().length > 0)
      ? stylePrompt.trim()
      : fallbackStyle;

    // Construire le prompt complet pour Minimax
    const fullPrompt = `Create a highly dynamic 9:16 portrait illustration ready for animation.\n\nSTYLE FOCUS: ${resolvedStylePrompt}\n\nINSTRUCTIONS:\n- Emphasize cinematic lighting, believable anatomy, and motion-friendly silhouettes.\n- Add environmental depth cues that support parallax for animation.\n\nSCENE TO ILLUSTRATE:\n${prompt}`;

    // Limiter le prompt à 1500 caractères (max Minimax)
    const truncatedPrompt = fullPrompt.length > 1500 ? fullPrompt.substring(0, 1500) : fullPrompt;

    console.log('Appel fal.ai avec prompt longueur:', truncatedPrompt.length);

    const falHeaders = {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(
      'https://queue.fal.run/fal-ai/minimax/image-01',
      {
        method: 'POST',
        headers: falHeaders,
        body: JSON.stringify({
          prompt: truncatedPrompt,
          aspect_ratio: '9:16',
          num_images: 1,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur API Minimax:', response.status, errorText);
      let reason = `Minimax error ${response.status}`;
      try {
        const parsed = JSON.parse(errorText);
        const message = parsed?.error?.message || parsed?.message || parsed?.error || parsed;
        if (typeof message === 'string') {
          reason += `: ${message}`;
        }
      } catch (_) {
        if (errorText) {
          reason += `: ${errorText}`;
        }
      }
      throw new Error(reason);
    }

    const data = await response.json() as { images?: Array<{ url?: string; content_type?: string }> };
    const images = data?.images ?? [];
    const firstImage = images[0];

    if (!firstImage?.url) {
      console.error('Structure de la réponse Minimax:', JSON.stringify(data, null, 2));
      throw new Error('Aucune image générée par Minimax');
    }

    const imageUrl = firstImage.url;
    const mimeType = firstImage.content_type ?? 'image/png';

    // Récupérer l'image depuis l'URL fournie par Minimax
    console.log('Téléchargement de l\'image depuis Minimax...');
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Impossible de récupérer l'image de Minimax (${imageResponse.status})`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageUint8 = new Uint8Array(imageBuffer);

    console.log('Image générée avec succès, upload vers Storage...');

    // Upload vers Supabase Storage
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.7.1');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Créer un nom de fichier unique
    const fileName = `scene-${sceneTitle?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || Date.now()}-${Date.now()}.png`;
    const filePath = `${fileName}`;

    // Upload vers le bucket generated-images
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(filePath, imageUint8, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Erreur upload Storage:', uploadError);
      throw new Error(`Erreur upload: ${uploadError.message}`);
    }

    // Obtenir l'URL publique
    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(filePath);

    console.log('Image uploadée avec succès:', publicUrl);

    return new Response(
      JSON.stringify({ imageUrl: publicUrl, styleId: resolvedStyleId, stylePrompt: resolvedStylePrompt }),
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
