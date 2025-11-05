import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createServiceClient,
  getUserFromAuth,
  checkSubscriptionMiddleware,
} from "../_shared/subscription-middleware.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FAL_PROMPT_MAX_LENGTH = 2000;
const DEFAULT_IMAGE_SIZE = "landscape_16_9";
const DEFAULT_IMAGE_RESOLUTION = "480p";
const DEFAULT_IMAGE_COUNT = 4;
const DEFAULT_GUIDANCE = 3.5;
const DEFAULT_STEPS = 4;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 240000;

const sanitizeFalPrompt = (value: unknown) => {
  const raw = typeof value === "string" ? value : "";
  const collapsed = raw.replace(/\s+/g, " ").trim();

  if (!collapsed) {
    return { prompt: "", originalLength: 0 } as const;
  }

  if (collapsed.length <= FAL_PROMPT_MAX_LENGTH) {
    return { prompt: collapsed, originalLength: collapsed.length } as const;
  }

  return {
    prompt: collapsed.slice(0, FAL_PROMPT_MAX_LENGTH),
    originalLength: collapsed.length,
  } as const;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getFalKey = () => {
  const key =
    Deno.env.get("FAL_KEY") ??
    Deno.env.get("FAL_API_KEY") ??
    Deno.env.get("FALAI_API_KEY") ??
    Deno.env.get("FAL_AI_API_KEY");

  if (!key || key.trim().length === 0) {
    throw new Error("Aucune clé API Fal.ai détectée. Configurez FAL_KEY (ou FAL_API_KEY).");
  }

  return key.trim();
};

const getRuntimeConfig = () => {
  const pollIntervalRaw = Deno.env.get("FAL_IMAGE_POLL_INTERVAL_MS") ?? Deno.env.get("FAL_QUEUE_POLL_INTERVAL_MS");
  const timeoutRaw = Deno.env.get("FAL_IMAGE_TIMEOUT_MS") ?? Deno.env.get("FAL_QUEUE_TIMEOUT_MS");

  const pollIntervalMs = Number.parseInt(pollIntervalRaw ?? "", 10);
  const timeoutMs = Number.parseInt(timeoutRaw ?? "", 10);

  return {
    pollIntervalMs: Number.isFinite(pollIntervalMs) && pollIntervalMs > 0 ? pollIntervalMs : DEFAULT_POLL_INTERVAL_MS,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  } as const;
};

const waitForFalCompletion = async (
  statusUrl: string,
  responseUrl: string,
  headers: HeadersInit,
  pollIntervalMs: number,
  timeoutMs: number,
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusResponse = await fetch(statusUrl, { headers });
    if (!statusResponse.ok) {
      const text = await statusResponse.text();
      throw new Error(`Fal.ai status request a échoué (${statusResponse.status}): ${text}`);
    }

    const statusPayload = await statusResponse.json() as { status?: string; state?: string; logs?: Array<{ message?: string }> };
    const status = (statusPayload.status ?? statusPayload.state ?? "").toString().toUpperCase();

    if (status === "COMPLETED" || status === "FINISHED" || status === "SUCCESS") {
      const response = await fetch(responseUrl, { headers });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Fal.ai response request a échoué (${response.status}): ${text}`);
      }
      return await response.json() as Record<string, unknown>;
    }

    if (status === "FAILED" || status === "ERROR") {
      const logs = Array.isArray(statusPayload.logs) ? statusPayload.logs.map((entry) => entry?.message).filter(Boolean) : [];
      const joinedLogs = logs.length ? ` Logs: ${logs.join(" | ")}` : "";
      throw new Error(`Fal.ai a indiqué un échec.${joinedLogs}`);
    }

    await sleep(pollIntervalMs);
  }

  throw new Error("Fal.ai n'a pas terminé la génération dans le temps imparti.");
};

const collectImageUrls = (source: unknown): string[] => {
  const urls = new Set<string>();
  const visited = new WeakSet<object>();

  const pushUrl = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      urls.add(trimmed);
    }
  };

  const inspect = (value: unknown) => {
    if (!value) return;

    if (typeof value === "string") {
      pushUrl(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        inspect(item);
      }
      return;
    }

    if (typeof value === "object") {
      const record = value as Record<string, unknown>;

      if (visited.has(record)) {
        return;
      }
      visited.add(record);

      pushUrl(record.url);
      pushUrl(record.image_url);
      pushUrl(record.imageUrl);
      pushUrl(record.image);
      pushUrl(record.secure_url);

      const nestedKeys = [
        "images",
        "imageUrls",
        "image_urls",
        "output",
        "outputs",
        "result",
        "data",
        "predictions",
      ];

      for (const key of nestedKeys) {
        if (key in record) {
          inspect(record[key]);
        }
      }
    }
  };

  inspect(source);
  return Array.from(urls);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ============================================================================
    // MIDDLEWARE: Check user authentication and subscription quota
    // ============================================================================
    const supabase = createServiceClient();
    const { user, error: authError } = await getUserFromAuth(req, supabase);

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
    const quotaCheck = await checkSubscriptionMiddleware(user.id, supabase, corsHeaders);
    if (quotaCheck) {
      return quotaCheck;
    }

    console.log(`✓ User ${user.email} authorized for image generation`);
    // ============================================================================

    const body = await req.json();
    const {
      prompt,
      sceneTitle,
      styleId,
      stylePrompt,
      numImages,
      guidanceScale,
      numInferenceSteps,
      imageSize,
      imageResolution,
    } = body ?? {};

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Le prompt est requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt: sanitizedPrompt, originalLength } = sanitizeFalPrompt(prompt);
    if (!sanitizedPrompt) {
      return new Response(JSON.stringify({ error: "Prompt Fal.ai vide après normalisation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (originalLength > sanitizedPrompt.length) {
      console.log(`Prompt Fal.ai tronqué de ${originalLength} à ${sanitizedPrompt.length} caractères.`);
    }

    const falKey = getFalKey();
    const { pollIntervalMs, timeoutMs } = getRuntimeConfig();

    const requestedImageCount = typeof numImages === "number" && Number.isFinite(numImages) && numImages > 0
      ? Math.min(Math.max(Math.floor(numImages), 1), 8)
      : DEFAULT_IMAGE_COUNT;

    const falPayload: Record<string, unknown> = {
      prompt: sanitizedPrompt,
      image_size: typeof imageSize === "string" && imageSize.trim().length > 0 ? imageSize.trim() : DEFAULT_IMAGE_SIZE,
      image_resolution: typeof imageResolution === "string" && imageResolution.trim().length > 0
        ? imageResolution.trim()
        : DEFAULT_IMAGE_RESOLUTION,
      num_images: requestedImageCount,
    };

    if (typeof guidanceScale === "number" && Number.isFinite(guidanceScale)) {
      falPayload.guidance_scale = guidanceScale;
    } else {
      falPayload.guidance_scale = DEFAULT_GUIDANCE;
    }

    if (typeof numInferenceSteps === "number" && Number.isFinite(numInferenceSteps)) {
      falPayload.num_inference_steps = numInferenceSteps;
    } else {
      falPayload.num_inference_steps = DEFAULT_STEPS;
    }

    console.log("Déclenchement Fal.ai flux/schnell pour:", sceneTitle ?? "scène sans titre");

    const falHeaders: HeadersInit = {
      "Authorization": `Key ${falKey}`,
      "Content-Type": "application/json",
    };

    const queueResponse = await fetch("https://queue.fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: falHeaders,
      body: JSON.stringify(falPayload),
    });

    if (!queueResponse.ok) {
      const errorText = await queueResponse.text();
      console.error("Erreur Fal.ai (queue):", queueResponse.status, errorText);
      return new Response(JSON.stringify({ error: errorText || queueResponse.statusText }), {
        status: queueResponse.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queuePayload = await queueResponse.json() as { status_url?: string; response_url?: string; request_id?: string; error?: unknown };
    console.log("Fal.ai queue payload:", queuePayload);
    const statusUrl = queuePayload.status_url;
    const responseUrl = queuePayload.response_url;
    const requestId = queuePayload.request_id;

    if (!statusUrl || !responseUrl) {
      console.error("Réponse queue Fal.ai invalide:", queuePayload);
      return new Response(JSON.stringify({ error: "Réponse Fal.ai sans URLs de suivi." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let falResult: Record<string, unknown>;
    try {
      falResult = await waitForFalCompletion(statusUrl, responseUrl, falHeaders, pollIntervalMs, timeoutMs);
      console.log("Fal.ai result payload received");
    } catch (falError) {
      console.error("Erreur Fal.ai durant le polling:", falError);
      const message = falError instanceof Error ? falError.message : "Erreur Fal.ai durant la génération.";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrls = collectImageUrls(falResult);

    if (!imageUrls.length) {
      console.error("Réponse Fal.ai sans URLs d'image:", falResult);
      return new Response(JSON.stringify({ error: "Fal.ai n'a retourné aucune image exploitable." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedUrls = imageUrls.slice(0, requestedImageCount);
    console.log(`Fal.ai returned ${trimmedUrls.length} image URLs`);

    const responseBody = {
      recordId: requestId ?? null,
      gridUrl: null,
      options: trimmedUrls,
      prompt: sanitizedPrompt,
      styleId,
      stylePrompt,
    };

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erreur interne generate-image:", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
