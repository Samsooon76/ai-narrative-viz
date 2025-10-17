import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type GeminiInlineData = {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiInlineData[];
  };
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

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY non configurée');
    }

    console.log('Génération image pour:', sceneTitle, 'style:', styleId);

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

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'
        + `?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Create a highly dynamic 9:16 portrait illustration ready for animation.\n\nSTYLE FOCUS: ${resolvedStylePrompt}\n\nINSTRUCTIONS:\n- Translate any non-English text in the brief into fluent English.\n- Emphasize cinematic lighting, believable anatomy, and motion-friendly silhouettes.\n- Add environmental depth cues that support parallax for animation.\n\nSCENE TO ILLUSTRATE:\n${prompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.8,
            responseModalities: ['IMAGE'],
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur API Gemini:', response.status, errorText);
      let reason = `Gemini error ${response.status}`;
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

    const data = await response.json() as { candidates?: GeminiCandidate[] };
    const inlinePart = (data?.candidates ?? [])
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .find((part) => part.inlineData?.data);

    if (!inlinePart) {
      console.error('Structure de la réponse:', JSON.stringify(data, null, 2));
      throw new Error('Aucune donnée image générée');
    }

    const inlineData = inlinePart.inlineData ?? {};
    const mimeType = inlineData.mimeType ?? 'image/png';
    const base64Data = inlineData.data ?? '';

    console.log('Image générée avec succès, upload vers Storage...');

    // Upload vers Supabase Storage au lieu de retourner base64
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.7.1');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Créer un nom de fichier unique
    const fileName = `scene-${sceneTitle?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || Date.now()}-${Date.now()}.png`;
    const filePath = `${fileName}`;

    // Upload vers le bucket generated-images
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(filePath, imageBuffer, {
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
