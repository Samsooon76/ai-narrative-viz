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
        'desaturated-toon': `\n\nSTYLE VISUEL IMPOSÉ: Desaturated Atmospheric Toon Style (Niji 6)
- Ambiance sérieuse, style toon 2D désaturé mais cinématique
- Ombres longues et subtiles, brume légère
- Rythme poétique et calme
- Exemple: un guerrier silencieux marchant sur un chemin de montagne vide
- Style: desaturated 2D toon style, long shadows, subtle mist, poetic pacing --niji 6 --ar 16:9`,
        
        'digital-noir': `\n\nSTYLE VISUEL IMPOSÉ: Digital Noir Angular Realism (v7)
- Style cartoon néo-minimaliste avec angles marqués
- Ombrage plat, ombres aux contours durs, traits faciaux géométriques
- Éclairage cinématique sombre, palette monochrome verte
- Contours épais, frame d'animation 2D
- Style: sharp-angled neo-minimalist cartoon style, flat shading, hard-edged shadows, geometric features, dark cinematic lighting --v 7`,
        
        'bold-graphic': `\n\nSTYLE VISUEL IMPOSÉ: Bold Graphic Minimalism (v7)
- Minimalisme graphique audacieux
- Silhouettes fortes, tons plats, tension dramatique
- Ombres aux bords nets, palette rouge-noir
- Atmosphère stylisée de bande dessinée
- Style: bold graphic minimalism, sharp-edged shadows, red-black color scheme, stylized comic atmosphere --v 7 --style raw --ar 16:9`,
        
        'muted-adventure': `\n\nSTYLE VISUEL IMPOSÉ: Muted Desaturated Adventure Style (v7)
- Style animation désaturé et doux
- Cadrage large, calme, storytelling par silhouettes
- Palette limitée, ambiance poétique
- Composition paysage large
- Style: muted desaturated animation style, limited palette, poetic vibe, wide landscape composition --v 7 --ar 16:9`,
        
        'whimsical-cartoon': `\n\nSTYLE VISUEL IMPOSÉ: Cracked-Egg Whimsical Cartoon Style (Niji 6)
- Proportions bizarres, énergie rebondissante
- Formes étranges, chaos joyeux et fun
- Univers décalé et ludique
- Style: cracked-egg whimsical cartoon style, weird shapes, joyful chaos --niji 6 --ar 16:9`,
        
        'late-night-action': `\n\nSTYLE VISUEL IMPOSÉ: Late-Night Toonline Action Style (v7)
- Ton sérieux, animation précise
- Ambiance lourde et nocturne
- Silhouettes en contre-jour, énergie de dialogue minimal
- Style: late-night toonline action style, backlight silhouette, minimal dialogue energy --v 7 --ar 16:9`
      };

      const styleInstructions = visualStyle && visualStyle !== 'none' 
        ? styleMap[visualStyle] || ''
        : '';

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
      "narration": "Texte de la narration"
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

Le script doit contenir 10-12 scènes au total (durée visée: 60 secondes).

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

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
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
    const content = data.choices[0].message.content;
    
    console.log(`${type} généré avec succès`);

    // Pour les scripts, parser le JSON
    if (type === 'script') {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedScript = JSON.parse(jsonMatch[0]);
          return new Response(
            JSON.stringify({ script: parsedScript }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw new Error('Format JSON invalide dans la réponse');
      } catch (e) {
        console.error('Erreur parsing JSON script:', e);
        throw new Error('Impossible de parser le script généré');
      }
    }

    if (type === 'prompts') {
      // Parse le JSON des prompts
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedPrompts = JSON.parse(jsonMatch[0]);
          return new Response(
            JSON.stringify({ prompts: parsedPrompts.prompts }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e) {
        console.error('Erreur parsing JSON prompts:', e);
      }
    }

    return new Response(
      JSON.stringify({ content }),
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
