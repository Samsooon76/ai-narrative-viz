import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AudioPlayer } from "@/components/ui/audio-player";
import { Wand2, Check, Volume2, RefreshCw, Play } from "lucide-react";
import { GridLoader } from "react-spinners";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/use-auth";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { VideoTimeline, type TimelinePlaybackController } from "@/components/VideoTimeline";
import { cn } from "@/lib/utils";
import PageShell from "@/components/layout/PageShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_STYLE_ID = 'nano-banana';

const DEFAULT_IMAGE_STYLE_PROMPT =
  'High-end animated short film look, cinematic lighting, believable proportions, ready for motion.';

const IMAGE_STYLE_PROMPTS: Record<string, string> = {
  'arcane': 'Arcane-inspired realistic comic style, painterly shading, expressive lighting, detailed characters, atmospheric depth, dynamic brush strokes.',
  'desaturated-toon': 'Muted 2D toon look, long shadows, poetic mist, gentle color grading, minimalist backgrounds, elegant silhouettes.',
  'digital-noir': 'Angular neo-noir comics, flat shading, hard-edged shapes, monochrome teal-green palette, dramatic chiaroscuro.',
  'bold-graphic': 'Bold graphic novel, thick silhouettes, poster-like compositions, high contrast red and black palette, strong negative space.',
  'muted-adventure': 'Soft cinematic adventure, wide-lens depth, limited earthy palette, atmospheric haze, subtle storytelling details.',
  'whimsical-cartoon': 'Playful surreal cartoon, exaggerated proportions, energetic curves, candy colors, lively expressions.',
  'late-night-action': 'Nocturnal action animation, backlit silhouettes, sharp highlights, high tension, precise anatomy, moody city glow.',
  [DEFAULT_STYLE_ID]: 'Nano Banana stylized anime realism, saturated neon palette, hyper-detailed character design, motion-friendly silhouette, dynamic lighting.',
};

const STYLE_OPTIONS = [
  { value: 'none', label: 'Sans contrainte (IA libre)' },
  { value: 'arcane', label: 'Arcane - peinture dramatique' },
  { value: 'desaturated-toon', label: 'Desaturated Toon - ambiance feutrée' },
  { value: 'digital-noir', label: 'Digital Noir - contraste marqué' },
  { value: 'bold-graphic', label: 'Bold Graphic - silhouettes fortes' },
  { value: 'muted-adventure', label: 'Muted Adventure - aventure cinématique' },
  { value: 'whimsical-cartoon', label: 'Whimsical Cartoon - cartoon coloré' },
  { value: 'late-night-action', label: 'Late Night Action - action nocturne' },
  { value: DEFAULT_STYLE_ID, label: 'Nano Banana - animé néon détaillé' },
];

const resolveStyleId = (visualStyle: string | null | undefined) =>
  visualStyle && visualStyle !== 'none' ? visualStyle : DEFAULT_STYLE_ID;

const resolveStylePrompt = (styleId: string | null | undefined) =>
  IMAGE_STYLE_PROMPTS[styleId ?? DEFAULT_STYLE_ID] ?? DEFAULT_IMAGE_STYLE_PROMPT;

const extractFunctionErrorMessage = (error: unknown, fallback: string) => {
  if (!error) return fallback;

  if (typeof error === 'object' && error !== null && 'context' in error) {
    const context = (error as { context?: { body?: unknown } }).context;
    const body = context?.body;
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        if (parsed?.error && typeof parsed.error === 'string') {
          return parsed.error;
        }
      } catch (_) {
        return body;
      }
    }
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const message = (body as { error?: unknown }).error;
      if (typeof message === 'string') return message;
    }
  }

  if (error instanceof Error) return error.message || fallback;

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }

  return fallback;
};

const FAL_PROMPT_MAX_LENGTH = 2000;

const sanitizeFalPrompt = (rawPrompt: string | null | undefined, fallbackPrompt?: string | null | undefined) => {
  const sourcePrompt = [rawPrompt, fallbackPrompt].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  ) ?? '';

  const collapsed = sourcePrompt.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= FAL_PROMPT_MAX_LENGTH) {
    return collapsed;
  }

  return collapsed.slice(0, FAL_PROMPT_MAX_LENGTH);
};

type SceneVoiceRecord = {
  voiceId: string;
  audioBase64: string;
  duration: number;
};

type VoiceClip = {
  id: string;
  label: string;
  start: number;
  duration: number;
  accentClassName?: string;
};

// Cartesia TTS Configuration
const CARTESIA_VOICE_ID = "bd94e5a0-2b7a-4762-9b91-6eac6342f852";
const CARTESIA_MODEL = "sonic-english";

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const arrayBuffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBlob = (base64: string, contentType = "audio/mpeg"): Blob => {
  const cleaned = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const byteCharacters = atob(cleaned);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
};

type Step = 'topic' | 'script' | 'images' | 'complete';

interface ScriptScene {
  scene_number: number;
  title: string;
  visual: string;
  narration: string;
  duration_seconds?: number;
  audio_description?: string;
}

interface ScriptData {
  title: string;
  music: string;
  scenes: ScriptScene[];
}

interface GeneratedImage {
  sceneNumber: number;
  imageUrl: string;
  prompt: string;
  styleId?: string;
  stylePrompt?: string;
  videoUrl?: string;
  videoPrompt?: string;
  success?: boolean;
}

type SceneStatus = 'loading' | 'ready' | 'generating-video' | 'error' | 'empty';

const STUDIO_STEPS: { id: Step; label: string; description: string }[] = [
  { id: 'topic', label: 'Brief', description: 'Sujet et style visuel' },
  { id: 'script', label: 'Script', description: 'Narration par scène' },
  { id: 'images', label: 'Storyboard', description: 'Visuels & montage' },
  { id: 'complete', label: 'Export', description: 'Rendering final' },
];

const CreateVideo = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState<Step>('topic');
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  
  // Step 1: Topic
  const [projectName, setProjectName] = useState("");
  const [topic, setTopic] = useState("");
  const [visualStyle, setVisualStyle] = useState<string>("none");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Step 2: Script
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  
  // Step 3: Images
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [generatingVideoScenes, setGeneratingVideoScenes] = useState<Set<number>>(new Set());
  const [sceneStyleOverrides, setSceneStyleOverrides] = useState<Record<number, string>>({});
  const [voiceOptions, setVoiceOptions] = useState<
    { voice_id: string; name: string; preview_url?: string | null; language?: string | null }[]
  >([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [sceneVoiceStatus, setSceneVoiceStatus] = useState<Record<number, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [sceneAudioUrls, setSceneAudioUrls] = useState<Record<number, string>>({});
  const [sceneAudioDurations, setSceneAudioDurations] = useState<Record<number, number>>({});
  const [sceneVoiceData, setSceneVoiceData] = useState<Record<number, SceneVoiceRecord>>({});
  const [sceneAudioSpeeds, setSceneAudioSpeeds] = useState<Record<number, number>>({});
  const [sceneAudioClipEdits, setSceneAudioClipEdits] = useState<Record<string, { start: number; duration: number }>>({});
  const [sceneCustomDurations, setSceneCustomDurations] = useState<Record<number, number>>({});
  const videoNegativePrompt = "jitter, bad hands, blur, distortion";
  const videoSeed = "";
  const timelinePreviewRef = useRef<HTMLVideoElement | null>(null);
  const timelinePlaybackControllerRef = useRef<TimelinePlaybackController | null>(null);
  const [activeTimelineScene, setActiveTimelineScene] = useState<number | null>(null);

  const sceneCount = useMemo(() => scriptData?.scenes?.length ?? 0, [scriptData]);
  const filmTitle = useMemo(() => projectName || scriptData?.title || topic || 'the film', [projectName, scriptData?.title, topic]);

  const DEFAULT_TIMELINE_LENGTH = 60;

  const estimatedSceneDuration = useMemo(() => {
    if (!sceneCount) {
      return DEFAULT_TIMELINE_LENGTH;
    }

    const rawDuration = DEFAULT_TIMELINE_LENGTH / sceneCount;
    return Math.max(Math.round(rawDuration * 10) / 10, 4);
  }, [sceneCount]);

  const timelineDuration = useMemo(() => {
    if (!sceneCount) {
      return DEFAULT_TIMELINE_LENGTH;
    }
    return estimatedSceneDuration * sceneCount;
  }, [sceneCount, estimatedSceneDuration]);

  const voiceAudioClips = useMemo(() => {
    if (!scriptData || !scriptData.scenes.length) return [] as VoiceClip[];

    // Calculate cumulative start positions based on actual scene durations
    const sceneStartPositions: Record<number, number> = {};
    let cumulativeTime = 0;
    scriptData.scenes.forEach((scene) => {
      sceneStartPositions[scene.scene_number] = cumulativeTime;
      // Use actual scene duration, fallback to AI duration, then estimated duration
      const customDuration = sceneCustomDurations?.[scene.scene_number];
      const aiDuration = scene.duration_seconds ?? 0;
      const effectiveDuration = customDuration ?? (aiDuration > 0 ? aiDuration : estimatedSceneDuration);
      cumulativeTime += effectiveDuration;
    });

    const clips: VoiceClip[] = [];
    scriptData.scenes.forEach((scene) => {
      if (!sceneAudioUrls[scene.scene_number]) return;
      const rawDuration = sceneAudioDurations[scene.scene_number] ?? estimatedSceneDuration;
      const speed = sceneAudioSpeeds[scene.scene_number] ?? 1;
      const duration = rawDuration / speed;
      const clipId = `voice-${scene.scene_number}`;

      // Use edited position/duration if available
      const edit = sceneAudioClipEdits[clipId];
      const start = edit?.start ?? sceneStartPositions[scene.scene_number];
      const finalDuration = edit?.duration ?? duration;

      const voiceRecord = sceneVoiceData[scene.scene_number];
      const voiceName = voiceRecord
        ? voiceOptions.find((voice) => voice.voice_id === voiceRecord.voiceId)?.name
        : null;

      clips.push({
        id: clipId,
        label: voiceName ? `${voiceName} – Scène ${scene.scene_number}` : `Voix scène ${scene.scene_number}`,
        start,
        duration: finalDuration,
        accentClassName:
          "border-emerald-400/40 bg-gradient-to-r from-emerald-400/30 via-emerald-400/15 to-emerald-400/10 text-emerald-400",
      });
    });
    return clips;
  }, [scriptData, sceneAudioUrls, sceneAudioDurations, estimatedSceneDuration, sceneVoiceData, voiceOptions, sceneAudioSpeeds, sceneAudioClipEdits, sceneCustomDurations]);


  const selectedVoice = useMemo(() => {
    if (!selectedVoiceId) return null;
    return voiceOptions.find((voice) => voice.voice_id === selectedVoiceId) ?? null;
  }, [selectedVoiceId, voiceOptions]);

  const handlePlaybackControllerChange = useCallback((controller: TimelinePlaybackController | null) => {
    timelinePlaybackControllerRef.current = controller;
  }, [estimatedSceneDuration, selectedVoiceId]);

  const persistVoiceData = useCallback(async (voiceData: Record<number, SceneVoiceRecord>, clipEdits?: Record<string, { start: number; duration: number }>, durations?: Record<number, number>) => {
    if (!projectId) return;
    try {
      const dataToSave = {
        voiceData,
        clipEdits: clipEdits || sceneAudioClipEdits,
        sceneDurations: durations || sceneCustomDurations,
      };
      const { error } = await supabase
        .from('video_projects')
        .update({ voice_data: dataToSave })
        .eq('id', projectId);
      if (error) {
        console.error('Erreur sauvegarde voix:', error);
      }
    } catch (error) {
      console.error('Erreur inattendue sauvegarde voix:', error);
    }
  }, [projectId, sceneAudioClipEdits, sceneCustomDurations]);

  const loadVoices = useCallback(async () => {
    // Initialize with Cartesia voice (API key is managed server-side)
    setVoiceOptions([
      {
        voice_id: CARTESIA_VOICE_ID,
        name: "Cartesia Voice",
        preview_url: null,
        language: "English",
      }
    ]);
    setSelectedVoiceId(CARTESIA_VOICE_ID);
    setVoicesError(null);
  }, []);

  useEffect(() => {
    if (currentStep !== "script") return;
    if (voiceOptions.length > 0 || voicesLoading) return;
    void loadVoices();
  }, [currentStep, voiceOptions.length, voicesLoading, loadVoices]);

  const clearSceneVoiceData = useCallback(
    (sceneNumber: number) => {
      setSceneVoiceStatus((prev) => ({ ...prev, [sceneNumber]: 'idle' }));
      setSceneAudioUrls((prev) => {
        const next = { ...prev };
        const existing = next[sceneNumber];
        if (existing) {
          URL.revokeObjectURL(existing);
          delete next[sceneNumber];
        }
        return next;
      });
      setSceneAudioDurations((prev) => {
        if (!(sceneNumber in prev)) return prev;
        const next = { ...prev };
        delete next[sceneNumber];
        return next;
      });
      setSceneVoiceData((prev) => {
        if (!(sceneNumber in prev)) return prev;
        const next = { ...prev };
        delete next[sceneNumber];
        void persistVoiceData(next);
        return next;
      });
    },
    [persistVoiceData]
  );

  useEffect(() => {
    if (!scriptData) {
      Object.values(sceneAudioUrls).forEach((url) => URL.revokeObjectURL(url));
      setSceneAudioUrls({});
      setSceneVoiceStatus({});
      setSceneAudioDurations({});
      setSceneVoiceData({});
      void persistVoiceData({});
      return;
    }

    const validSceneNumbers = new Set(scriptData.scenes.map((scene) => scene.scene_number));

    setSceneVoiceStatus((prev) => {
      const next: Record<number, "idle" | "loading" | "success" | "error"> = {};
      scriptData.scenes.forEach((scene) => {
        next[scene.scene_number] = prev[scene.scene_number] ?? "idle";
      });
      return next;
    });

    setSceneAudioUrls((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([sceneNumberStr, url]) => {
        const sceneNumber = Number(sceneNumberStr);
        if (validSceneNumbers.has(sceneNumber)) {
          next[sceneNumber] = url;
        } else {
          URL.revokeObjectURL(url);
        }
      });
      return next;
    });
    setSceneAudioDurations((prev) => {
      const next: Record<number, number> = {};
      scriptData.scenes.forEach((scene) => {
        if (prev[scene.scene_number] != null) {
          next[scene.scene_number] = prev[scene.scene_number];
        }
      });
      return next;
    });
    const trimmedVoiceData: Record<number, SceneVoiceRecord> = {};
    scriptData.scenes.forEach((scene) => {
      const record = sceneVoiceDataRef.current[scene.scene_number];
      if (record) {
        trimmedVoiceData[scene.scene_number] = record;
      }
    });

    const currentVoiceData = sceneVoiceDataRef.current;
    let voiceDataChanged = Object.keys(currentVoiceData).length !== Object.keys(trimmedVoiceData).length;
    if (!voiceDataChanged) {
      for (const [sceneNumberStr, record] of Object.entries(trimmedVoiceData)) {
        const sceneNumber = Number(sceneNumberStr);
        const current = currentVoiceData[sceneNumber];
        if (!current || current.audioBase64 !== record.audioBase64 || current.voiceId !== record.voiceId || current.duration !== record.duration) {
          voiceDataChanged = true;
          break;
        }
      }
    }

    if (voiceDataChanged) {
      setSceneVoiceData(trimmedVoiceData);
      void persistVoiceData(trimmedVoiceData);
    }
  }, [scriptData, persistVoiceData]);

  const audioUrlsRef = useRef<Record<number, string>>({});
  const sceneVoiceDataRef = useRef<Record<number, SceneVoiceRecord>>({});

  useEffect(() => {
    audioUrlsRef.current = sceneAudioUrls;
  }, [sceneAudioUrls]);

  useEffect(() => {
    sceneVoiceDataRef.current = sceneVoiceData;
  }, [sceneVoiceData]);

  // Auto-persist clip edits and scene durations
  useEffect(() => {
    if ((Object.keys(sceneAudioClipEdits).length > 0 || Object.keys(sceneCustomDurations).length > 0) && projectId) {
      const timer = setTimeout(() => {
        void persistVoiceData(sceneVoiceData, sceneAudioClipEdits, sceneCustomDurations);
      }, 1000); // Debounce 1 second
      return () => clearTimeout(timer);
    }
  }, [sceneAudioClipEdits, sceneCustomDurations, projectId, sceneVoiceData]);

  useEffect(() => {
    return () => {
      Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const generateVoiceForScene = useCallback(
    async (scene: ScriptScene) => {
      const narrationText = scene.narration?.trim();
      if (!narrationText) {
        toast({
          title: "Narration vide",
          description: "Aucun texte de narration n'est disponible pour cette scène.",
          variant: "destructive",
        });
        return;
      }

      setSceneVoiceStatus((prev) => ({ ...prev, [scene.scene_number]: "loading" }));

      try {
        // Call the edge function to generate voice securely
        const { data, error } = await supabase.functions.invoke('generate-voice', {
          body: { narration: narrationText }
        });

        if (error) {
          throw error;
        }

        if (!data || !data.audioBase64) {
          throw new Error('Aucune audio générée par le serveur');
        }

        const base64Audio = data.audioBase64;
        const audioBlob = base64ToBlob(base64Audio, 'audio/wav');
        const objectUrl = URL.createObjectURL(audioBlob);

        setSceneAudioUrls((prev) => {
          const next = { ...prev };
          const previousUrl = prev[scene.scene_number];
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
          }
          next[scene.scene_number] = objectUrl;
          return next;
        });

        const audioElement = new Audio();

        const finalizeVoice = (rawDuration: number) => {
          const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : estimatedSceneDuration;

          // Update scene duration to match actual audio duration
          setSceneCustomDurations((prev) => ({
            ...prev,
            [scene.scene_number]: duration,
          }));

          setSceneAudioDurations((prev) => ({ ...prev, [scene.scene_number]: duration }));
          setSceneVoiceData((prev) => {
            const next = {
              ...prev,
              [scene.scene_number]: {
                voiceId: CARTESIA_VOICE_ID,
                audioBase64: base64Audio,
                duration,
              },
            };
            void persistVoiceData(next);
            return next;
          });
          setSceneVoiceStatus((prev) => ({ ...prev, [scene.scene_number]: "success" }));

          // Show toast with actual duration
          toast({
            title: "Voix générée",
            description: `Scène ${scene.scene_number} - Durée: ${duration.toFixed(2)}s`,
          });
        };

        const cleanupAudioElement = () => {
          audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
          audioElement.removeEventListener("error", handleError);
          audioElement.src = "";
        };

        const handleLoadedMetadata = () => {
          finalizeVoice(audioElement.duration);
          cleanupAudioElement();
        };

        const handleError = () => {
          finalizeVoice(estimatedSceneDuration);
          cleanupAudioElement();
        };

        audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
        audioElement.addEventListener("error", handleError);
        audioElement.src = objectUrl;
        audioElement.load();
      } catch (error) {
        console.error("Erreur génération voix Cartesia:", error);
        setSceneVoiceStatus((prev) => ({ ...prev, [scene.scene_number]: "error" }));
        toast({
          title: "Erreur",
          description: extractFunctionErrorMessage(error, "Impossible de générer la voix pour cette scène."),
          variant: "destructive",
        });
      }
    },
    [toast, estimatedSceneDuration, persistVoiceData],
  );

  const calculateTotalDuration = useCallback(() => {
    // Calculate total duration from actual audio durations
    let totalDuration = 0;
    if (!scriptData) return 0;

    scriptData.scenes.forEach((scene) => {
      const duration = sceneCustomDurations[scene.scene_number];
      if (duration) {
        totalDuration += duration;
      }
    });
    return totalDuration;
  }, [scriptData, sceneCustomDurations]);

  const generateAllVoices = useCallback(async () => {
    if (!scriptData) return;

    const voicesToGenerate = scriptData.scenes.filter(scene => !sceneAudioUrls[scene.scene_number]);

    if (voicesToGenerate.length === 0) {
      toast({
        title: "Tous les audios générés",
        description: "Toutes les scènes ont déjà une voix générée.",
      });
      return;
    }

    // Generate voices sequentially with 1 second delay between each call
    for (let i = 0; i < voicesToGenerate.length; i++) {
      if (i > 0) {
        // Wait 1 second before next API call
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      await generateVoiceForScene(voicesToGenerate[i]);
    }

    // Wait a moment for the last persistence to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Final save to ensure all generated audios are persisted in database
    await persistVoiceData(sceneVoiceDataRef.current);

    // Calculate total duration from actual audio durations
    const totalDuration = calculateTotalDuration();

    toast({
      title: "Génération terminée !",
      description: `${voicesToGenerate.length} voix générées - Durée totale: ${totalDuration.toFixed(1)}s`,
    });
  }, [scriptData, sceneAudioUrls, generateVoiceForScene, toast, persistVoiceData, calculateTotalDuration]);

  useEffect(() => {
    if (currentStep !== 'images') {
      timelinePlaybackControllerRef.current?.pause();
      const video = timelinePreviewRef.current;
      if (video) {
        video.pause();
      }
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (tagName === "INPUT" || tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }

      event.preventDefault();
      console.log('[CreateVideo] Space key pressed');

      const controller = timelinePlaybackControllerRef.current;
      if (controller) {
        console.log('[CreateVideo] Using playback controller, isPlaying:', controller.isPlaying());
        controller.toggle();
        return;
      }

      console.log('[CreateVideo] No controller, using video ref directly');
      const video = timelinePreviewRef.current;
      if (!video) {
        console.log('[CreateVideo] No video ref found');
        return;
      }

      if (video.paused) {
        console.log('[CreateVideo] Video paused, playing');
        void video.play().catch(() => {
          // user interaction required for autoplay - ignore failures
        });
      } else {
        console.log('[CreateVideo] Video playing, pausing');
        video.pause();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [currentStep]);

  const buildImagePrompt = useCallback((scene: ScriptScene, stylePrompt: string) => {
    const continuityInstruction = `This is sequential scene ${scene.scene_number} of the animated short "${filmTitle}". Maintain consistent character design, wardrobe, color palette, lighting mood, era and world-building with the previous scenes unless the brief explicitly demands a change.`;

    return [
      `Style goal: ${stylePrompt}`,
      continuityInstruction,
      `Scene brief (auto-translate into fluent cinematic English, enrich with camera motion, lighting and atmosphere details): ${scene.visual}`,
      'Avoid any text, captions, signage, UI elements, or typography unless the scene brief explicitly mandates readable wording.',
      'Avoid frames, letterboxing, watermarks, or decorative borders so the artwork fills the frame cleanly.',
      'Design a single 9:16 portrait illustration that works as a keyframe for animation and keeps the same main characters throughout the story.'
    ].join("\n");
  }, [filmTitle]);

  const loadProjectImages = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('video_projects')
        .select('images_data, voice_data')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data?.voice_data) {
        const rawVoiceData = typeof data.voice_data === 'string'
          ? JSON.parse(data.voice_data)
          : data.voice_data;

        // Handle multiple formats: old (direct voice records), new (with voiceData, clipEdits, sceneDurations)
        const voiceDataToProcess = rawVoiceData?.voiceData ? rawVoiceData.voiceData : rawVoiceData;
        const clipEditsToRestore = rawVoiceData?.clipEdits ? rawVoiceData.clipEdits : {};
        const scenesDurationsToRestore = rawVoiceData?.sceneDurations ? rawVoiceData.sceneDurations : {};

        if (voiceDataToProcess && typeof voiceDataToProcess === 'object') {
          const restoredUrls: Record<number, string> = {};
          const restoredDurations: Record<number, number> = {};
          const restoredVoiceData: Record<number, SceneVoiceRecord> = {};
          const restoredStatus: Record<number, 'idle' | 'loading' | 'success' | 'error'> = {};
          let hasRestoredVoices = false;

          Object.entries(voiceDataToProcess as Record<string, SceneVoiceRecord | { audioBase64?: string; voiceId?: string; duration?: number }>)
            .forEach(([sceneNumberStr, value]) => {
              const sceneNumber = Number(sceneNumberStr);
              if (!Number.isInteger(sceneNumber)) return;
              const record = value as Partial<SceneVoiceRecord> & { audioBase64?: string };
              if (!record?.audioBase64) {
                console.warn('Voix scène', sceneNumber, ': audioBase64 manquant');
                return;
              }

              try {
                const blob = base64ToBlob(record.audioBase64);
                const objectUrl = URL.createObjectURL(blob);
                restoredUrls[sceneNumber] = objectUrl;
                restoredDurations[sceneNumber] =
                  typeof record.duration === 'number' && record.duration > 0 ? record.duration : 8;
                restoredVoiceData[sceneNumber] = {
                  voiceId: record.voiceId ?? "",
                  audioBase64: record.audioBase64,
                  duration: restoredDurations[sceneNumber],
                };
                restoredStatus[sceneNumber] = 'success';
                hasRestoredVoices = true;
                console.log('✓ Voix restaurée scène', sceneNumber);
              } catch (voiceError) {
                console.error('✗ Erreur restauration audio scène', sceneNumber, voiceError);
                restoredStatus[sceneNumber] = 'error';
              }
            });

          if (hasRestoredVoices) {
            setSceneAudioUrls(restoredUrls);
            setSceneAudioDurations(restoredDurations);
            setSceneVoiceData(restoredVoiceData);
            setSceneVoiceStatus(restoredStatus);

            // Restore or sync scene durations with actual audio durations (retroactive)
            const finalSceneDurations = scenesDurationsToRestore && Object.keys(scenesDurationsToRestore).length > 0
              ? scenesDurationsToRestore
              : restoredDurations; // Use actual audio durations if no custom durations saved

            setSceneCustomDurations(finalSceneDurations);
            console.log('✓ Durées de scènes restaurées/synchronisées', finalSceneDurations);

            // Restore clip edits if available
            if (clipEditsToRestore && Object.keys(clipEditsToRestore).length > 0) {
              setSceneAudioClipEdits(clipEditsToRestore);
              console.log('✓ Éditions de clips restaurées', clipEditsToRestore);
            }

            // Set selected voice from restored data if not already set
            if (!selectedVoiceId) {
              const firstRecord = Object.values(restoredVoiceData)[0];
              if (firstRecord?.voiceId) {
                setSelectedVoiceId(firstRecord.voiceId);
              }
            }
          }
        }
      }

      if (!data?.images_data) return;

      const rawImages = typeof data.images_data === 'string'
        ? JSON.parse(data.images_data)
        : data.images_data;

      if (Array.isArray(rawImages) && rawImages.length > 0) {
        const normalizedImages = rawImages.map((img: GeneratedImage) => {
          const inferredStyleId = img.styleId ?? DEFAULT_STYLE_ID;
          return {
            ...img,
            styleId: inferredStyleId,
            stylePrompt: img.stylePrompt ?? resolveStylePrompt(inferredStyleId),
          };
        });

        setGeneratedImages(normalizedImages);

        const restoredStyles: Record<number, string> = {};
        normalizedImages.forEach((img) => {
          if (typeof img.sceneNumber === 'number') {
            restoredStyles[img.sceneNumber] = img.styleId ?? DEFAULT_STYLE_ID;
          }
        });

        if (Object.keys(restoredStyles).length > 0) {
          setSceneStyleOverrides((prev) => ({
            ...prev,
            ...restoredStyles,
          }));
        }

        setCurrentStep('images');
        return;
      }

      if (rawImages && typeof rawImages === 'object') {
        const imagesArray: GeneratedImage[] = Object.entries(rawImages).map(([sceneNumber, imageUrl]) => ({
          sceneNumber: Number.parseInt(sceneNumber, 10),
          imageUrl: imageUrl as string,
          prompt: '',
          styleId: DEFAULT_STYLE_ID,
          stylePrompt: resolveStylePrompt(DEFAULT_STYLE_ID),
        }));

        setGeneratedImages(imagesArray);
        const styleMap: Record<number, string> = {};
        imagesArray.forEach((img) => {
          styleMap[img.sceneNumber] = img.styleId ?? DEFAULT_STYLE_ID;
        });
        setSceneStyleOverrides((prev) => ({
          ...prev,
          ...styleMap,
        }));
        setCurrentStep('images');
      }
    } catch (error) {
      console.error('Erreur chargement images:', error);
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    setIsLoadingProject(true);
    try {
      const { data, error } = await supabase
        .from('video_projects')
        .select('id, title, prompt, script, status, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error) throw error;

      setProjectId(data.id);
      setProjectName(data.title);
      setTopic(data.prompt || "");

      if (data.script) {
        const parsedScript = typeof data.script === 'string'
          ? JSON.parse(data.script)
          : data.script;

        setScriptData(parsedScript);

        // Don't initialize durations from script here - let loadProjectImages do it
        // This ensures actual audio durations take priority for retroactive sync
        // Durations will be set after audios are restored

        setCurrentStep('script');
      }

      setIsLoadingProject(false);

      toast({
        title: "Projet chargé",
        description: `Projet "${data.title}" ouvert avec succès`
      });

      loadProjectImages(id);
    } catch (error) {
      console.error('Erreur chargement projet:', error);
      const message = error instanceof Error ? error.message : 'Impossible de charger le projet';
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive"
      });
      setIsLoadingProject(false);
    }
  }, [loadProjectImages]);

  useEffect(() => {
    const projectIdFromUrl = searchParams.get('project');
    if (projectIdFromUrl && user && !projectId) {
      loadProject(projectIdFromUrl);
    }
  }, [searchParams, user, projectId, loadProject]);

  useEffect(() => {
    if (!projectId) return;
    const savedStep = localStorage.getItem(`project_${projectId}_step`);
    if (savedStep && ['topic', 'script', 'images', 'complete'].includes(savedStep)) {
      setCurrentStep(savedStep as Step);
    }
  }, [projectId]);

  useEffect(() => {
    if (!scriptData) return;

    setSceneStyleOverrides((prev) => {
      const updated = { ...prev };
      scriptData.scenes.forEach((scene) => {
        if (updated[scene.scene_number] === undefined) {
          const existing = generatedImages.find((img) => img.sceneNumber === scene.scene_number);
          updated[scene.scene_number] = existing?.styleId ?? visualStyle;
        }
      });
      return updated;
    });
  }, [scriptData, generatedImages, visualStyle]);

  const handleSceneStyleChange = useCallback((sceneNumber: number, styleId: string) => {
    setSceneStyleOverrides((prev) => ({
      ...prev,
      [sceneNumber]: styleId,
    }));
  }, []);

  // Save current step to localStorage whenever it changes
  useEffect(() => {
    if (projectId) {
      localStorage.setItem(`project_${projectId}_step`, currentStep);
    }
  }, [currentStep, projectId]);


  const generateScript = async () => {
    if (!topic.trim() || !projectName.trim()) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-script', {
        body: { topic, type: 'script', visualStyle }
      });

      if (error) throw error;
      if (!data || !data.script) {
        throw new Error('Aucun script reçu');
      }

      setScriptData(data.script);

      setCurrentStep('script');

      toast({
        title: "Script généré !",
        description: `${data.script.scenes.length} scènes - Les durées réelles seront mesurées à la génération des audios`,
      });
    } catch (error) {
      console.error('Erreur génération script:', error);
      const message = extractFunctionErrorMessage(error, "Impossible de générer le script");
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const approveScript = async () => {
    try {
      const finalScript = scriptData;

      // Update existing project or create new one
      if (projectId) {
        const { error: updateError } = await supabase
          .from('video_projects')
          .update({
            title: projectName,
            prompt: topic,
            script: JSON.stringify(finalScript),
            status: 'generating'
          })
          .eq('id', projectId);

        if (updateError) throw updateError;
      } else {
        // Create new project
        const { data: project, error: dbError } = await supabase
          .from('video_projects')
          .insert({
            user_id: user.id,
            title: projectName,
            prompt: topic,
            script: JSON.stringify(finalScript),
            status: 'generating'
          })
          .select()
          .single();

        if (dbError) throw dbError;
        setProjectId(project.id);
      }
      
      setCurrentStep('images');
      
      toast({
        title: "Script approuvé !",
        description: "Passons à la génération des images"
      });
    } catch (error) {
      console.error('Erreur approbation script:', error);
      const message = extractFunctionErrorMessage(error, "Erreur lors de l'approbation");
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive"
      });
    }
  };

  const generateAllImages = async () => {
    if (!scriptData || !projectId) return;
    
    setIsGeneratingImage(true);
    
    const allGeneratedImages: GeneratedImage[] = [];

    try {
      // Generate all images in parallel
      const imagePromises = scriptData.scenes.map(async (scene) => {
        const overrideStyle = sceneStyleOverrides[scene.scene_number];
        const selectedStyleId = overrideStyle ?? visualStyle;
        const styleId = resolveStyleId(selectedStyleId);
        const stylePrompt = resolveStylePrompt(styleId);
        const prompt = buildImagePrompt(scene, stylePrompt);
        
        try {
          const { data, error } = await supabase.functions.invoke('generate-image', {
            body: { 
              prompt,
              sceneTitle: scene.title,
              styleId,
              stylePrompt
            }
          });

          if (error) throw error;
          if (!data || !data.imageUrl) {
            throw new Error('Aucune image générée');
          }

          const newImage = {
            sceneNumber: scene.scene_number,
            imageUrl: data.imageUrl,
            prompt,
            styleId: (data as { styleId?: string })?.styleId ?? styleId,
            stylePrompt: (data as { stylePrompt?: string })?.stylePrompt ?? stylePrompt,
            success: true,
          };

          // Save to database immediately
          allGeneratedImages.push(newImage);
          await supabase
            .from('video_projects')
            .update({ 
              images_data: JSON.stringify(allGeneratedImages)
            })
            .eq('id', projectId);

          // Update UI in real-time
          setGeneratedImages([...allGeneratedImages]);
          setSceneStyleOverrides((prev) => ({
            ...prev,
            [scene.scene_number]: selectedStyleId,
          }));

          toast({
            title: `Image ${allGeneratedImages.length}/${scriptData.scenes.length}`,
            description: `Scène: ${scene.title}`
          });

          return newImage;
        } catch (error) {
          console.error(`Erreur scène ${scene.scene_number}:`, error);
          toast({
            title: `Erreur scène ${scene.scene_number}`,
            description: extractFunctionErrorMessage(error, "Impossible de générer cette image"),
            variant: "destructive"
          });
          return {
            sceneNumber: scene.scene_number,
            imageUrl: '',
            prompt,
            success: false
          };
        }
      });

      const results = await Promise.all(imagePromises);
      
      const successfulImages = results.filter(r => r.success);

      toast({
        title: "Génération terminée !",
        description: `${successfulImages.length}/${scriptData.scenes.length} images créées`
      });
    } catch (error) {
      console.error('Erreur génération images:', error);
      toast({
        title: "Erreur",
        description: extractFunctionErrorMessage(error, "Impossible de générer les images"),
        variant: "destructive"
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const regenerateImage = async (sceneNumber: number) => {
    if (!scriptData || !projectId) return;
    
    const scene = scriptData.scenes.find(s => s.scene_number === sceneNumber);
    if (!scene) return;

    setIsGeneratingImage(true);

    try {
      const overrideStyle = sceneStyleOverrides[sceneNumber];
      const selectedStyleId = overrideStyle ?? visualStyle;
      const styleId = resolveStyleId(selectedStyleId);
      const stylePrompt = resolveStylePrompt(styleId);
      const prompt = buildImagePrompt(scene, stylePrompt);

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          sceneTitle: scene.title,
          styleId,
          stylePrompt
        }
      });

      if (error) {
        console.error('Erreur de l\'edge function:', error);
        throw error;
      }
      
      if (!data || !data.imageUrl) {
        console.error('Pas d\'imageUrl dans la réponse:', data);
        throw new Error('Aucune image générée');
      }

      const newImage: GeneratedImage = {
        sceneNumber: scene.scene_number,
        imageUrl: data.imageUrl,
        prompt,
        styleId: (data as { styleId?: string })?.styleId ?? styleId,
        stylePrompt: (data as { stylePrompt?: string })?.stylePrompt ?? stylePrompt,
        success: true
      };

      // Update local state
      const updatedImages = generatedImages.some(img => img.sceneNumber === sceneNumber)
        ? generatedImages.map(img => img.sceneNumber === sceneNumber ? newImage : img)
        : [...generatedImages, newImage];

      setGeneratedImages(updatedImages);
      setSceneStyleOverrides((prev) => ({
        ...prev,
        [sceneNumber]: selectedStyleId,
      }));

      // Save to database
      await supabase
        .from('video_projects')
        .update({ 
          images_data: JSON.stringify(updatedImages)
        })
        .eq('id', projectId);
      
      toast({
        title: "Image régénérée !",
        description: `Nouvelle image pour la scène ${sceneNumber}`
      });
    } catch (error) {
      console.error('Erreur régénération image:', error);
      toast({
        title: "Erreur",
        description: extractFunctionErrorMessage(error, "Impossible de régénérer l'image"),
        variant: "destructive"
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const generateVideo = async (sceneNumber: number) => {
    const scene = scriptData?.scenes.find(s => s.scene_number === sceneNumber);
    const generatedImage = generatedImages.find(img => img.sceneNumber === sceneNumber);
    
    if (!scene || !generatedImage) {
      toast({
        title: "Erreur",
        description: "Image non trouvée pour cette scène",
        variant: "destructive",
      });
      return;
    }

    if (!projectId) {
      toast({
        title: "Projet introuvable",
        description: "Impossible de générer la vidéo sans identifiant de projet.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingVideoScenes(prev => new Set(prev).add(sceneNumber));

    try {

      const fallbackStyleId = generatedImage.styleId ?? resolveStyleId(visualStyle);
      const styleReference = `Visual style reference: ${generatedImage.stylePrompt ?? resolveStylePrompt(fallbackStyleId)}`;
      const visualReference = generatedImage.prompt ? `Reference prompt: ${generatedImage.prompt}` : '';

      const promptParts = [
        styleReference,
        `Scene focus: ${scene.visual}`,
        `Narration: ${scene.narration}`,
        visualReference,
        'Translate any non-English content into fluent English before synthesis.',
      ].filter(Boolean);

      const finalPrompt = promptParts.join(' ').trim();
      const sanitizedPrompt = sanitizeFalPrompt(finalPrompt, scene.narration);

      if (!sanitizedPrompt) {
        throw new Error("Le prompt généré pour la vidéo est vide. Vérifiez la scène avant de relancer.");
      }

      const updatedImagesForPrompt = generatedImages.map((img) =>
        img.sceneNumber === sceneNumber
          ? {
              ...img,
              videoPrompt: sanitizedPrompt,
            }
          : img
      );

      setGeneratedImages(updatedImagesForPrompt);

      try {
        await supabase
          .from('video_projects')
          .update({ images_data: JSON.stringify(updatedImagesForPrompt) })
          .eq('id', projectId);
      } catch (updateError) {
        console.error('Erreur mise à jour vidéo en base:', updateError);
      }

      const seedValue = videoSeed.trim() !== '' ? Number.parseInt(videoSeed, 10) : undefined;
      const numericSeed = typeof seedValue === 'number' && Number.isFinite(seedValue) ? seedValue : undefined;
      const trimmedVideoNegative = videoNegativePrompt.trim();

      const payload = Object.fromEntries(
        Object.entries({
          imageUrl: generatedImage.imageUrl,
          prompt: sanitizedPrompt,
          sceneTitle: scene.title,
          projectId,
          sceneNumber,
          videoNegativePrompt: trimmedVideoNegative || undefined,
          seed: numericSeed,
          visualPrompt: generatedImage.prompt,
          styleId: generatedImage.styleId ?? resolveStyleId(visualStyle),
          stylePrompt: generatedImage.stylePrompt ?? resolveStylePrompt(visualStyle),
        }).filter(([_, value]) => value !== undefined && value !== null)
      );

      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: payload
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error as string);
      }

      const videoUrlFromResponse = (data as { videoUrl?: string })?.videoUrl;

      if (videoUrlFromResponse) {
        setGeneratedImages(prev => 
          prev.map(img =>
            img.sceneNumber === sceneNumber
              ? { ...img, videoUrl: videoUrlFromResponse }
              : img
          )
        );

        toast({
          title: "Vidéo générée !",
          description: `La vidéo pour la scène ${sceneNumber} est prête`,
        });
      } else {
        toast({
          title: "Vidéo en cours",
          description: "Le modèle a accepté la requête, la vidéo sera disponible sous peu.",
        });
      }

    } catch (error) {
      console.error('Erreur génération vidéo:', error);

      toast({
        title: "Erreur de génération",
        description: extractFunctionErrorMessage(error, "Impossible de générer la vidéo"),
        variant: "destructive",
      });
    } finally {
      setGeneratingVideoScenes(prev => {
        const newSet = new Set(prev);
        newSet.delete(sceneNumber);
        return newSet;
      });
    }
  };

  const resolveSceneLabel = (sceneNumber: number | undefined, index: number) =>
    typeof sceneNumber === 'number' && Number.isFinite(sceneNumber)
      ? sceneNumber
      : index + 1;

  const resolveExtension = (contentType: string | null, url: string, defaultExt: string) => {
    if (contentType) {
      const lowered = contentType.toLowerCase();
      if (lowered.includes('png')) return 'png';
      if (lowered.includes('jpeg') || lowered.includes('jpg')) return 'jpg';
      if (lowered.includes('webp')) return 'webp';
      if (lowered.includes('gif')) return 'gif';
      if (lowered.includes('mp4')) return 'mp4';
      if (lowered.includes('webm')) return 'webm';
    }

    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.([a-z0-9]+)(?:$|\?)/i);
      if (match?.[1]) {
        return match[1].toLowerCase();
      }
    } catch {
      // ignore malformed URLs
    }

    return defaultExt;
  };

  const downloadAllAssets = async () => {
    if (generatedImages.length === 0) {
      toast({
        title: "Aucune image",
        description: "Générez d'abord les images avant de télécharger",
        variant: "destructive"
      });
      return;
    }

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      let hasVideos = false;

      for (const [index, image] of generatedImages.entries()) {
        const sceneLabel = resolveSceneLabel(image.sceneNumber, index);
        if (image.imageUrl) {
          const response = await fetch(image.imageUrl);
          if (!response.ok) {
            throw new Error(`Image scène ${sceneLabel} indisponible (${response.status})`);
          }
          const blob = await response.blob();
          const extension = resolveExtension(response.headers.get('content-type'), image.imageUrl, 'png');
          zip.file(`image_${sceneLabel}.${extension}`, blob);
        }

        if (image.videoUrl) {
          const response = await fetch(image.videoUrl);
          if (!response.ok) {
            throw new Error(`Vidéo scène ${sceneLabel} indisponible (${response.status})`);
          }
          const blob = await response.blob();
          const extension = resolveExtension(response.headers.get('content-type'), image.videoUrl, 'mp4');
          zip.file(`video_${sceneLabel}.${extension}`, blob);
          hasVideos = true;
        }
      }

      // Generate zip file
      const content = await zip.generateAsync({ type: 'blob' });
      
      // Create download link
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName || 'video'}_${hasVideos ? 'assets' : 'images'}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Téléchargement lancé !",
        description: hasVideos
          ? "Tous les assets (images & vidéos) sont en cours de téléchargement"
          : "Toutes les images sont en cours de téléchargement"
      });
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      toast({
        title: "Erreur",
        description: "Impossible de télécharger les exports",
        variant: "destructive"
      });
    }
  };

  const finishProject = async () => {
    try {
      if (projectId) {
        await supabase
          .from('video_projects')
          .update({ 
            images_data: JSON.stringify(generatedImages),
            status: 'completed'
          })
          .eq('id', projectId);
      }

      toast({
        title: "Projet créé !",
        description: "Toutes les images ont été générées et sélectionnées"
      });
      navigate('/dashboard');
    } catch (error) {
      console.error('Erreur finalisation:', error);
      const message = extractFunctionErrorMessage(error, "Impossible de finaliser le projet");
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive"
      });
    }
  };

  const currentStepIndex = STUDIO_STEPS.findIndex(step => step.id === currentStep);
  const scenesTotal = scriptData?.scenes.length ?? 0;
  const storyboardComplete = scenesTotal > 0 && generatedImages.length === scenesTotal;
  const displayStepIndex =
    currentStep === 'images' && storyboardComplete
      ? STUDIO_STEPS.findIndex(step => step.id === 'complete')
      : currentStepIndex;
  const normalizedStepIndex = displayStepIndex < 0 ? 0 : displayStepIndex;

  if (loading || isLoadingProject) {
    return (
      <PageShell contentClassName="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <GridLoader color="#3b82f6" size={15} margin={4} />
          <p className="text-muted-foreground mt-6">Chargement...</p>
        </div>
      </PageShell>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const renderScriptPreview = () => {
    if (!scriptData) return null;

    return (
      <div className="space-y-6 rounded-2xl border border-white/10 bg-black/20 p-6 backdrop-blur-lg">
        <div>
          <h3 className="text-2xl font-bold mb-2">{scriptData.title}</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            {scriptData.music}
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Button
            onClick={generateAllVoices}
            disabled={Object.values(sceneVoiceStatus).some(status => status === 'loading') || !scriptData?.scenes.length}
            className="gap-2 w-full"
            size="lg"
          >
            {Object.values(sceneVoiceStatus).some(status => status === 'loading') ? (
              <>
                <GridLoader color="#ffffff" size={6} />
                Génération des voix en cours...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Générer tous les audios ({scriptData?.scenes.length ?? 0} scènes)
              </>
            )}
          </Button>
          {Object.values(sceneVoiceStatus).filter(s => s === 'success').length > 0 && (
            <p className="text-xs text-center text-emerald-400">
              ✓ {Object.values(sceneVoiceStatus).filter(s => s === 'success').length}/{scriptData?.scenes.length} voix générées
            </p>
          )}
        </div>

        <div className="space-y-4">
          {scriptData.scenes.map((scene) => (
            <Card key={scene.scene_number} className="rounded-xl border border-white/10 bg-black/15 p-4 backdrop-blur">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                    Scène {scene.scene_number}
                  </span>
                  <h4 className="font-semibold">{scene.title}</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold text-accent">NARRATION:</span>
                    <Textarea
                      value={scene.narration}
                      onChange={(event) => {
                        const value = event.target.value;
                        setScriptData((prev) => {
                          if (!prev) return prev;
                          const updatedScenes = prev.scenes.map((s) =>
                            s.scene_number === scene.scene_number ? { ...s, narration: value } : s,
                          );
                          return { ...prev, scenes: updatedScenes };
                        });
                        clearSceneVoiceData(scene.scene_number);
                      }}
                      rows={4}
                      className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 text-sm backdrop-blur focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                  <Button
                    type="button"
                    onClick={() => generateVoiceForScene(scene)}
                    disabled={sceneVoiceStatus[scene.scene_number] === "loading" || !selectedVoiceId}
                    className="h-11 w-full gap-2 sm:w-auto"
                  >
                    {sceneVoiceStatus[scene.scene_number] === "loading" ? (
                      <>
                        <GridLoader color="#ffffff" size={6} />
                        Génération en cours...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Générer la voix de cette scène
                      </>
                    )}
                  </Button>
                  {sceneAudioUrls[scene.scene_number] && (
                    <AudioPlayer
                      src={sceneAudioUrls[scene.scene_number]}
                      initialSpeed={sceneAudioSpeeds[scene.scene_number] ?? 1}
                      onSpeedChange={(speed) =>
                        setSceneAudioSpeeds((prev) => ({
                          ...prev,
                          [scene.scene_number]: speed,
                        }))
                      }
                    />
                  )}
                  {sceneVoiceStatus[scene.scene_number] === "error" && (
                    <p className="text-xs text-destructive">Une erreur est survenue lors de la génération de la voix. Vérifiez la configuration côté serveur et réessayez.</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <PageShell contentClassName="container px-4 pb-16">
      <div className="mx-auto max-w-6xl space-y-10">
        <Card className="space-y-6 rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <Badge variant="outline" className="w-fit border-primary/40 text-primary">
                  Studio vidéo
                </Badge>
                <h1 className="text-3xl font-semibold text-foreground">Montez votre projet</h1>
                <p className="text-sm text-muted-foreground">
                  Progressez du brief à l&apos;export sans quitter cette interface.
                </p>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground lg:text-right">
                <p className="font-medium text-foreground">{projectName || 'Nouveau projet'}</p>
                <p>{scriptData?.scenes.length ?? 0} scène(s) planifiées</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STUDIO_STEPS.map((step, index) => {
                const isCurrent = normalizedStepIndex === index;
                const isVisited = normalizedStepIndex > index;
                const isExport = step.id === 'complete' && storyboardComplete;
                const accent = isCurrent || isExport;

                return (
                  <div
                    key={step.id}
                    className={cn(
                      'rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-lg transition-colors',
                      accent ? 'border-primary/60 bg-primary/10 text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide">
                      <span>{step.label}</span>
                      {(isVisited || isExport) && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="mt-2 text-sm text-foreground">{step.description}</p>
                  </div>
                );
              })}
            </div>
        </Card>

        {currentStep === 'topic' && (
            <Card className="space-y-6 rounded-3xl border border-white/10 bg-black/30 p-8 backdrop-blur-xl">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">Définir le brief</h2>
                <p className="text-sm text-muted-foreground">
                  Donnez un nom à votre projet et décrivez le ton général. Le style influence les prompts visuels.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Nom du projet</Label>
                  <Input
                    id="project-name"
                    placeholder="Ex : Lancement produit 2025"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visual-style">Style visuel privilégié</Label>
                  <select
                    id="visual-style"
                    value={visualStyle}
                    onChange={(event) => setVisualStyle(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground backdrop-blur"
                  >
                    {STYLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="topic">Sujet de la vidéo</Label>
                <Textarea
                  id="topic"
                  placeholder="Décrivez le message, le ton, les scènes clés..."
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  rows={6}
                  className="resize-none rounded-xl border border-white/10 bg-black/20 text-sm backdrop-blur"
                />
              </div>

              <Button
                className="h-12 w-full gap-2 text-sm"
                disabled={!projectName.trim() || !topic.trim() || isGenerating}
                onClick={generateScript}
              >
                {isGenerating ? (
                  <>
                    <GridLoader color="#ffffff" size={6} />
                    Génération du script...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Générer le script avec l&apos;IA
                  </>
                )}
              </Button>

              {isGenerating && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="text-center">
                    <GridLoader color="#3b82f6" size={15} margin={4} />
                    <p className="text-foreground mt-6 text-lg font-medium">Génération du script en cours...</p>
                    <p className="text-muted-foreground mt-2 text-sm">Cela peut prendre quelques secondes</p>
                  </div>
                </div>
              )}
            </Card>
        )}

        {currentStep === 'script' && (
            <Card className="space-y-6 rounded-3xl border border-white/10 bg-black/30 p-8 backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-foreground">Révision du script</h2>
                  <p className="text-sm text-muted-foreground">Modifiez votre narration scène par scène.</p>
                </div>
              </div>

              {renderScriptPreview()}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="ghost" onClick={() => setCurrentStep('topic')} className="flex-1">
                  Retour
                </Button>
                <Button onClick={approveScript} className="flex-1 gap-2 text-sm">
                  <Check className="h-4 w-4" />
                  Passer au storyboard
                </Button>
              </div>

              {Object.values(sceneVoiceStatus).some(status => status === 'loading') && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="text-center">
                    <GridLoader color="#3b82f6" size={15} margin={4} />
                    <p className="text-foreground mt-6 text-lg font-medium">Génération des voix en cours...</p>
                    <p className="text-muted-foreground mt-2 text-sm">{Object.values(sceneVoiceStatus).filter(s => s === 'success').length}/{scriptData?.scenes.length} voix générées</p>
                  </div>
                </div>
              )}
            </Card>
        )}

        {currentStep === 'images' && scriptData && (
            <div className="space-y-6">
              {generatedImages.length === 0 ? (
                <Card className="space-y-6 rounded-3xl border border-white/10 bg-black/30 p-10 text-center backdrop-blur-xl">
                  <Wand2 className="mx-auto h-10 w-10 text-primary" />
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold text-foreground">Générons vos images</h3>
                    <p className="text-sm text-muted-foreground">
                      Lancez la génération pour créer le storyboard complet en un passage.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button variant="ghost" onClick={() => setCurrentStep('script')}>
                      Retour au script
                    </Button>
                    <Button onClick={generateAllImages} disabled={isGeneratingImage} className="gap-2 text-sm">
                      {isGeneratingImage ? (
                        <>
                          <GridLoader color="#ffffff" size={6} />
                          Génération en cours...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4" />
                          Générer toutes les images ({scriptData.scenes.length})
                        </>
                      )}
                    </Button>
                  </div>

                  {isGeneratingImage && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                      <div className="text-center">
                        <GridLoader color="#3b82f6" size={15} margin={4} />
                        <p className="text-foreground mt-6 text-lg font-medium">Génération des images en cours...</p>
                        <p className="text-muted-foreground mt-2 text-sm">Génération de {scriptData.scenes.length} images</p>
                      </div>
                    </div>
                  )}
                </Card>
              ) : (
                <>
                  <VideoTimeline
                    timelineDuration={timelineDuration}
                    audioClips={voiceAudioClips}
                    previewVideoRef={timelinePreviewRef}
                    onPlaybackControllerChange={handlePlaybackControllerChange}
                    onActiveSceneChange={setActiveTimelineScene}
                    onDownloadAssets={downloadAllAssets}
                    isDownloadDisabled={isGeneratingImage}
                    sceneVoiceData={sceneVoiceData}
                    sceneAudioSpeeds={sceneAudioSpeeds}
                    sceneCustomDurations={sceneCustomDurations}
                    onAudioClipsChange={(edits) => setSceneAudioClipEdits(edits)}
                    onSceneDurationChange={(durations) => setSceneCustomDurations(durations)}
                    scenes={scriptData.scenes.map((scene) => {
                      const generatedImage = generatedImages.find((img) => img.sceneNumber === scene.scene_number);
                      const isGenerating = generatingVideoScenes.has(scene.scene_number);
                      const status: SceneStatus = isGenerating
                        ? 'generating-video'
                        : generatedImage
                          ? 'ready'
                          : isLoadingProject
                            ? 'loading'
                            : 'empty';

                      return {
                        sceneNumber: scene.scene_number,
                        title: scene.title,
                        imageUrl: generatedImage?.imageUrl,
                        videoUrl: generatedImage?.videoUrl,
                        prompt: generatedImage?.prompt,
                        narration: scene.narration,
                        styleId: generatedImage?.styleId,
                        stylePrompt: generatedImage?.stylePrompt,
                        styleOverrideId: sceneStyleOverrides[scene.scene_number],
                        visual: scene.visual,
                        status,
                        durationSeconds: scene.duration_seconds ?? estimatedSceneDuration,
                      };
                    })}
                    onRegenerateImage={regenerateImage}
                    onGenerateVideo={generateVideo}
                    isRegenerating={isGeneratingImage}
                    isSceneGenerating={(sceneNumber) => generatingVideoScenes.has(sceneNumber)}
                    onSceneStyleChange={handleSceneStyleChange}
                    styleOptions={STYLE_OPTIONS}
                  />

                  <Card className="rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button variant="ghost" onClick={() => setCurrentStep('script')} className="flex-1">
                        Retour au script
                      </Button>
                      <Button
                        onClick={finishProject}
                        disabled={generatedImages.length !== scriptData.scenes.length || isGeneratingImage}
                        className="flex-1 gap-2 text-sm"
                      >
                        <Check className="h-4 w-4" />
                        Terminer le projet
                      </Button>
                    </div>
                  </Card>
                </>
              )}
            </div>
        )}
      </div>
    </PageShell>
  );
};

export default CreateVideo;
