import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type GeminiTextPart = {
  text?: string;
};

type GeminiTextCandidate = {
  content?: {
    parts?: GeminiTextPart[];
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { topic, type, script, visualStyle } = body;
    
    if (!topic) {
      return new Response(
        JSON.stringify({ error: 'Le sujet est requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY non configurée');
    }

    console.log(`Génération ${type} pour le sujet:`, topic);

    let systemPrompt = '';
    let userPrompt = '';

    if (type === 'script') {
      const styleMap: Record<string, string> = {
        'arcane': `\n\nSTYLE VISUEL IMPOSÉ: Arcane animated series. Mélange peinture numérique et traits BD réalistes, éclairages steampunk contrastés, expressions intenses.` ,
        'desaturated-toon': `\n\nSTYLE VISUEL IMPOSÉ: Toon désaturé. Ambiance sobre, palette froide, longues ombres poétiques, silhouettes épurées.` ,
        'digital-noir': `\n\nSTYLE VISUEL IMPOSÉ: Digital noir anguleux. Formes géométriques, ombrage plat, contraste dramatique vert émeraude.` ,
        'bold-graphic': `\n\nSTYLE VISUEL IMPOSÉ: Graphic novel minimaliste. Silhouettes puissantes, aplats rouges et noirs, tension dramatique.` ,
        'muted-adventure': `\n\nSTYLE VISUEL IMPOSÉ: Aventure désaturée. Palette douce, cadrages larges, atmosphère contemplative.` ,
        'whimsical-cartoon': `\n\nSTYLE VISUEL IMPOSÉ: Cartoon fantaisiste. Proportions exagérées, énergie rebondissante, couleurs acidulées.` ,
        'late-night-action': `\n\nSTYLE VISUEL IMPOSÉ: Action nocturne. Contre-jours nerveux, néons froids, tension continue.` ,
        'nano-banana': `\n\nSTYLE VISUEL IMPOSÉ: Nano Banana. Style anime réaliste saturé, détails ultra précis, néons, silhouettes prêtes à l'animation, contours nets.` ,
      };

      const styleInstructions = visualStyle && visualStyle !== 'none' 
        ? styleMap[visualStyle] || styleMap['nano-banana'] || ''
        : styleMap['nano-banana'] || '';

      systemPrompt = `Tu es un scénariste expert spécialisé dans les histoires dramatiques captivantes pour vidéos courtes.${styleInstructions}

Tu DOIS répondre UNIQUEMENT avec un objet JSON valide dans ce format exact:
{
  "title": "Titre accrocheur de la vidéo",
  "music": "Description de la musique d'ambiance",
  "scenes": [
    {
      "scene_number": 1,
      "title": "CONTEXTE",
      "visual": "Description détaillée du visuel pour animation",
      "narration": "Texte de la narration",
      "speech": "Phrase courte réellement prononcée dans la scène (max 12 mots)",
      "audio_description": "Ambiance sonore immersive (musique, effets, bruitages)"
    }
  ]
}`;

      userPrompt = `Rédige une HISTOIRE dramatique en respectant le format et le rythme indiqués pour le sujet suivant: "${topic}"

Suis EXACTEMENT cette structure en 7 parties:

🟢 CONTEXTE (PARTIE 1)
- Commence par la date et le lieu : "Nous sommes en [année]. [Ville ou pays]."
- Présente les personnages et le décor en quelques lignes simples et factuelles
- Ajoute une norme culturelle ou historique choquante

🔸 PETIT REVIREMENT (PARTIE 2)
- Utilise une phrase de transition ("Et pendant un certain temps... cela a fonctionné.")
- Ajoute une ou deux phrases montrant les premiers succès ou la montée de la tension

⚫ REVIREMENT DE SITUATION (PARTIE 3)
- Montre ce qui a mal tourné
- Ajoute une trahison, une ambition ou une lutte de pouvoir
- Termine par un changement dramatique (exil, chute, tournant)

🟢 CONTEXTE (PARTIE 4)
- Montre comment le personnage principal a réagi
- Utilise des phrases d'action courtes
- Mentionne une alliance importante si cela est pertinent

🔸 PETIT REVIREMENT (PARTIE 5)
- Utilise une ligne de tension discrète
- N'en dis pas trop : mouvement furtif ou préparatoire

⚫ CONSÉQUENCE FINALE (PARTIE 6)
- Révèle l'événement majeur ou ses répercussions
- Garde le mystère

🟡 RÉVÉLATION (PARTIE 7)
- Punchline finale avec identité : "Et la [fille/l'homme/le lieu] qui a fait cela... était [nom]."

Pour CHAQUE scène, crée une description visuelle ANIMABLE:
- Inclus du mouvement et de l'action (personnages en mouvement, éléments dynamiques)
- Décris l'atmosphère et l'éclairage pour créer du drame
- Ajoute des détails visuels captivants (expressions, gestes, environnement vivant)
- Pense "cinéma" : cadrages, mouvements de caméra implicites
- Ajoute un champ "speech" avec une phrase courte prononcée (ton naturel, max 12 mots)
- Ajoute un champ "audio_description" avec l'ambiance sonore (musique, foley, bruitages précis)

 Calcule le nombre optimal de scènes pour que la vidéo finale dure entre 60 et 90 secondes (en te basant sur ~5 secondes par scène) et ajuste la structure si le sujet nécessite plus ou moins de moments clés.

IMPORTANT: Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;
    } else if (type === 'prompts') {
      systemPrompt = `Tu es un expert en génération de prompts pour Midjourney. 
Tu dois analyser un script vidéo et créer des prompts détaillés pour générer des images qui illustrent parfaitement chaque moment clé.
Chaque prompt doit être en anglais, descriptif, et optimisé pour Midjourney v6.`;

      userPrompt = `Analyse ce script et génère entre 10 et 20 prompts Midjourney pour créer le moodboard visuel:

${script}

Pour chaque scène importante, crée un prompt Midjourney détaillé.

Format JSON attendu:
{
  "prompts": [
    {
      "scene_number": 1,
      "scene_title": "Titre de la scène",
      "prompt": "Detailed Midjourney prompt in English, cinematic, high quality, --ar 16:9 --v 6"
    }
  ]
}

Critères pour les prompts:
- Utilise un style cinématographique cohérent
- Ajoute des détails d'atmosphère et de lumière
- Inclus --ar 16:9 --v 6 à la fin de chaque prompt
- Sois très descriptif et visuel`;
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY non configurée');
    }

    const model = 'gemini-2.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.8,
        },
      }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur API Gemini:', response.status, errorText);
      throw new Error(`Erreur API: ${response.status}`);
    }

    const data = await response.json() as { candidates?: GeminiTextCandidate[] };
    const textContent = (data?.candidates ?? [])
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    console.log(`${type} généré avec succès`);

    // Pour les scripts, parser le JSON
    const cleanJson = textContent.replace(/```json|```/g, '').trim();

    if (type === 'script') {
      try {
        const parsedScript = JSON.parse(cleanJson);
        return new Response(
          JSON.stringify({ script: parsedScript }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('Erreur parsing JSON script:', e);
        throw new Error(`Impossible de parser le script généré: ${textContent}`);
      }
    }

    if (type === 'prompts') {
      // Parse le JSON des prompts
      try {
        const parsedPrompts = JSON.parse(cleanJson);
        return new Response(
          JSON.stringify({ prompts: parsedPrompts.prompts ?? [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('Erreur parsing JSON prompts:', e);
        throw new Error(`Impossible de parser les prompts générés: ${textContent}`);
      }
    }

    return new Response(
      JSON.stringify({ content: textContent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erreur dans generate-script:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
