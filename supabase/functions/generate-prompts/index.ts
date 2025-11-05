import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type OpenAIChoice = {
  message?: {
    content?: string;
  };
};

type OpenAIResponse = {
  choices?: OpenAIChoice[];
  error?: unknown;
};

const STYLE_MAP: Record<string, string> = {
  'arcane': `Arcane animated series. Mélange peinture numérique et traits BD réalistes, éclairages steampunk contrastés, expressions intenses.`,
  'desaturated-toon': `Toon désaturé. Ambiance sobre, palette froide, longues ombres poétiques, silhouettes épurées.`,
  'digital-noir': `Digital noir anguleux. Formes géométriques, ombrage plat, contraste dramatique vert émeraude.`,
  'bold-graphic': `Graphic novel minimaliste. Silhouettes puissantes, aplats rouges et noirs, tension dramatique.`,
  'muted-adventure': `Aventure désaturée. Palette douce, cadrages larges, atmosphère contemplative.`,
  'whimsical-cartoon': `Cartoon fantaisiste. Proportions exagérées, énergie rebondissante, couleurs acidulées.`,
  'late-night-action': `Action nocturne. Contre-jours nerveux, néons froids, tension continue.`,
  'nano-banana': `Nano Banana. Style anime réaliste saturé, détails ultra précis, néons, silhouettes prêtes à l'animation, contours nets.`,
};

const resolveStyleInstructions = (visualStyle?: string | null) => {
  const styleId = visualStyle && visualStyle !== 'none' ? visualStyle : 'nano-banana';
  const styleDescription = STYLE_MAP[styleId] ?? STYLE_MAP['nano-banana'];
  return `\n\nSTYLE VISUEL À RESPECTER: ${styleDescription}`;
};

const cleanJsonResponse = (text: string): string => {
  let clean = text.trim();

  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    clean = match[0];
  }

  return clean.trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { script, visualStyle } = body as {
      script?: string;
      visualStyle?: string;
    };

    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      console.error('❌ Erreur: script requis pour générer les prompts');
      return new Response(
        JSON.stringify({ error: 'Le script est requis pour générer les prompts d\'images' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🚀 Génération des prompts d\'images avec OpenAI');

    const styleInstructions = resolveStyleInstructions(visualStyle);

    const systemPrompt = `Tu es un expert en génération de prompts visuels pour des images générées par IA.${styleInstructions}
Tu dois analyser un script vidéo et créer des prompts détaillés pour générer des images qui illustrent parfaitement chaque moment clé.
Chaque prompt doit être en anglais, très descriptif, et optimisé pour la génération d'images AI.

⚠️ FORMAT DE RÉPONSE OBLIGATOIRE: Tu DOIS répondre UNIQUEMENT avec un objet JSON valide, SANS balises markdown, directement le JSON brut.`;

    const userPrompt = `Analyse ce script vidéo et génère UN prompt pour CHAQUE scène du script (une scène = un prompt).

Script:
${script}

⚠️ IMPORTANT:
- Génère EXACTEMENT un prompt pour CHAQUE scène du script (pas de saut, toutes les scènes doivent avoir un prompt)
- Chaque prompt doit être en anglais
- Style cinématographique cohérent
- Ajoute des détails d'atmosphère, d'éclairage et de composition
- Sois très descriptif et visuel
- Les prompts doivent correspondre exactement aux descriptions visuelles des scènes

Format JSON OBLIGATOIRE (réponds UNIQUEMENT en JSON, pas de texte avant/après):
{
  "prompts": [
    {
      "scene_number": 1,
      "scene_title": "Titre de la scène",
      "prompt": "Detailed visual prompt in English, cinematic, high quality, atmospheric lighting, 16:9 aspect ratio"
    }
  ]
}

⚠️ RÉPONDS UNIQUEMENT EN JSON. Pas de texte avant, pas de texte après, pas de balises markdown.`;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔵 UTILISATION D'OPENAI (ChatGPT) - Prompts`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY || OPENAI_API_KEY.trim().length === 0) {
      console.error('❌ OPENAI_API_KEY non trouvée dans les secrets Supabase');
      throw new Error('OPENAI_API_KEY non configurée. Configurez-la avec: supabase secrets set OPENAI_API_KEY=votre_cle');
    }

    const keyPrefix = OPENAI_API_KEY.substring(0, 12);
    console.log(`✓ Clé API OpenAI chargée (${OPENAI_API_KEY.length} caractères, préfixe: ${keyPrefix}...)`);
    console.log(`🌐 Endpoint OpenAI: https://api.openai.com/v1/chat/completions`);

    const model = 'gpt-5-nano';
    console.log(`📡 Appel API OpenAI avec le modèle: ${model}`);
    console.log('⏳ Envoi de la requête à OpenAI...');

    const requestStartTime = Date.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    const requestDuration = Date.now() - requestStartTime;
    console.log(`📥 Réponse reçue d'OpenAI après ${requestDuration}ms, status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erreur API OpenAI:', response.status, errorText);
      throw new Error(`Erreur API OpenAI: ${response.status} - ${errorText}`);
    }

    console.log('📖 Lecture du corps de la réponse...');
    const responseText = await response.text();
    console.log(`✓ Corps de la réponse lu (${responseText.length} caractères)`);

    console.log('🔄 Parsing JSON de la réponse...');
    const data = JSON.parse(responseText) as OpenAIResponse;

    if (data.error) {
      console.error('❌ Erreur dans la réponse OpenAI:', JSON.stringify(data.error));
      throw new Error(`Erreur OpenAI: ${JSON.stringify(data.error)}`);
    }

    const textContent = data?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!textContent) {
      throw new Error('Aucune réponse reçue de l\'API OpenAI');
    }

    const cleanJson = cleanJsonResponse(textContent);
    const parsed = JSON.parse(cleanJson) as { prompts?: Array<unknown> };
    const prompts = Array.isArray(parsed.prompts) ? parsed.prompts : [];

    console.log(`✅ ${prompts.length} prompts générés`);

    return new Response(
      JSON.stringify({ prompts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erreur dans generate-prompts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
