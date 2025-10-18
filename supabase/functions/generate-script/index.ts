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

⚠️ INSTRUCTION STRICTE: Tu DOIS générer ENTRE 15 ET 20 SCÈNES EXACTEMENT. Pas 12, pas 25. ENTRE 15 ET 20. C'EST OBLIGATOIRE.

Tu DOIS répondre UNIQUEMENT avec un objet JSON valide dans ce format exact:
{
  "title": "Titre accrocheur de la vidéo",
  "music": "Description de la musique d'ambiance",
  "total_duration_seconds": 78,
  "scene_count": 17,
  "scenes": [
    {
      "scene_number": 1,
      "title": "CONTEXTE",
      "duration_seconds": 4.2,
      "visual": "Description détaillée du visuel pour animation",
      "narration": "Texte de la narration",
      "speech": "Phrase courte réellement prononcée dans la scène (max 12 mots)",
      "audio_description": "Ambiance sonore immersive (musique, effets, bruitages)"
    }
  ]
}`;

      userPrompt = `Rédige une HISTOIRE dramatique en respectant le format et le rythme indiqués pour le sujet suivant: "${topic}"

⚠️ CONTRAINTE NUMERO 1 - OBLIGATOIRE - NOMBRE DE SCENES:
🔴 TU DOIS GÉNÉRER ENTRE 15 ET 20 SCÈNES. PAS 12. PAS 25. ENTRE 15 ET 20.
🔴 Si tu génères moins de 15 scènes, ta réponse est INVALIDE.
🔴 Si tu génères plus de 20 scènes, ta réponse est INVALIDE.
🔴 C'est la contrainte la plus importante. Compte tes scènes avant de répondre.

⚠️ CONTRAINTE MAJEURE SUR LE CONTENU:
- La narration TOTALE (texte uniquement, excluant titles et descriptions visuelles) DOIT faire entre 190 et 210 mots EXACTEMENT
- NE RÉVÈLE JAMAIS l'identité précise du personnage principal (utilise des pronoms, descriptions vagues, mystère)
- NE RÉVÈLE JAMAIS l'action exacte qui a changé le monde jusqu'à la fin
- Garde du SUSPENS et de l'INTRIGUE durant tout le script
- Les révélations doivent être progressives et énigmatiques

🎬 CONTRAINTE MAJEURE SUR LA STRUCTURE TEMPORELLE (OBLIGATOIRE):
- 🔴 GÉNÈRE ENTRE 15 ET 20 SCÈNES (répétition: c'est TRÈS important)
- CHAQUE scène DOIT avoir une durée entre 2.0 et 5.5 secondes
- La durée TOTALE de la vidéo DOIT être entre 60 et 90 secondes
- Varie les durées (ex: 3.2s, 5.5s, 2.1s, 4.8s) pour un meilleur rythme cinématographique
- Les scènes plus courtes (2-3s) = moments chocs, transitions rapides, suspense
- Les scènes plus longues (4.5-5.5s) = révélations, développement d'ambiance, dialogues
- IMPORTANT: La durée doit être COHÉRENTE avec le texte de narration (plus de texte = plus de temps)
- Calcule: total_duration_seconds = somme(duration_seconds de toutes les scènes)
- Ajoute un champ "scene_count": nombre exact de scènes

Suis EXACTEMENT cette structure en 7 parties:

🟢 CONTEXTE (PARTIE 1) - 2-3 scènes
- Commence par la date et le lieu : "Nous sommes en [année]. [Ville ou pays]."
- Présente les personnages et le décor sans révéler les détails cruciaux
- Ajoute une norme culturelle ou historique choquante

🔸 PETIT REVIREMENT (PARTIE 2) - 2-3 scènes
- Utilise une phrase de transition ("Et pendant un certain temps... cela a fonctionné.")
- Montre une montée de la tension sans révéler vers où
- Sème des indices énigmatiques

⚫ REVIREMENT DE SITUATION (PARTIE 3) - 2-3 scènes (rythme rapide)
- Montre ce qui a mal tourné DE FAÇON VAGUE
- Utilise des allusions plutôt que des explications directes
- Termine par un changement dramatique

🟢 CONTEXTE (PARTIE 4) - 2-3 scènes
- Montre comment le protagoniste mystérieux a réagi
- Utilise des mouvements énigmatiques
- Garde l'identité floue

🔸 PETIT REVIREMENT (PARTIE 5) - 2-3 scènes
- Ligne de tension discrète
- Un détail qui pourrait changer tout, mais sans révélation

⚫ CONSÉQUENCE FINALE (PARTIE 6) - 2-3 scènes (rythme accéléré)
- Accumule la tension
- L'action transformatrice commence à se dévoiler... partiellement

🟡 RÉVÉLATION (PARTIE 7) - 2-4 scènes (1-2 scènes longues pour l'impact)
- Punchline finale : Enfin révèle ce qui s'est VRAIMENT passé et qui l'a fait
- Doit surprendre et captiver
- Exemple: "Et celui qui a transformé l'histoire... était quelqu'un de complètement inattendu."

Pour CHAQUE scène, crée une description visuelle ANIMABLE:
- Inclus du mouvement et de l'action (personnages en mouvement, éléments dynamiques)
- Décris l'atmosphère et l'éclairage pour créer du drame
- Ajoute des détails visuels captivants (expressions, gestes, environnement vivant)
- Pense "cinéma" : cadrages, mouvements de caméra implicites
- Ajoute un champ "speech" avec une phrase courte prononcée (ton naturel, max 12 mots)
- Ajoute un champ "audio_description" avec l'ambiance sonore (musique, foley, bruitages précis)

CALCUL TEMPOREL OBLIGATOIRE (À FAIRE AVANT DE RÉPONDRE):
1. 🔴 Compte le nombre exact de scènes (DOIT être 15-20, sinon recommence)
2. Attribue une durée_seconds à CHAQUE scène entre 2.0 et 5.5 secondes (varié)
3. Calcule: SUM(duration_seconds) = somme de toutes les durées (DOIT être 60-90)
4. Insère dans le JSON:
   - "scene_count": nombre exact de scènes
   - "total_duration_seconds": somme exacte des durées

VÉRIFICATION FINALE (À FAIRE AVANT DE RÉPONDRE):
- ❌ Si nombre de scènes < 15 ou > 20 → INVALIDE, recommence
- ❌ Si une scène < 2.0s ou > 5.5s → INVALIDE, recommence
- ❌ Si total < 60s ou > 90s → INVALIDE, recommence
- ❌ Si mots de narration < 190 ou > 210 → INVALIDE, recommence

EXEMPLE DE RÉPONSE VALIDE:
{
  "title": "Titre",
  "music": "Description",
  "scene_count": 17,
  "total_duration_seconds": 75.2,
  "scenes": [
    {"scene_number": 1, "duration_seconds": 4.2, ...},
    {"scene_number": 2, "duration_seconds": 3.1, ...},
    ... (15 à 20 scènes total)
  ]
}

IMPORTANT - À RELIRE AVANT DE RÉPONDRE:
- Compte les mots de narration: DOIT être 190-210
- Compte les scènes: DOIT être 15-20 (PAS 12, PAS 25)
- Vérifiez chaque durée: DOIT être 2.0-5.5
- Vérifiez le total: DOIT être 60-90 secondes
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;
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

        // Validation stricte du nombre de scènes
        const sceneCount = parsedScript?.scenes?.length ?? 0;
        if (sceneCount < 15 || sceneCount > 20) {
          throw new Error(
            `Script invalide: ${sceneCount} scènes générées. DOIT être entre 15 et 20 scènes exactement. ` +
            `Regénère le script avec le bon nombre de scènes.`
          );
        }

        // Validation des durées
        let totalDuration = 0;
        parsedScript.scenes?.forEach((scene: any, index: number) => {
          const duration = scene.duration_seconds ?? 0;
          if (duration < 2.0 || duration > 5.5) {
            throw new Error(
              `Scène ${index + 1}: durée invalide (${duration}s). ` +
              `Chaque scène DOIT faire entre 2.0 et 5.5 secondes.`
            );
          }
          totalDuration += duration;
        });

        if (totalDuration < 60 || totalDuration > 90) {
          throw new Error(
            `Durée totale invalide: ${totalDuration.toFixed(1)}s. ` +
            `DOIT être entre 60 et 90 secondes exactement.`
          );
        }

        // Ajoute les champs calculés
        parsedScript.scene_count = sceneCount;
        parsedScript.total_duration_seconds = Math.round(totalDuration * 10) / 10;

        console.log(`✓ Script valide: ${sceneCount} scènes, ${parsedScript.total_duration_seconds}s total`);

        return new Response(
          JSON.stringify({ script: parsedScript }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('Erreur script:', e);
        const errorMsg = e instanceof Error ? e.message : 'Impossible de parser le script généré';
        throw new Error(errorMsg);
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
