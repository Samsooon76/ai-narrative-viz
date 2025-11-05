import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
  createServiceClient,
  getUserFromAuth,
  checkSubscriptionMiddleware,
  incrementVideoCount,
} from "../_shared/subscription-middleware.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type ProjectImage = {
  sceneNumber?: number;
  videoUrl?: string;
} & Record<string, unknown>;

type VideoReference =
  | { type: 'url'; url: string; mimeType?: string }
  | { type: 'base64'; base64: string; mimeType?: string }
  | { type: 'binary'; buffer: Uint8Array; mimeType?: string };

const FAL_PROMPT_MAX_LENGTH = 2000;

const sanitizeFalPrompt = (value: unknown) => {
  if (typeof value !== 'string') {
    return { prompt: '', originalLength: 0 };
  }

  const collapsed = value.replace(/\s+/g, ' ').trim();
  return {
    prompt: collapsed.slice(0, FAL_PROMPT_MAX_LENGTH),
    originalLength: collapsed.length,
  };
};

const buildVideoReferenceFromString = (value: string, mimeHint?: string): VideoReference | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'url', url: trimmed, mimeType: mimeHint };
  }

  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex !== -1) {
      const meta = trimmed.slice(5, commaIndex);
      const mimeFromData = meta.split(';')[0];
      const payload = trimmed.slice(commaIndex + 1);
      return {
        type: 'base64',
        base64: payload,
        mimeType: mimeHint ?? (mimeFromData || undefined),
      };
    }
  }

  if (mimeHint && mimeHint.toLowerCase().includes('video')) {
    const base64Regex = /^[a-z0-9+/=\r\n-]+$/i;
    if (trimmed.length > 200 && base64Regex.test(trimmed)) {
      return { type: 'base64', base64: trimmed, mimeType: mimeHint };
    }
  }

  return null;
};

const pickVideoReference = (payload: unknown, mimeHint?: string): VideoReference | null => {
  if (!payload) return null;

  if (typeof payload === 'string') {
    return buildVideoReferenceFromString(payload, mimeHint);
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = pickVideoReference(item, mimeHint);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const hint =
      (typeof record.mime_type === 'string' && record.mime_type) ||
      (typeof record.mimetype === 'string' && record.mimetype) ||
      (typeof record.content_type === 'string' && record.content_type) ||
      mimeHint;

    const directKeys: Array<[keyof typeof record, string | undefined]> = [
      ['url', typeof record.url === 'string' ? record.url : undefined],
      ['video_url', typeof record.video_url === 'string' ? record.video_url : undefined],
      ['video', typeof record.video === 'string' ? record.video : undefined],
      ['content', typeof record.content === 'string' ? record.content : undefined],
    ];

    for (const [, value] of directKeys) {
      if (value) {
        const ref = buildVideoReferenceFromString(value, hint);
        if (ref) return ref;
      }
    }

    if (record.output) {
      const ref = pickVideoReference(record.output, hint);
      if (ref) return ref;
    }

    if (record.data) {
      const ref = pickVideoReference(record.data, hint);
      if (ref) return ref;
    }

    if (record.result) {
      const ref = pickVideoReference(record.result, hint);
      if (ref) return ref;
    }

    for (const value of Object.values(record)) {
      const ref = pickVideoReference(value, hint);
      if (ref) return ref;
    }
  }

  return null;
};

const normalizeVideoBuffer = async (
  reference: VideoReference,
): Promise<{ buffer: Uint8Array; mimeType: string }> => {
  if (reference.type === 'binary') {
    return { buffer: reference.buffer, mimeType: reference.mimeType ?? 'video/mp4' };
  }

  if (reference.type === 'base64') {
    const cleaned = reference.base64.replace(/\s+/g, '');
    const bytes = Uint8Array.from(atob(cleaned), (char) => char.charCodeAt(0));
    return { buffer: bytes, mimeType: reference.mimeType ?? 'video/mp4' };
  }

  const response = await fetch(reference.url);
  if (!response.ok) {
    throw new Error(`Impossible de récupérer la vidéo (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? reference.mimeType ?? 'video/mp4';
  const normalizedMime = contentType === 'application/octet-stream' ? 'video/mp4' : contentType;

  return {
    buffer: new Uint8Array(arrayBuffer),
    mimeType: normalizedMime,
  };
};

const waitForFalCompletion = async (
  statusUrl: string,
  responseUrl: string,
  headers: Record<string, string>,
  {
    pollIntervalMs = 5000,
    timeoutMs = 5 * 60 * 1000,
  }: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<Record<string, unknown>> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const statusResponse = await fetch(statusUrl, { headers });
    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      throw new Error(`Impossible de vérifier le statut Fal.ai (${statusResponse.status}): ${errorText || statusResponse.statusText}`);
    }

    const statusPayload = await statusResponse.json() as Record<string, unknown>;
    const currentStatusRaw = statusPayload.status;
    const currentStatus = typeof currentStatusRaw === 'string' ? currentStatusRaw.toUpperCase() : undefined;

    if (currentStatus === 'COMPLETED') {
      const resultResponse = await fetch(responseUrl, { headers });
      if (!resultResponse.ok) {
        const errorText = await resultResponse.text();
        throw new Error(`Impossible de récupérer le résultat Fal.ai (${resultResponse.status}): ${errorText || resultResponse.statusText}`);
      }
      return await resultResponse.json() as Record<string, unknown>;
    }

    if (currentStatus === 'FAILED' || currentStatus === 'ERROR' || currentStatus === 'CANCELLED' || currentStatus === 'CANCELED') {
      const detail =
        (typeof statusPayload.detail === 'string' && statusPayload.detail) ||
        (typeof statusPayload.error === 'string' && statusPayload.error) ||
        (typeof statusPayload.message === 'string' && statusPayload.message) ||
        JSON.stringify(statusPayload);
      throw new Error(`Fal.ai a renvoyé le statut ${currentStatus}: ${detail}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Fal.ai n\'a pas terminé dans le temps imparti.');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ============================================================================
  // MIDDLEWARE: Check user authentication and subscription quota
  // ============================================================================
  const supabaseClient = createServiceClient();
  const { user, error: authError } = await getUserFromAuth(req, supabaseClient);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: authError || 'Unauthorized' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      }
    );
  }

  // Check if user has quota available
  const quotaCheck = await checkSubscriptionMiddleware(user.id, supabaseClient, corsHeaders);
  if (quotaCheck) {
    return quotaCheck;
  }

  console.log(`✓ User ${user.email} authorized for video generation`);
  // ============================================================================

  try {
    const requestPayload = await req.json();

    const {
      imageUrl,
      prompt,
      sceneTitle,
      projectId,
      sceneNumber,
      videoNegativePrompt,
      seed,
      videoDuration,
      promptOptimizer,
    } = requestPayload;

    const { prompt: sanitizedPrompt, originalLength: promptLength } = sanitizeFalPrompt(prompt);

    if (promptLength > FAL_PROMPT_MAX_LENGTH) {
      console.log(`Prompt Fal.ai tronqué à ${FAL_PROMPT_MAX_LENGTH} caractères (longueur initiale ${promptLength}).`);
    }

    if (!imageUrl || !sanitizedPrompt || !projectId || sceneNumber === undefined) {
      return jsonResponse({ error: 'imageUrl, prompt, projectId et sceneNumber sont requis' }, 400);
    }

    if (videoNegativePrompt) {
      console.log('Paramètre videoNegativePrompt fourni mais non supporté par Fal.ai, il sera ignoré.');
    }

    if (seed !== undefined) {
      console.log('Paramètre seed fourni mais non supporté par Fal.ai, il sera ignoré.');
    }

    const FAL_KEY =
      Deno.env.get('FAL_KEY') ??
      Deno.env.get('FAL_API_KEY') ??
      Deno.env.get('FALAI_API_KEY') ??
      Deno.env.get('FAL_AI_API_KEY');

    if (!FAL_KEY) {
      return jsonResponse({
        error: 'Aucune clé API Fal.ai détectée. Configurez FAL_KEY (ou FAL_API_KEY) avec votre token.',
      }, 400);
    }

    console.log('Génération vidéo avec Fal.ai pour:', sceneTitle ?? `scène ${sceneNumber}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

      console.log('Téléchargement de l’image source avant envoi à Fal.ai...');
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        console.error(`Impossible de récupérer l'image source (${imageResponse.status})`);
        return jsonResponse({ error: `Impossible de récupérer l'image source (${imageResponse.status})` }, 400);
      }

      const imageMimeType = imageResponse.headers.get('content-type') ?? 'image/png';
      const imageArrayBuffer = await imageResponse.arrayBuffer();
      const imageUint8 = new Uint8Array(imageArrayBuffer);
      const imageBase64 = encodeBase64(imageUint8);
      const imageDataUri = `data:${imageMimeType};base64,${imageBase64}`;

      const falPayload: Record<string, unknown> = {
        image_url: imageDataUri,
        prompt: sanitizedPrompt,
      };

      const trimmedDuration = typeof videoDuration === 'string' ? videoDuration.trim() : undefined;
      if (trimmedDuration) {
        const allowedDurations = new Set(['1','2','3','4','5','6','7','8','9','10','12','15','20','30']);
        if (allowedDurations.has(trimmedDuration)) {
          falPayload.duration = trimmedDuration;
        } else {
          const numericDuration = Number(trimmedDuration);
          if (Number.isFinite(numericDuration)) {
            const clamped = Math.min(30, Math.max(1, Math.round(numericDuration)));
            falPayload.duration = String(clamped);
            console.log(`Durée vidéo '${trimmedDuration}' ajustée à ${falPayload.duration}s.`);
          } else {
            console.log(`Durée vidéo non supportée '${trimmedDuration}', la valeur par défaut sera utilisée.`);
          }
        }
      }

      if (typeof promptOptimizer === 'boolean') {
        falPayload.prompt_optimizer = promptOptimizer;
      }

      console.log('Mise en file Fal.ai Seedance v1 Lite (queue API)...');

      const falHeaders = {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      };

      const queueResponse = await fetch('https://queue.fal.run/fal-ai/bytedance/seedance/v1/lite/image-to-video', {
        method: 'POST',
        headers: falHeaders,
        body: JSON.stringify(falPayload),
      });

      if (!queueResponse.ok) {
        const errorText = await queueResponse.text();
        console.error('Erreur Fal.ai (queue):', queueResponse.status, errorText);
        return jsonResponse({ error: `Fal.ai error: ${errorText || queueResponse.statusText}` }, queueResponse.status || 500);
      }

      const queueJson = await queueResponse.json() as Record<string, unknown>;
      const statusUrl = typeof queueJson.status_url === 'string' ? queueJson.status_url : undefined;
      const responseUrl = typeof queueJson.response_url === 'string' ? queueJson.response_url : undefined;
      const requestId = typeof queueJson.request_id === 'string' ? queueJson.request_id : undefined;

      if (!statusUrl || !responseUrl) {
        console.error('Réponse Fal.ai invalide lors de la mise en file:', queueJson);
        return jsonResponse({ error: 'Réponse Fal.ai sans URLs de suivi exploitables.' }, 500);
      }

      console.log('Requête Fal.ai en attente:', { requestId, statusUrl });

      let falResult: Record<string, unknown>;
      try {
        falResult = await waitForFalCompletion(statusUrl, responseUrl, { 'Authorization': `Key ${FAL_KEY}` });
      } catch (falError) {
        console.error('Erreur Fal.ai pendant le polling:', falError);
        const message = falError instanceof Error ? falError.message : 'Erreur Fal.ai pendant la génération.';
        return jsonResponse({ error: message }, 500);
      }

      let fallbackReference: VideoReference | null = null;
      if (falResult && typeof falResult === 'object') {
        const possibleVideo = (falResult as { video?: unknown }).video;
        if (possibleVideo && typeof possibleVideo === 'object') {
          const video = possibleVideo as { url?: unknown; content_type?: unknown };
          if (typeof video.url === 'string') {
            fallbackReference = {
              type: 'url',
              url: video.url,
              mimeType: typeof video.content_type === 'string' ? video.content_type : undefined,
            };
          }
        }
      }

      const finalReference = pickVideoReference(falResult) ?? fallbackReference;

      if (!finalReference) {
        console.error('Réponse Fal.ai sans URL vidéo exploitable:', falResult);
        return jsonResponse({ error: 'Réponse Fal.ai sans URL vidéo exploitable.' }, 500);
      }

      let videoBuffer: Uint8Array;
      let resolvedMimeType: string;

      try {
        const normalized = await normalizeVideoBuffer(finalReference);
        videoBuffer = normalized.buffer;
        resolvedMimeType = normalized.mimeType;
      } catch (bufferError) {
        console.error('Erreur lors de la récupération de la vidéo générée:', bufferError);
        return jsonResponse({ error: 'Impossible de récupérer la vidéo générée.' }, 500);
      }

      const fileExtension = resolvedMimeType.includes('webm') ? 'webm' : 'mp4';
      const fileName = `scene-${sceneTitle?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || Date.now()}-${Date.now()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('animation-videos')
        .upload(fileName, videoBuffer, {
          contentType: resolvedMimeType,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Erreur upload Storage:', uploadError);
        return jsonResponse({ error: `Erreur upload Storage: ${uploadError.message}` }, 500);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('animation-videos')
        .getPublicUrl(fileName);

      console.log('Vidéo uploadée avec succès:', publicUrl);

      const { data: project } = await supabase
        .from('video_projects')
        .select('images_data')
        .eq('id', projectId)
        .single();

      if (project?.images_data) {
        const imagesData = typeof project.images_data === 'string'
          ? JSON.parse(project.images_data)
          : project.images_data;

        const updatedImages = Array.isArray(imagesData)
          ? imagesData.map((entry) => {
              if (typeof entry !== 'object' || entry === null) {
                return entry;
              }
              const imageEntry = entry as ProjectImage;
              return imageEntry.sceneNumber === sceneNumber
                ? { ...imageEntry, videoUrl: publicUrl }
                : imageEntry;
            })
          : imagesData;

        await supabase
          .from('video_projects')
          .update({ images_data: JSON.stringify(updatedImages) })
          .eq('id', projectId);
      }

      // ============================================================================
      // INCREMENT VIDEO COUNT: Video generation successful
      // ============================================================================
      console.log(`✓ Video generated successfully, incrementing count for user ${user.id}`);
      const countResult = await incrementVideoCount(user.id, supabaseClient);

      if (countResult.success) {
        console.log(`✓ Video count incremented: ${countResult.newCount}/${countResult.quota}`);
      } else {
        console.error(`❌ Failed to increment video count for user ${user.id}`);
      }
      // ============================================================================

      return new Response(
        JSON.stringify({
          status: 'completed',
          message: 'Vidéo générée avec succès',
          videoUrl: publicUrl,
          videosGenerated: countResult.newCount,
          videosQuota: countResult.quota,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

  } catch (error) {
    console.error('Erreur dans generate-video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur interne';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
