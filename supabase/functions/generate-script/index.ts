import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Types pour OpenAI API Response
type OpenAIChoice = {
  message?: {
    content?: string;
  };
};

type OpenAIResponse = {
  choices?: OpenAIChoice[];
  error?: unknown;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { topic, visualStyle } = body as {
      topic?: string;
      visualStyle?: string;
    };

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      console.error('❌ Erreur: topic requis pour la génération du script');
      return new Response(
        JSON.stringify({ error: 'Le sujet (topic) est requis pour générer un script' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 Génération du script avec OpenAI pour le sujet:`, topic);

    let systemPrompt = '';
    let userPrompt = '';

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

      systemPrompt = `Tu es un générateur automatique de scripts vidéo.${styleInstructions}

INSTRUCTIONS CRITIQUES:
- Réponds IMMÉDIATEMENT en JSON brut, sans Markdown ni texte autour.
- NE FOURNIS AUCUN RAISONNEMENT, aucune explication, aucun commentaire.
- Le système calcule ensuite les durées: ne fournis pas ces valeurs.

FORMAT EXACT:
{
  "title": "...",
  "music": "...",
  "scenes": [
    {
      "scene_number": 1,
      "title": "...",
      "visual": "description visuelle concise (≤22 mots)",
      "narration": "phrase parlée (8-16 mots)",
      "audio_description": "ambiance sonore (≤10 mots)"
    }
  ]
}

RÈGLES:
- Génère exactement 16 à 18 scènes.
- Phrases courtes, temps présent.
- Ton cinématographique simple. Aucun texte hors du JSON.`;

      userPrompt = `Sujet: "${topic}"

Consignes rapides:
- Script rythmé et mystérieux, conclusion surprenante.
- Chaque scène doit faire avancer l'action ou la révélation.
- Utilise un vocabulaire simple et visuel.
- Produis directement le JSON final sans réfléchir étape par étape.`;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔵 UTILISATION D'OPENAI (ChatGPT) - Script`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Récupération de la clé API OpenAI depuis les secrets Supabase
    // Les secrets configurés avec 'supabase secrets set OPENAI_API_KEY=...' sont automatiquement 
    // disponibles dans les edge functions via Deno.env.get()
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY || OPENAI_API_KEY.trim().length === 0) {
      console.error('❌ OPENAI_API_KEY non trouvée dans les secrets Supabase');
      console.error('Vérifiez que le secret est bien configuré avec: supabase secrets list');
      throw new Error('OPENAI_API_KEY non configurée. Configurez-la avec: supabase secrets set OPENAI_API_KEY=votre_cle');
    }
    
    // Log de confirmation (on ne log que le préfixe pour la sécurité)
    const keyPrefix = OPENAI_API_KEY.substring(0, 12);
    console.log(`✓ Clé API OpenAI chargée (${OPENAI_API_KEY.length} caractères, préfixe: ${keyPrefix}...)`);
    console.log(`🌐 Endpoint OpenAI: https://api.openai.com/v1/chat/completions`);

    // Utiliser uniquement gpt-5-nano
    const model = 'gpt-5-nano';
    console.log(`📡 Appel API OpenAI avec le modèle: ${model}`);
    console.log(`⏳ Envoi de la requête à OpenAI...`);
    
    try {
      const requestStartTime = Date.now();
      const response = await fetch(
        'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            input: [
              {
                role: 'system',
                content: [
                  {
                    type: 'input_text',
                    text: systemPrompt,
                  },
                ],
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: userPrompt,
                  },
                ],
              },
            ],
            reasoning: {
              effort: 'minimal',
            },
            text: {
              format: {
                type: 'json_object',
              },
            },
          }),
        }
      );

      const requestDuration = Date.now() - requestStartTime;
      console.log(`📥 Réponse reçue d'OpenAI après ${requestDuration}ms, status: ${response.status}`);

      const processingMs = response.headers.get('openai-processing-ms');
      const requestId = response.headers.get('x-request-id');
      const cfRay = response.headers.get('cf-ray');
      if (processingMs) {
        console.log(`🧮 openai-processing-ms: ${processingMs}`);
      }
      if (requestId) {
        console.log(`🆔 OpenAI request id: ${requestId}`);
      }
      if (cfRay) {
        console.log(`☁️ Cloudflare ray: ${cfRay}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erreur API OpenAI:', response.status, errorText);
        throw new Error(`Erreur API OpenAI: ${response.status} - ${errorText}`);
      }

      console.log(`📖 Lecture du corps de la réponse...`);
      const responseText = await response.text();
      console.log(`✓ Corps de la réponse lu (${responseText.length} caractères)`);
      
      console.log(`🔄 Parsing JSON de la réponse...`);
      const data = JSON.parse(responseText) as any;
      console.log(`✓ JSON parsé avec succès`);

      if (data?.error) {
        console.error('❌ Erreur dans la réponse OpenAI:', JSON.stringify(data.error));
        throw new Error(`Erreur OpenAI: ${JSON.stringify(data.error)}`);
      }

      console.log(`✅ Réponse réussie avec le modèle: ${model}`);

      let textContent = '';
      const outputItems = Array.isArray(data?.output) ? data.output : [];
      for (const item of outputItems) {
        const contentBlocks = Array.isArray(item?.content) ? item.content : [];
        for (const block of contentBlocks) {
          if (typeof block?.text === 'string') {
            textContent += block.text;
          } else if (Array.isArray(block?.content)) {
            for (const nested of block.content) {
              if (typeof nested?.text === 'string') {
                textContent += nested.text;
              }
            }
          }
        }
      }
      textContent = textContent.trim();
      
      if (!textContent) {
        throw new Error('Aucune réponse reçue de l\'API OpenAI');
      }
      
      console.log(`✓ Script généré avec le modèle: ${model}`);
      console.log(`Script généré avec succès`);
      console.log(`Réponse OpenAI (premiers 200 caractères): ${textContent.substring(0, 200)}...`);

      // Pour les scripts, parser le JSON
      // OpenAI avec response_format: { type: 'json_object' } devrait retourner directement du JSON valide
      let cleanJson = textContent.trim();
    
      // Nettoyer si OpenAI a quand même ajouté des balises markdown (ne devrait pas arriver avec json_object mais au cas où)
      if (cleanJson.startsWith('```')) {
        // Retirer les balises markdown si présentes
        cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      }
      
      // Extraire le JSON s'il y a du texte autour (ne devrait pas arriver mais au cas où)
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }
      
      // Enlever les espaces superflus
      cleanJson = cleanJson.trim();
      
      console.log(`JSON nettoyé (premiers 200 caractères): ${cleanJson.substring(0, 200)}...`);

      try {
        const parsedScript = JSON.parse(cleanJson);

        const rawScenes = Array.isArray(parsedScript?.scenes) ? parsedScript.scenes : [];
        if (rawScenes.length < 16 || rawScenes.length > 20) {
          throw new Error(`Script invalide: ${rawScenes.length} scènes. Attendu entre 16 et 20 scènes.`);
        }

        let totalDuration = 0;
        let totalWords = 0;

        const enrichedScenes = rawScenes.map((rawScene: any, index: number) => {
          const narrationRaw = typeof rawScene?.narration === 'string' ? rawScene.narration : '';
          const narration = narrationRaw.trim();
          const wordCount = narration.length > 0 ? narration.split(/\s+/).filter(Boolean).length : 0;
          totalWords += wordCount;

          let duration = Number((wordCount / 3.2).toFixed(1));
          if (!Number.isFinite(duration)) {
            duration = 2.0;
          }
          duration = Math.max(2.0, Math.min(5.0, duration));
          totalDuration += duration;

          return {
            ...rawScene,
            scene_number: index + 1,
            narration,
            duration_seconds: duration,
          };
        });

        const totalDurationRounded = Number(totalDuration.toFixed(1));

        parsedScript.scene_count = enrichedScenes.length;
        parsedScript.total_duration_seconds = totalDurationRounded;
        parsedScript.scenes = enrichedScenes;

        if (totalWords < 140 || totalWords > 260) {
          console.warn(`⚠️ Narration totale hors plage cible: ${totalWords} mots.`);
        }

        if (totalDurationRounded < 55 || totalDurationRounded > 100) {
          console.warn(`⚠️ Durée totale hors plage cible: ${totalDurationRounded}s.`);
        }

        console.log(`✓ Script valide: ${enrichedScenes.length} scènes, ${totalDurationRounded}s total, ${totalWords} mots.`);

        return new Response(
          JSON.stringify({ script: parsedScript }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('Erreur script:', e);
        const errorMsg = e instanceof Error ? e.message : 'Impossible de parser le script généré';
        throw new Error(errorMsg);
      }

    } catch (error) {
      console.error('❌ Exception lors de l\'appel OpenAI:', error);
      throw error;
    }

  } catch (error) {
    console.error('Erreur dans generate-script:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
