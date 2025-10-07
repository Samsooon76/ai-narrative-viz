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
    const { topic, type, script } = body;
    
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
      systemPrompt = `Tu es un scénariste expert spécialisé dans les histoires intrigantes et captivantes pour vidéos courtes. 
Tu dois créer des scripts engageants qui captivent l'audience dès les premières secondes.
Le script doit être structuré en scènes claires, avec une narration fluide et un rythme dynamique.
Durée visée: 60-90 secondes de vidéo.

Tu DOIS répondre UNIQUEMENT avec un objet JSON valide dans ce format exact:
{
  "title": "Titre accrocheur de la vidéo",
  "music": "Description de la musique d'ambiance",
  "scenes": [
    {
      "scene_number": 1,
      "title": "HOOK",
      "visual": "Description détaillée du visuel",
      "narration": "Texte de la narration"
    }
  ]
}`;

      userPrompt = `Crée un script captivant pour une vidéo sur le sujet suivant: "${topic}"

Le script doit inclure:
1. Un titre accrocheur
2. Une description de musique d'ambiance appropriée
3. 4-6 scènes avec pour chacune:
   - Un numéro de scène
   - Un titre (ex: "HOOK", "DÉVELOPPEMENT", "REBONDISSEMENT", etc.)
   - Une description visuelle détaillée
   - Le texte de narration

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
