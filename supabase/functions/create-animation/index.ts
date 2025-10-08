import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get user from auth
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Utilisateur non authentifié' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { videoProjectId, imageIndex, mode, motionPrompt, durationTargetSec, loop } = await req.json();

    console.log('Creating animation:', { videoProjectId, imageIndex, mode });

    // Verify project belongs to user
    const { data: project, error: projectError } = await supabaseClient
      .from('video_projects')
      .select('*')
      .eq('id', videoProjectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      console.error('Project not found or access denied:', projectError);
      return new Response(
        JSON.stringify({ error: 'Projet non trouvé ou accès refusé' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify image exists in project
    const imagesData = project.images_data || [];
    if (!imagesData[imageIndex]) {
      return new Response(
        JSON.stringify({ error: 'Image non trouvée dans le projet' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create animation record
    const { data: animation, error: animationError } = await supabaseClient
      .from('animations')
      .insert({
        video_project_id: videoProjectId,
        image_index: imageIndex,
        mode: mode || 'auto',
        motion_prompt: motionPrompt,
        duration_target_sec: durationTargetSec || 5,
        loop: loop || false,
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single();

    if (animationError) {
      console.error('Failed to create animation:', animationError);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la création de l\'animation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Animation created:', animation.id);

    // TODO: Trigger Discord bot to start animation
    // For now, we'll just return the animation ID and status
    // The actual Discord integration will be implemented later

    return new Response(
      JSON.stringify({ 
        animationId: animation.id,
        status: animation.status,
        message: 'Animation créée avec succès. L\'intégration Discord sera ajoutée prochainement.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in create-animation:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erreur inconnue' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
