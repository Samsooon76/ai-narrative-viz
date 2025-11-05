import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AudioPlayer } from "@/components/ui/audio-player";
import { Wand2, Check, Volume2, RefreshCw, Play, Loader2, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { GridLoader } from "react-spinners";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/use-auth";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { VideoTimeline, type TimelinePlaybackController } from "@/components/VideoTimeline";
import { cn } from "@/lib/utils";
import PageShell from "@/components/layout/PageShell";
import { useSubscription } from "@/hooks/use-subscription";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

const sanitizeFilenameSegment = (value: string, fallback: string) => {
  const safe = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return safe.length > 0 ? safe : fallback;
};

const isSupabaseStorageUrl = (url?: string | null) => {
  if (!url) return false;
  return url.includes(".supabase.co/storage/v1/object/public/");
};

const uploadImageToSupabase = (() => {
  const cache = new Map<string, Promise<{ publicUrl: string }>>();

  return async (params: {
    sceneNumber: number;
    optionUrl: string;
    sceneTitle?: string;
    projectId?: string | null;
    ownerId?: string | null;
  }) => {
    const { sceneNumber, optionUrl, sceneTitle, projectId, ownerId } = params;
    const cacheKey = `${sceneNumber}-${optionUrl}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    const promise = (async () => {
      const response = await fetch(optionUrl);
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Impossible de récupérer l'image (${response.status}) ${text}`);
      }
      const contentType = response.headers.get("content-type") ?? "image/png";
      const arrayBuffer = await response.arrayBuffer();
      const extension = (() => {
        const lowered = contentType.toLowerCase();
        if (lowered.includes("png")) return "png";
        if (lowered.includes("jpeg") || lowered.includes("jpg")) return "jpg";
        if (lowered.includes("webp")) return "webp";
        const urlMatch = optionUrl.match(/\.([a-z0-9]+)(?:$|\?)/i);
        if (urlMatch?.[1]) {
          return urlMatch[1].toLowerCase();
        }
        return "png";
      })();

      const ownerSegment = sanitizeFilenameSegment(ownerId ?? "anonymous", "anonymous");
      const projectSegment = sanitizeFilenameSegment(projectId ?? "project", "proj");
      const sceneSegment = sanitizeFilenameSegment(sceneTitle ?? `scene-${sceneNumber}`, `scene-${sceneNumber}`);
      const filePath = `${ownerSegment}/${projectSegment}/scene-${sceneNumber}-${sceneSegment}-${Date.now()}.${extension}`;

      const upload = await supabase.storage
        .from("generated-images")
        .upload(filePath, new Blob([arrayBuffer], { type: contentType }), {
          contentType,
          upsert: false,
        });

      if (upload.error) {
        throw upload.error;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("generated-images").getPublicUrl(filePath);

      if (!publicUrl) {
        throw new Error("Impossible de récupérer l'URL publique de l'image uploadée.");
      }

      return { publicUrl };
    })();

    cache.set(cacheKey, promise);
    try {
      const result = await promise;
      return result;
    } catch (error) {
      cache.delete(cacheKey);
      throw error;
    }
  };
})();

type GenerationTaskStatus = "pending" | "loading" | "success" | "error";

type GenerationTask = {
  id: string;
  label: string;
  status: GenerationTaskStatus;
  helper?: string;
};

type GenerationOverlayProps = {
  title: string;
  subtitle?: string;
  tasks: GenerationTask[];
  activeTaskId?: string;
};

const GENERATION_STATUS_CLASSES: Record<GenerationTaskStatus, string> = {
  pending: "text-muted-foreground/70",
  loading: "text-primary",
  success: "text-emerald-400",
  error: "text-destructive",
};

const GENERATION_TASK_STYLES: Record<GenerationTaskStatus, string> = {
  pending: "border-white/10 bg-white/5",
  loading: "border-primary/50 bg-primary/15 shadow-[0_0_25px_rgba(59,130,246,0.25)]",
  success: "border-emerald-300/60 bg-emerald-300/15 shadow-[0_0_25px_rgba(52,211,153,0.25)]",
  error: "border-destructive/70 bg-destructive/20 shadow-[0_0_25px_rgba(248,113,113,0.25)]",
};

const GenerationOverlay = ({ title, subtitle, tasks, activeTaskId }: GenerationOverlayProps) => {
  const activeTaskRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeTaskRef.current) return;
    activeTaskRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [tasks, activeTaskId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/70 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="mb-6 space-y-1 text-left">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1 transition-all">
          {tasks.map((task) => {
            let icon = <Circle className={`h-4 w-4 transition-all duration-500 ${GENERATION_STATUS_CLASSES.pending}`} />;

            if (task.status === "loading") {
              icon = <Loader2 className={`h-4 w-4 animate-spin ${GENERATION_STATUS_CLASSES.loading}`} />;
            } else if (task.status === "success") {
              icon = <CheckCircle2 className={`h-4 w-4 animate-in fade-in zoom-in-50 ${GENERATION_STATUS_CLASSES.success}`} />;
            } else if (task.status === "error") {
              icon = <AlertCircle className={`h-4 w-4 animate-in fade-in zoom-in-50 ${GENERATION_STATUS_CLASSES.error}`} />;
            }

            const taskClasses = cn(
              "flex items-start gap-3 rounded-2xl px-4 py-3 transition-all duration-500 backdrop-blur",
              GENERATION_TASK_STYLES[task.status]
            );

            return (
              <div
                key={task.id}
                ref={task.id === activeTaskId ? (node) => { activeTaskRef.current = node; } : undefined}
                className={taskClasses}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black/40 shadow-inner">
                  {icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground transition-all duration-300">{task.label}</p>
                  {task.helper && (
                    <p className="text-xs text-muted-foreground transition-all duration-300">{task.helper}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const SCRIPT_TASK_FLOW: Array<Omit<GenerationTask, "status">> = [
  {
    id: "script-understand",
    label: "Analyse du brief",
    helper: "L'IA comprend le sujet, le ton et le style visuel souhaité.",
  },
  {
    id: "script-outline",
    label: "Structuration du plan",
    helper: "Planification des scènes et des moments clés du récit.",
  },
  {
    id: "script-write",
    label: "Rédaction scène par scène",
    helper: "Narration, dialogues et descriptions visuelles prennent forme.",
  },
  {
    id: "script-enhance",
    label: "Affinage créatif",
    helper: "Optimisation du rythme, choix des mots et suggestions visuelles.",
  },
  {
    id: "script-summary",
    label: "Préparation pour la suite",
    helper: "Le script est finalisé et prêt pour le storyboard.",
  },
];

const VOICE_TASK_FLOW: Array<Omit<GenerationTask, "status">> = [
  {
    id: "voice-setup",
    label: "Initialisation du studio vocal",
    helper: "Préparation du modèle Cartesia et ajustement des paramètres.",
  },
  {
    id: "voice-generate",
    label: "Génération des voix",
    helper: "Création des narrations scènes par scène.",
  },
  {
    id: "voice-sync",
    label: "Nettoyage & synchronisation",
    helper: "Analyse des durées réelles et alignement du storyboard audio.",
  },
  {
    id: "voice-ready",
    label: "Audios prêts pour le storyboard",
    helper: "Vos voix sont disponibles pour l'écoute et l'édition.",
  },
];

type ImageGenerationProgress = {
  total: number;
  processed: number;
  generated: number;
  failed: number;
};

const IMAGE_TASK_FLOW: Array<Omit<GenerationTask, "status">> = [
  {
    id: "image-prepare",
    label: "Préparation des prompts",
    helper: "L'IA ajuste le style et la continuité de chaque scène.",
  },
  {
    id: "image-generate",
    label: "Génération des images",
    helper: "Création des tableaux clés du storyboard.",
  },
  {
    id: "image-enhance",
    label: "Harmonisation visuelle",
    helper: "Vérification de la cohérence des personnages et de la lumière.",
  },
  {
    id: "image-save",
    label: "Sauvegarde & storyboard",
    helper: "Enregistrement des visuels et mise à jour du projet.",
  },
];

type SceneVoiceRecord = {
  voiceId: string;
  audioBase64: string;
  duration: number;
  waveform?: number[];
};

type VoiceClip = {
  id: string;
  label: string;
  start: number;
  duration: number;
  sceneNumber: number;
  accentClassName?: string;
  waveform?: number[];
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

const WAVEFORM_SAMPLE_COUNT = 120;

const extractWaveformFromBase64 = async (base64: string, sampleCount = WAVEFORM_SAMPLE_COUNT): Promise<number[]> => {
  if (typeof window === "undefined") {
    return [];
  }

  const AudioContextClass = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
    | typeof AudioContext
    | undefined;

  if (!AudioContextClass) {
    console.warn("AudioContext non disponible pour l'extraction de waveform.");
    return [];
  }

  try {
    const audioContext = new AudioContextClass();
    try {
      const blob = base64ToBlob(base64, "audio/wav");
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      if (audioBuffer.length === 0) {
        return [];
      }

      const channelCount = Math.max(audioBuffer.numberOfChannels, 1);
      const mergedData = new Float32Array(audioBuffer.length);

      for (let channel = 0; channel < channelCount; channel += 1) {
        const channelData = audioBuffer.getChannelData(Math.min(channel, audioBuffer.numberOfChannels - 1));
        for (let i = 0; i < channelData.length; i += 1) {
          mergedData[i] += channelData[i] / channelCount;
        }
      }

      const safeSampleCount = Math.max(16, Math.min(sampleCount, mergedData.length));
      const blockSize = Math.max(1, Math.floor(mergedData.length / safeSampleCount));
      const waveform: number[] = [];

      for (let i = 0; i < safeSampleCount; i += 1) {
        const start = i * blockSize;
        let peak = 0;
        for (let j = 0; j < blockSize && start + j < mergedData.length; j += 1) {
          const value = Math.abs(mergedData[start + j]);
          if (value > peak) {
            peak = value;
          }
        }
        waveform.push(Number.isFinite(peak) ? peak : 0);
      }

      const maxPeak = waveform.reduce((max, value) => (value > max ? value : max), 0);
      if (maxPeak <= 0) {
        return waveform;
      }

      return waveform.map((value) => Number((value / maxPeak).toFixed(3)));
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  } catch (error) {
    console.error("Échec de l'extraction du waveform:", error);
    return [];
  }
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

interface GeneratedImageOption {
  url: string;
}

interface GeneratedImage {
  sceneNumber: number;
  prompt: string;
  imageUrl?: string;
  options?: GeneratedImageOption[];
  selectedOptionIndex?: number;
  gridUrl?: string | null;
  recordId?: string;
  styleId?: string;
  stylePrompt?: string;
  videoUrl?: string;
  videoPrompt?: string;
  success?: boolean;
}

const normalizeGeneratedImageRecord = (raw: Partial<GeneratedImage>): GeneratedImage => {
  const sceneNumber =
    typeof raw.sceneNumber === "number" && Number.isFinite(raw.sceneNumber)
      ? raw.sceneNumber
      : Number.parseInt(String(raw.sceneNumber ?? 0), 10);

  const cleanedOptions = Array.isArray(raw.options)
    ? raw.options
        .map((option) => {
          if (option && typeof option.url === "string" && option.url.trim().length > 0) {
            return { url: option.url } as GeneratedImageOption;
          }
          return null;
        })
        .filter((option): option is GeneratedImageOption => option !== null)
    : [];

  if (
    cleanedOptions.length === 0 &&
    typeof raw.imageUrl === "string" &&
    raw.imageUrl.trim().length > 0
  ) {
    cleanedOptions.push({ url: raw.imageUrl });
  }

  let selectedOptionIndex: number | undefined;
  if (
    typeof raw.selectedOptionIndex === "number" &&
    Number.isInteger(raw.selectedOptionIndex) &&
    raw.selectedOptionIndex >= 0 &&
    raw.selectedOptionIndex < cleanedOptions.length
  ) {
    selectedOptionIndex = raw.selectedOptionIndex;
  } else if (typeof raw.imageUrl === "string" && raw.imageUrl.trim().length > 0) {
    const matchIndex = cleanedOptions.findIndex((option) => option.url === raw.imageUrl);
    if (matchIndex >= 0) {
      selectedOptionIndex = matchIndex;
    }
  }

  const styleId = raw.styleId ?? DEFAULT_STYLE_ID;

  return {
    sceneNumber: Number.isFinite(sceneNumber) ? sceneNumber : 0,
    prompt: raw.prompt ?? "",
    imageUrl: selectedOptionIndex != null ? cleanedOptions[selectedOptionIndex]?.url : raw.imageUrl,
    options: cleanedOptions,
    selectedOptionIndex,
    gridUrl: raw.gridUrl ?? null,
    recordId: raw.recordId,
    styleId,
    stylePrompt: raw.stylePrompt ?? resolveStylePrompt(styleId),
    videoUrl: raw.videoUrl,
    videoPrompt: raw.videoPrompt,
    success: raw.success ?? cleanedOptions.length > 0,
  };
};

type SceneStatus = 'loading' | 'ready' | 'generating-video' | 'error' | 'empty' | 'awaiting-selection';
type SceneFlowStatus = 'idle' | 'generating' | 'awaiting-selection' | 'video-generating' | 'completed';

const STUDIO_STEPS: { id: Step; label: string; description: string }[] = [
  { id: 'topic', label: 'Brief', description: 'Sujet et style visuel' },
  { id: 'script', label: 'Script', description: 'Narration par scène' },
  { id: 'images', label: 'Storyboard', description: 'Visuels & montage' },
  { id: 'complete', label: 'Export', description: 'Rendering final' },
];

const CreateVideo = () => {
  const { user, loading } = useAuth();
  const { subscription, isNearLimit, isAtLimit, remainingVideos } = useSubscription();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState<Step>('topic');
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  
  // Step 1: Topic
  const [projectName, setProjectName] = useState("");
  const [topic, setTopic] = useState("");
  const [visualStyle, setVisualStyle] = useState<string>("none");
  const [isGenerating, setIsGenerating] = useState(false);
  const [scriptGenerationPhase, setScriptGenerationPhase] = useState<'idle' | GenerationTaskStatus>('idle');
  const [scriptProgressIndex, setScriptProgressIndex] = useState(0);
  
  // Step 2: Script
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  
  // Step 3: Images
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const fallbackImagesRef = useRef<Record<number, string>>({});
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
  const [imagePromptSuggestions, setImagePromptSuggestions] = useState<Record<number, string>>({});
  const [imagePromptStatus, setImagePromptStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [imagePromptError, setImagePromptError] = useState<string | null>(null);
  const [sceneVoiceData, setSceneVoiceData] = useState<Record<number, SceneVoiceRecord>>({});
  const [sceneAudioSpeeds, setSceneAudioSpeeds] = useState<Record<number, number>>({});
  const [sceneAudioClipEdits, setSceneAudioClipEdits] = useState<Record<string, { start: number; duration: number }>>({});
  const [sceneCustomDurations, setSceneCustomDurations] = useState<Record<number, number>>({});
  const [voiceGenerationPhase, setVoiceGenerationPhase] = useState<'idle' | GenerationTaskStatus>('idle');
  const [voiceProgressIndex, setVoiceProgressIndex] = useState(0);
  const [imageGenerationPhase, setImageGenerationPhase] = useState<'idle' | GenerationTaskStatus>('idle');
  const [imageProgressIndex, setImageProgressIndex] = useState(0);
  const [imageGenerationProgress, setImageGenerationProgress] = useState<ImageGenerationProgress>({
    total: 0,
    processed: 0,
    generated: 0,
    failed: 0,
  });
  const videoNegativePrompt = "jitter, bad hands, blur, distortion";
  const videoSeed = "";
  const timelinePreviewRef = useRef<HTMLVideoElement | null>(null);
  const timelinePlaybackControllerRef = useRef<TimelinePlaybackController | null>(null);
  const [activeTimelineScene, setActiveTimelineScene] = useState<number | null>(null);
  const [sceneFlowStatus, setSceneFlowStatus] = useState<Record<number, SceneFlowStatus>>({});
  const [activeWizardSceneIndex, setActiveWizardSceneIndex] = useState(0);
  const [wizardStarted, setWizardStarted] = useState(false);
  const [wizardCompleted, setWizardCompleted] = useState(false);
  const [showWizardChoice, setShowWizardChoice] = useState(false);
  const [wizardEntryDecision, setWizardEntryDecision] = useState<'resume' | 'timeline' | null>(null);
  const [wizardResumeIndex, setWizardResumeIndex] = useState<number | null>(null);
  const [wizardAssetsReady, setWizardAssetsReady] = useState(false);
  const [overlaySceneNumber, setOverlaySceneNumber] = useState<number | null>(null);
  const [isRegeneratePopoverOpen, setIsRegeneratePopoverOpen] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState("");
  const [pendingRegenerateSceneNumber, setPendingRegenerateSceneNumber] = useState<number | null>(null);

  const sceneCount = useMemo(() => scriptData?.scenes?.length ?? 0, [scriptData]);
  const filmTitle = useMemo(() => projectName || scriptData?.title || topic || 'the film', [projectName, scriptData?.title, topic]);
  const generatedVoiceCount = useMemo(
    () => Object.values(sceneVoiceStatus).filter((status) => status === 'success').length,
    [sceneVoiceStatus]
  );

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


  const storyboardComplete = useMemo(() => {
    if (!scriptData) return false;
    if (!scriptData.scenes.length) return false;
    return scriptData.scenes.every((scene) => {
      const generated = generatedImages.find((img) => img.sceneNumber === scene.scene_number);
      return Boolean(generated?.imageUrl);
    });
  }, [generatedImages, scriptData]);

  const wizardProgress = useMemo(() => {
    if (!scriptData?.scenes?.length) {
      return {
        totalScenes: 0,
        completedScenes: 0,
        firstIncompleteIndex: 0,
        hasAnyGenerated: false,
        hasPartialProgress: false,
        allCompleted: false,
      } as const;
    }

    let completedScenes = 0;
    let firstIncompleteIndex = -1;
    let hasAnyGenerated = false;

    scriptData.scenes.forEach((scene, index) => {
      const generated = generatedImages.find((img) => img.sceneNumber === scene.scene_number);
      const hasStoredImage = Boolean(generated?.imageUrl); // Supabase URL déjà enregistré
      const hasStoredSelection =
        typeof generated?.selectedOptionIndex === 'number' &&
        Boolean(generated?.options?.[generated.selectedOptionIndex]);
      const hasAnyOptions = Boolean(generated?.options?.length);

      if (hasStoredImage) {
        completedScenes += 1;
        hasAnyGenerated = true;
        return;
      }

      if (hasStoredSelection) {
        const optionUrl = generated?.options?.[generated.selectedOptionIndex ?? -1]?.url;
        if (optionUrl) {
          fallbackImagesRef.current[scene.scene_number] = optionUrl;
        }
        completedScenes += 1;
        hasAnyGenerated = true;
        return;
      }

      if (hasAnyOptions) {
        hasAnyGenerated = true;
        if (firstIncompleteIndex === -1) {
          firstIncompleteIndex = index;
        }
        return;
      }

      if (firstIncompleteIndex === -1) {
        firstIncompleteIndex = index;
      }
    });

    if (firstIncompleteIndex === -1) {
      firstIncompleteIndex = 0;
    }

    const totalScenes = scriptData.scenes.length;
    const allCompleted = completedScenes === totalScenes && totalScenes > 0;
    const hasPartialProgress = hasAnyGenerated && !allCompleted;

    return {
      totalScenes,
      completedScenes,
      firstIncompleteIndex,
      hasAnyGenerated,
      hasPartialProgress,
      allCompleted,
    } as const;
  }, [generatedImages, scriptData]);

  const wizardRemainingScenes = useMemo(() => {
    return Math.max(wizardProgress.totalScenes - wizardProgress.completedScenes, 0);
  }, [wizardProgress]);

  const wizardProgressPercent = useMemo(() => {
    if (!wizardProgress.totalScenes) return 0;
    return Math.round((wizardProgress.completedScenes / wizardProgress.totalScenes) * 100);
  }, [wizardProgress]);

  const totalWizardScenes = scriptData?.scenes.length ?? 0;
  const wizardActive =
    currentStep === 'images' && wizardStarted && !wizardCompleted && totalWizardScenes > 0 && Boolean(scriptData);
  const activeWizardScene = wizardActive ? scriptData!.scenes[Math.min(activeWizardSceneIndex, totalWizardScenes - 1)] : null;
  const activeWizardSceneNumber = activeWizardScene?.scene_number ?? null;
  const activeWizardStatus: SceneFlowStatus = activeWizardSceneNumber != null
    ? sceneFlowStatus[activeWizardSceneNumber] ?? 'idle'
    : 'idle';
  const activeWizardGeneratedImage = activeWizardSceneNumber != null
    ? generatedImages.find((img) => img.sceneNumber === activeWizardSceneNumber)
    : undefined;
  const activeWizardOptions = activeWizardGeneratedImage?.options ?? [];
  const activeWizardSelectedIndex = activeWizardGeneratedImage?.selectedOptionIndex ?? null;
  const activeWizardSelectedUrl = activeWizardSelectedIndex != null
    ? activeWizardOptions[activeWizardSelectedIndex]?.url ?? activeWizardGeneratedImage?.imageUrl
    : activeWizardGeneratedImage?.imageUrl;
  const activeWizardNarration = activeWizardScene?.narration?.trim() ?? '';
  const canNavigateWizardPrev = wizardActive && activeWizardSceneIndex > 0;
  const canNavigateWizardNext = wizardActive && scriptData && activeWizardSceneIndex < scriptData.scenes.length - 1;
  const isWizardSceneGenerating = activeWizardStatus === 'generating';
  const isWizardVideoGenerating = activeWizardStatus === 'video-generating';
  const isWizardLastScene = wizardActive && scriptData ? activeWizardSceneIndex === scriptData.scenes.length - 1 : false;
  const canFinishWizard = isWizardLastScene && activeWizardStatus === 'completed';

  useEffect(() => {
    if (scriptGenerationPhase === 'loading') {
      const interval = window.setInterval(() => {
        setScriptProgressIndex((previous) => {
          if (previous >= SCRIPT_TASK_FLOW.length - 1) {
            return previous;
          }
          return previous + 1;
        });
      }, 1600);
      return () => window.clearInterval(interval);
    }
    return undefined;
  }, [scriptGenerationPhase]);

  useEffect(() => {
    if (scriptGenerationPhase === 'success' || scriptGenerationPhase === 'error') {
      const timeout = window.setTimeout(() => setScriptGenerationPhase('idle'), 1500);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [scriptGenerationPhase]);

  useEffect(() => {
    if (scriptGenerationPhase === 'success') {
      setScriptProgressIndex(SCRIPT_TASK_FLOW.length - 1);
    }
    if (scriptGenerationPhase === 'idle') {
      setScriptProgressIndex(0);
    }
  }, [scriptGenerationPhase]);

  const voiceAudioClips = useMemo(() => {
    if (!scriptData || !scriptData.scenes.length) return [] as VoiceClip[];

    // Calculate cumulative start positions based on ACTUAL audio durations
    const sceneStartPositions: Record<number, number> = {};
    let cumulativeTime = 0;
    scriptData.scenes.forEach((scene) => {
      sceneStartPositions[scene.scene_number] = cumulativeTime;
      // Priority: real audio duration > custom duration > script duration > estimated
      const audioDuration = sceneAudioDurations?.[scene.scene_number];
      const customDuration = sceneCustomDurations?.[scene.scene_number];
      const scriptDuration = scene.duration_seconds ?? 0;
      const effectiveDuration = audioDuration ?? customDuration ?? (scriptDuration > 0 ? scriptDuration : estimatedSceneDuration);
      cumulativeTime += effectiveDuration;
    });

    const clips: VoiceClip[] = [];
    scriptData.scenes.forEach((scene) => {
      // Check if voice data exists (persistent) OR if audio URL exists (temporary)
      if (!sceneVoiceData[scene.scene_number] && !sceneAudioUrls[scene.scene_number]) return;
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
        sceneNumber: scene.scene_number,
        accentClassName:
          "border-emerald-400/40 bg-gradient-to-r from-emerald-400/30 via-emerald-400/15 to-emerald-400/10 text-emerald-400",
        waveform: voiceRecord?.waveform,
      });
    });
    return clips;
  }, [scriptData, sceneAudioUrls, sceneAudioDurations, sceneCustomDurations, estimatedSceneDuration, sceneVoiceData, voiceOptions, sceneAudioSpeeds, sceneAudioClipEdits]);


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

  const persistImagesData = useCallback(async (images: GeneratedImage[]) => {
    if (!projectId) return;
    try {
      const { error } = await supabase
        .from('video_projects')
        .update({ images_data: JSON.stringify(images) })
        .eq('id', projectId);
      if (error) {
        console.error('Erreur sauvegarde images:', error);
      }
    } catch (error) {
      console.error('Erreur inattendue sauvegarde images:', error);
    }
  }, [projectId]);

  useEffect(() => {
    if (!voiceAudioClips.length) {
      return;
    }

    const timingByScene: Record<number, { duration: number; start: number }> = {};
    voiceAudioClips.forEach((clip) => {
      if (!Number.isFinite(clip.sceneNumber)) {
        return;
      }
      const normalizedDuration = Number.isFinite(clip.duration) ? Math.max(clip.duration, 0) : 0;
      timingByScene[clip.sceneNumber] = {
        duration: normalizedDuration,
        start: Math.max(clip.start, 0),
      };
    });

    if (!Object.keys(timingByScene).length) {
      return;
    }

    setSceneAudioDurations((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(timingByScene).forEach(([sceneNumberStr, { duration }]) => {
        const sceneNumber = Number(sceneNumberStr);
        if (!Number.isFinite(sceneNumber) || duration <= 0) {
          return;
        }
        const normalized = Number(duration.toFixed(3));
        if (!Number.isFinite(normalized)) {
          return;
        }
        if (Math.abs((next[sceneNumber] ?? 0) - normalized) > 0.001) {
          next[sceneNumber] = normalized;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setSceneCustomDurations((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(timingByScene).forEach(([sceneNumberStr, { duration }]) => {
        const sceneNumber = Number(sceneNumberStr);
        if (!Number.isFinite(sceneNumber) || duration <= 0) {
          return;
        }
        const normalized = Number(duration.toFixed(3));
        if (!Number.isFinite(normalized)) {
          return;
        }
        if (Math.abs((next[sceneNumber] ?? 0) - normalized) > 0.001) {
          next[sceneNumber] = normalized;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setSceneVoiceData((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(timingByScene).forEach(([sceneNumberStr, { duration }]) => {
        const sceneNumber = Number(sceneNumberStr);
        if (!Number.isFinite(sceneNumber) || duration <= 0) {
          return;
        }
        const record = next[sceneNumber];
        if (!record) {
          return;
        }
        const normalized = Number(duration.toFixed(3));
        if (!Number.isFinite(normalized)) {
          return;
        }
        if (Math.abs(record.duration - normalized) > 0.001) {
          next[sceneNumber] = { ...record, duration: normalized };
          changed = true;
        }
      });
      if (!changed) {
        return prev;
      }
      void persistVoiceData(next);
      return next;
    });
  }, [voiceAudioClips, persistVoiceData]);

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
  const waveformQueueRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    audioUrlsRef.current = sceneAudioUrls;
  }, [sceneAudioUrls]);

  useEffect(() => {
    sceneVoiceDataRef.current = sceneVoiceData;
  }, [sceneVoiceData]);

  useEffect(() => {
    Object.entries(sceneVoiceData).forEach(([sceneNumberStr, record]) => {
      const sceneNumber = Number(sceneNumberStr);
      if (!Number.isFinite(sceneNumber)) {
        return;
      }
      if (!record?.audioBase64) {
        return;
      }
      if (record.waveform && record.waveform.length > 0) {
        return;
      }
      if (waveformQueueRef.current.has(sceneNumber)) {
        return;
      }

      waveformQueueRef.current.add(sceneNumber);

      void extractWaveformFromBase64(record.audioBase64)
        .then((waveform) => {
          if (!waveform.length) {
            return;
          }
          setSceneVoiceData((prev) => {
            const current = prev[sceneNumber];
            if (!current) {
              return prev;
            }
            if (current.waveform && current.waveform.length > 0) {
              return prev;
            }
            const next = {
              ...prev,
              [sceneNumber]: {
                ...current,
                waveform,
              },
            };
            void persistVoiceData(next);
            return next;
          });
        })
        .catch((error) => {
          console.error(`Erreur lors de l'extraction du waveform pour la scène ${sceneNumber}:`, error);
        })
        .finally(() => {
          waveformQueueRef.current.delete(sceneNumber);
        });
    });
  }, [sceneVoiceData, persistVoiceData]);

  // Restore missing audio URLs from sceneVoiceData
  useEffect(() => {
    const urlsToCreate: Record<number, string> = {};
    const durationsToAdd: Record<number, number> = {};
    let hasNewData = false;

    Object.entries(sceneVoiceData).forEach(([sceneNumberStr, record]) => {
      const sceneNumber = Number(sceneNumberStr);
      if (!Number.isFinite(sceneNumber)) return;
      if (!record?.audioBase64) return;
      // If URL is missing, recreate it from audioBase64
      if (!sceneAudioUrls[sceneNumber]) {
        try {
          const blob = base64ToBlob(record.audioBase64);
          const objectUrl = URL.createObjectURL(blob);
          urlsToCreate[sceneNumber] = objectUrl;
          hasNewData = true;
        } catch (error) {
          console.error(`Erreur création URL audio scène ${sceneNumber}:`, error);
        }
      }
      // Also restore duration if missing
      if (!sceneAudioDurations[sceneNumber] && record.duration) {
        durationsToAdd[sceneNumber] = record.duration;
        hasNewData = true;
      }
    });

    if (hasNewData) {
      if (Object.keys(urlsToCreate).length > 0) {
        setSceneAudioUrls((prev) => ({ ...prev, ...urlsToCreate }));
      }
      if (Object.keys(durationsToAdd).length > 0) {
        setSceneAudioDurations((prev) => ({ ...prev, ...durationsToAdd }));
      }
    }
  }, [sceneVoiceData, sceneAudioUrls, sceneAudioDurations]);

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
    async (scene: ScriptScene, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
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
                waveform: undefined,
              },
            };
            void persistVoiceData(next);
            return next;
          });
          setSceneVoiceStatus((prev) => ({ ...prev, [scene.scene_number]: "success" }));

          // Show toast with actual duration
          if (!silent) {
            toast({
              title: "Voix générée",
              description: `Scène ${scene.scene_number} - Durée: ${duration.toFixed(2)}s`,
            });
          }
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
        if (!silent) {
          toast({
            title: "Erreur",
            description: extractFunctionErrorMessage(error, "Impossible de générer la voix pour cette scène."),
            variant: "destructive",
          });
        }
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

  const syncAllDurationsWithAudio = useCallback(async () => {
    if (!scriptData) return;

    console.log("🔄 Synchronisation des durées avec les audios...");

    let syncedCount = 0;
    const updatedDurations: Record<number, number> = {};

    scriptData.scenes.forEach((scene) => {
      const audioDuration = sceneAudioDurations[scene.scene_number];
      if (audioDuration && audioDuration > 0) {
        updatedDurations[scene.scene_number] = audioDuration;
        syncedCount++;
        console.log(
          `✓ Scène ${scene.scene_number}: ${audioDuration.toFixed(2)}s`
        );
      }
    });

    if (syncedCount > 0) {
      setSceneCustomDurations((prev) => ({
        ...prev,
        ...updatedDurations,
      }));

      // Persist the synced durations
      await persistVoiceData(sceneVoiceDataRef.current, sceneAudioClipEdits, updatedDurations);

      const totalDuration = Object.values(updatedDurations).reduce((a, b) => a + b, 0);

      toast({
        title: "✓ Durées synchronisées !",
        description: `${syncedCount} scènes mises à jour - Durée totale: ${totalDuration.toFixed(1)}s`,
      });

      console.log(`✅ ${syncedCount} scènes synchronisées - Total: ${totalDuration.toFixed(1)}s`);
    } else {
      toast({
        title: "Aucune synchronisation",
        description: "Aucun audio trouvé pour synchroniser les durées.",
        variant: "default"
      });
    }
  }, [scriptData, sceneAudioDurations, persistVoiceData, sceneAudioClipEdits, toast]);

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

    setVoiceGenerationPhase('loading');
    setVoiceProgressIndex(0);
    let encounteredError = false;

    try {
      // Generate voices sequentially with 1 second delay between each call
      for (let i = 0; i < voicesToGenerate.length; i++) {
        if (i > 0) {
          // Wait 1 second before next API call
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await generateVoiceForScene(voicesToGenerate[i], { silent: true });
      }

      // Wait a moment for the last persistence to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Trigger a final save in background (best-effort, avoid blocking UX)
      void persistVoiceData(sceneVoiceDataRef.current);
    } catch (error) {
      console.error('Erreur génération voix:', error);
      encounteredError = true;
      toast({
        title: "Erreur",
        description: "Impossible de générer toutes les voix. Réessayez dans un instant.",
        variant: "destructive",
      });
    }
    setVoiceProgressIndex(VOICE_TASK_FLOW.length - 1);
    setVoiceGenerationPhase(encounteredError ? 'error' : 'success');
  }, [scriptData, sceneAudioUrls, generateVoiceForScene, toast, persistVoiceData]);

  useEffect(() => {
    if (voiceGenerationPhase === 'success' || voiceGenerationPhase === 'error') {
      const timeoutDuration = voiceGenerationPhase === 'error' ? 2600 : 1500;
      const timeout = window.setTimeout(() => setVoiceGenerationPhase('idle'), timeoutDuration);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [voiceGenerationPhase]);

  useEffect(() => {
    if (voiceGenerationPhase === 'success') {
      setVoiceProgressIndex(VOICE_TASK_FLOW.length - 1);
    }
    if (voiceGenerationPhase === 'idle') {
      setVoiceProgressIndex(0);
    }
  }, [voiceGenerationPhase]);

  useEffect(() => {
    if (voiceGenerationPhase !== 'loading') {
      return;
    }
    if (generatedVoiceCount > 0) {
      setVoiceProgressIndex((previous) => Math.max(previous, 1));
    }
    if (sceneCount > 0 && generatedVoiceCount === sceneCount) {
      setVoiceProgressIndex((previous) => Math.max(previous, 2));
    }
  }, [voiceGenerationPhase, generatedVoiceCount, sceneCount]);

  useEffect(() => {
    if (imageGenerationPhase === 'success' || imageGenerationPhase === 'error') {
      const timeoutDuration = imageGenerationPhase === 'error' ? 3000 : 1800;
      const timeout = window.setTimeout(() => setImageGenerationPhase('idle'), timeoutDuration);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [imageGenerationPhase]);

  useEffect(() => {
    if (imageGenerationPhase === 'success') {
      setImageProgressIndex(IMAGE_TASK_FLOW.length - 1);
    }
    if (imageGenerationPhase === 'idle') {
      setImageProgressIndex(0);
      setImageGenerationProgress({
        total: 0,
        processed: 0,
        generated: 0,
        failed: 0,
      });
    }
  }, [imageGenerationPhase]);

  useEffect(() => {
    if (imageGenerationPhase !== 'loading') {
      return;
    }
    if (imageGenerationProgress.processed > 0) {
      setImageProgressIndex((previous) => Math.max(previous, 1));
    }
    if (
      imageGenerationProgress.generated >= Math.max(1, Math.floor(imageGenerationProgress.total / 2)) ||
      imageGenerationProgress.processed >= Math.max(1, Math.floor(imageGenerationProgress.total * 0.6))
    ) {
      setImageProgressIndex((previous) => Math.max(previous, 2));
    }
    if (
      imageGenerationProgress.total > 0 &&
      imageGenerationProgress.processed === imageGenerationProgress.total
    ) {
      setImageProgressIndex((previous) => Math.max(previous, 3));
    }
  }, [imageGenerationPhase, imageGenerationProgress]);

  // Auto-sync durations when audios are loaded
  useEffect(() => {
    if (currentStep === 'script' && scriptData && Object.keys(sceneAudioDurations).length > 0 && !Object.keys(sceneCustomDurations).length) {
      // If we have audios but no custom durations set, auto-sync
      console.log("📡 Auto-syncing durations from loaded audios...");
      syncAllDurationsWithAudio();
    }
  }, [currentStep, scriptData, sceneAudioDurations, sceneCustomDurations, syncAllDurationsWithAudio]);

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
  const suggestion = imagePromptSuggestions[scene.scene_number];
  const continuityInstruction = `This is sequential scene ${scene.scene_number} of the animated short "${filmTitle}". Maintain consistent character design, wardrobe, color palette, lighting mood, era and world-building with the previous scenes unless the brief explicitly demands a change.`;

  if (suggestion) {
    return [
      `Style goal: ${stylePrompt}`,
      continuityInstruction,
      `Visual brief: ${suggestion}`,
      'Output must suit a 16:9 landscape frame ready for animation at 480p resolution, with clean framing and no typography.'
    ].join("\n");
  }

  return [
    `Style goal: ${stylePrompt}`,
    continuityInstruction,
    `Scene brief (auto-translate into fluent cinematic English, enrich with camera motion, lighting and atmosphere details): ${scene.visual}`,
    'Avoid any text, captions, signage, UI elements, or typography unless the scene brief explicitly mandates readable wording.',
    'Avoid frames, letterboxing, watermarks, or decorative borders so the artwork fills the frame cleanly.',
    'Design a single 16:9 landscape illustration that works as a keyframe for animation and keeps the same main characters throughout the story.'
  ].join("\n");
}, [filmTitle, imagePromptSuggestions]);

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
              const record = value as Partial<SceneVoiceRecord> & { audioBase64?: string; waveform?: unknown };
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
                  waveform: Array.isArray(record.waveform)
                    ? (record.waveform as unknown[]).map((value) =>
                        typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(3)) : 0
                      )
                    : undefined,
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
        const normalizedImages = rawImages
          .map((img: Partial<GeneratedImage>) => normalizeGeneratedImageRecord(img))
          .sort((a, b) => a.sceneNumber - b.sceneNumber);

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
        const imagesArray: GeneratedImage[] = Object.entries(rawImages)
          .map(([sceneNumber, imageUrl]) =>
            normalizeGeneratedImageRecord({
              sceneNumber: Number.parseInt(sceneNumber, 10),
              imageUrl: typeof imageUrl === 'string' ? imageUrl : String(imageUrl ?? ''),
              prompt: '',
            })
          )
          .sort((a, b) => a.sceneNumber - b.sceneNumber);

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
    } finally {
      setWizardAssetsReady(true);
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    setIsLoadingProject(true);
    setWizardStarted(false);
    setWizardCompleted(false);
    setWizardEntryDecision(null);
    setShowWizardChoice(false);
    setActiveWizardSceneIndex(0);
    setSceneFlowStatus({});
    fallbackImagesRef.current = {};
    setWizardAssetsReady(false);
    setGeneratedImages([]);
    setOverlaySceneNumber(null);
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
        setImagePromptSuggestions({});
        setImagePromptStatus('idle');
        setImagePromptError(null);

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


// Génération automatique des prompts d'images si pas encore générés
// (fallback si la génération automatique lors de la création du script a échoué)
useEffect(() => {
  if (!scriptData || !scriptData.scenes?.length) return;
  if (!user) return;
  if (currentStep !== 'script') return;
  if (imagePromptStatus !== 'idle') return;
  if (Object.keys(imagePromptSuggestions).length > 0) return;

  // Attendre un peu avant de générer (au cas où la génération automatique est en cours)
  let isCancelled = false;
  const timeoutId = setTimeout(() => {
    setImagePromptStatus('loading');
    setImagePromptError(null);

    (async () => {
      console.log('🎨 Génération des prompts d\'images (fallback automatique)...');
      const { data, error } = await supabase.functions.invoke<{ prompts?: Array<{ scene_number?: number; prompt?: string }> }>('generate-prompts', {
        body: {
          script: JSON.stringify(scriptData),
          visualStyle,
        },
      });

      if (isCancelled) return;

      if (error) {
        console.error('Erreur génération prompts visuels:', error);
        setImagePromptStatus('error');
        setImagePromptError(extractFunctionErrorMessage(error, "Impossible de générer les prompts d'images"));
        return;
      }

      const promptsArray = Array.isArray(data?.prompts) ? data.prompts as Array<{ scene_number?: number; prompt?: string }> : [];
      const mapped: Record<number, string> = {};
      for (const item of promptsArray) {
        if (typeof item?.scene_number === 'number' && typeof item?.prompt === 'string') {
          mapped[item.scene_number] = item.prompt;
        }
      }

      if (Object.keys(mapped).length === 0) {
        setImagePromptStatus('error');
        setImagePromptError("Les prompts d'images renvoyés sont vides.");
        return;
      }

      setImagePromptSuggestions(mapped);
      setImagePromptStatus('success');
      console.log(`✓ ${Object.keys(mapped).length} prompts d'images générés (fallback)`);
    })().catch((err) => {
      console.error('Erreur inattendue génération prompts:', err);
      if (isCancelled) return;
      setImagePromptStatus('error');
      setImagePromptError(err instanceof Error ? err.message : 'Erreur interne');
    });
  }, 2000); // Attendre 2 secondes pour laisser le temps à la génération automatique

  return () => {
    isCancelled = true;
    clearTimeout(timeoutId);
  };
}, [currentStep, extractFunctionErrorMessage, imagePromptStatus, imagePromptSuggestions, scriptData, supabase, user, visualStyle]);

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
    if (!user) {
      toast({
        title: 'Connexion requise',
        description: 'Identifiez-vous avant de générer un script.',
        variant: 'destructive',
      });
      return;
    }
    if (!topic.trim() || !projectName.trim()) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs",
        variant: "destructive"
      });
      return;
    }

    setScriptGenerationPhase('loading');
    setScriptProgressIndex(0);
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-script', {
        body: { topic, visualStyle }
      });

      if (error) throw error;
      if (!data || !data.script) {
        throw new Error('Aucun script reçu');
      }

      // 1. Afficher le script immédiatement
      setScriptData(data.script);
      setCurrentStep('script');

      // Réinitialiser les prompts pour forcer la régénération
      setImagePromptSuggestions({});
      setImagePromptStatus('idle');
      setImagePromptError(null);

      // 2. Générer automatiquement les prompts d'images APRÈS avoir affiché le script
      // Le script est déjà visible pour l'utilisateur, on génère les prompts en arrière-plan
      // Petit délai pour que l'UI se mette à jour avec le script
      setTimeout(async () => {
        console.log('🎨 Génération automatique des prompts d\'images pour toutes les scènes...');
        setImagePromptStatus('loading'); // Indiquer que la génération des prompts est en cours
        
        try {
          const promptsResponse = await supabase.functions.invoke<{ prompts?: Array<{ scene_number?: number; prompt?: string }> }>('generate-prompts', {
            body: {
              script: JSON.stringify(data.script),
              visualStyle,
            },
          });

          if (promptsResponse.error) {
            console.error('Erreur génération prompts (non bloquant):', promptsResponse.error);
            setImagePromptStatus('error');
            setImagePromptError(extractFunctionErrorMessage(promptsResponse.error, "Les prompts d'images seront générés plus tard"));
            toast({
              title: "Avertissement",
              description: "Les prompts d'images seront générés plus tard.",
              variant: "default"
            });
          } else {
            const promptsArray = Array.isArray(promptsResponse.data?.prompts) 
              ? promptsResponse.data.prompts as Array<{ scene_number?: number; prompt?: string }> 
              : [];
            const mapped: Record<number, string> = {};
            for (const item of promptsArray) {
              if (typeof item?.scene_number === 'number' && typeof item?.prompt === 'string') {
                mapped[item.scene_number] = item.prompt;
              }
            }

            if (Object.keys(mapped).length > 0) {
              setImagePromptSuggestions(mapped);
              setImagePromptStatus('success');
              console.log(`✓ ${Object.keys(mapped).length} prompts d'images générés automatiquement`);
            } else {
              setImagePromptStatus('error');
              setImagePromptError("Aucun prompt d'image généré");
            }
          }
        } catch (promptsError) {
          console.error('Erreur génération prompts (non bloquant):', promptsError);
          setImagePromptStatus('error');
          setImagePromptError(extractFunctionErrorMessage(promptsError, "Erreur lors de la génération des prompts"));
          // Ne pas bloquer le processus même si les prompts échouent
        }
      }, 500); // Délai de 500ms pour que le script s'affiche d'abord
      setScriptGenerationPhase('success');
      setScriptProgressIndex(SCRIPT_TASK_FLOW.length - 1);

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
      setScriptGenerationPhase('error');
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
      
      setWizardEntryDecision(null);
      setWizardStarted(false);
      setWizardCompleted(false);
      setShowWizardChoice(false);
      setActiveWizardSceneIndex(0);
      setSceneFlowStatus({});
      setSceneStyleOverrides({});
      setGeneratedImages([]);
      fallbackImagesRef.current = {};
      setWizardAssetsReady(false);

      setCurrentStep('images');
      setWizardAssetsReady(true);
      
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

  const generateSceneImage = useCallback(async (sceneNumber: number, config?: { silent?: boolean; skipProgressTracking?: boolean; customPrompt?: string }) => {
    if (!scriptData || !projectId) {
      throw new Error("Projet introuvable pour la génération d'image.");
    }
    
    const scene = scriptData.scenes.find(s => s.scene_number === sceneNumber);
    if (!scene) {
      throw new Error(`Scène ${sceneNumber} introuvable.`);
    }

    const useProgressTracking = !config?.skipProgressTracking;

    if (useProgressTracking) {
      setIsGeneratingImage(true);
      setImageGenerationPhase('loading');
      setImageProgressIndex(0);
      setImageGenerationProgress({
        total: 1,
        processed: 0,
        generated: 0,
        failed: 0,
      });
    }

    try {
      const overrideStyle = sceneStyleOverrides[sceneNumber];
      const selectedStyleId = overrideStyle ?? visualStyle;
      const styleId = resolveStyleId(selectedStyleId);
      const stylePrompt = resolveStylePrompt(styleId);
      const prompt = config?.customPrompt ?? buildImagePrompt(scene, stylePrompt);

      let generationPayload: {
        options: string[];
        gridUrl: string | null;
        recordId?: string | null;
        styleId: string;
        stylePrompt: string;
      };

      const { data, error } = await supabase.functions.invoke<{
        options?: string[];
        recordId?: string | null;
        gridUrl?: string | null;
        styleId?: string;
        stylePrompt?: string;
      }>('generate-image', {
        body: {
          prompt,
          sceneTitle: scene.title,
          styleId,
          stylePrompt,
          numImages: 4,
          imageSize: 'landscape_16_9',
          imageResolution: '480p',
          guidanceScale: 3.5,
          numInferenceSteps: 4,
        },
      });

      if (error) {
        console.error("Erreur de l'edge function Fal.ai:", error);
        throw error;
      }

      const optionUrls: string[] = (data?.options ?? []).filter(
        (url): url is string => typeof url === 'string' && url.trim().length > 0,
      );

      if (!optionUrls.length) {
        console.error("Pas d'options dans la réponse Fal.ai:", data);
        throw new Error('Aucune proposition d’image reçue');
      }

      generationPayload = {
        options: optionUrls,
        gridUrl: typeof data?.gridUrl === 'string' && data.gridUrl.trim().length > 0 ? data.gridUrl : null,
        recordId: data?.recordId ?? null,
        styleId: data?.styleId ?? styleId,
        stylePrompt: data?.stylePrompt ?? stylePrompt,
      };

      const normalizedOptions: GeneratedImageOption[] = generationPayload.options.map((url) => ({ url }));

      const newImage = normalizeGeneratedImageRecord({
        sceneNumber: scene.scene_number,
        prompt,
        options: normalizedOptions,
        gridUrl: generationPayload.gridUrl,
        recordId: generationPayload.recordId,
        styleId: generationPayload.styleId,
        stylePrompt: generationPayload.stylePrompt,
        success: true,
      });

      setGeneratedImages((prev) => {
        const others = prev.filter((img) => img.sceneNumber !== scene.scene_number);
        const existingFallback = fallbackImagesRef.current[scene.scene_number];
        const safeImage = existingFallback && !newImage.imageUrl
          ? { ...newImage, imageUrl: existingFallback }
          : newImage;

        if (safeImage.imageUrl) {
          delete fallbackImagesRef.current[scene.scene_number];
        }

        const updated = [...others, safeImage].sort((a, b) => a.sceneNumber - b.sceneNumber);
        void persistImagesData(updated);
        return updated;
      });

      setSceneStyleOverrides((prev) => ({
        ...prev,
        [sceneNumber]: selectedStyleId,
      }));

      if (useProgressTracking) {
        setImageGenerationProgress({
          total: 1,
          processed: 1,
          generated: 1,
          failed: 0,
        });
        setImageProgressIndex(IMAGE_TASK_FLOW.length - 1);
        setImageGenerationPhase('success');
      }

      if (!config?.silent) {
        toast({
          title: "Images prêtes",
          description: `4 propositions générées pour la scène ${sceneNumber}`,
        });
      }

      return newImage;
    } catch (error) {
      console.error('Erreur régénération image:', error);
      if (useProgressTracking) {
        setImageGenerationProgress({
          total: 1,
          processed: 1,
          generated: 0,
          failed: 1,
        });
        setImageProgressIndex(IMAGE_TASK_FLOW.length - 1);
        setImageGenerationPhase('error');
      }
      if (!config?.silent) {
        toast({
          title: "Erreur",
          description: extractFunctionErrorMessage(error, "Impossible de régénérer l'image"),
          variant: "destructive"
        });
      }
      throw error;
    } finally {
      if (useProgressTracking) {
        setIsGeneratingImage(false);
      }
    }
  }, [
    scriptData,
    projectId,
    sceneStyleOverrides,
    visualStyle,
    buildImagePrompt,
    supabase,
    persistImagesData,
    toast,
  ]);

  const regenerateImage = async (sceneNumber: number) => {
    await generateSceneImage(sceneNumber);
  };

  const getBasePromptForScene = useCallback((sceneNumber: number): string => {
    if (!scriptData) return "";
    const scene = scriptData.scenes.find(s => s.scene_number === sceneNumber);
    if (!scene) return "";
    
    const overrideStyle = sceneStyleOverrides[sceneNumber];
    const selectedStyleId = overrideStyle ?? visualStyle;
    const styleId = resolveStyleId(selectedStyleId);
    const stylePrompt = resolveStylePrompt(styleId);
    return buildImagePrompt(scene, stylePrompt);
  }, [scriptData, sceneStyleOverrides, visualStyle, buildImagePrompt]);

  const handleOpenRegeneratePopover = useCallback((sceneNumber: number) => {
    const basePrompt = getBasePromptForScene(sceneNumber);
    setEditablePrompt(basePrompt);
    setPendingRegenerateSceneNumber(sceneNumber);
    setIsRegeneratePopoverOpen(true);
  }, [getBasePromptForScene]);

  const handleConfirmRegenerate = useCallback(async () => {
    if (pendingRegenerateSceneNumber === null) return;
    
    const sceneNumber = pendingRegenerateSceneNumber;
    setIsRegeneratePopoverOpen(false);
    
    // Déterminer si on est dans le wizard ou dans la timeline
    const isInWizard = wizardActive && activeWizardSceneNumber === sceneNumber;
    
    if (isInWizard && scriptData) {
      // Comportement wizard: mettre à jour le flow status
      const sceneIndex = scriptData.scenes.findIndex(s => s.scene_number === sceneNumber);
      if (sceneIndex !== -1) {
        setActiveWizardSceneIndex(sceneIndex);
        setOverlaySceneNumber(sceneNumber);
        setSceneFlowStatus((prev) => ({
          ...prev,
          [sceneNumber]: 'generating',
        }));

        try {
          await generateSceneImage(sceneNumber, { 
            silent: true, 
            skipProgressTracking: true,
            customPrompt: editablePrompt.trim() || undefined
          });
          setSceneFlowStatus((prev) => ({
            ...prev,
            [sceneNumber]: 'awaiting-selection',
          }));
        } catch (error) {
          setSceneFlowStatus((prev) => ({
            ...prev,
            [sceneNumber]: 'idle',
          }));
          toast({
            title: `Scène ${sceneNumber}`,
            description: extractFunctionErrorMessage(error, "Impossible de générer les images pour cette scène."),
            variant: "destructive",
          });
        } finally {
          setOverlaySceneNumber(null);
        }
      }
    } else {
      // Comportement timeline: appel direct avec tracking de progression
      try {
        await generateSceneImage(sceneNumber, { 
          customPrompt: editablePrompt.trim() || undefined
        });
      } catch (error) {
        toast({
          title: `Scène ${sceneNumber}`,
          description: extractFunctionErrorMessage(error, "Impossible de générer les images pour cette scène."),
          variant: "destructive",
        });
      }
    }
    
    setPendingRegenerateSceneNumber(null);
    setEditablePrompt("");
  }, [pendingRegenerateSceneNumber, editablePrompt, scriptData, generateSceneImage, toast, wizardActive, activeWizardSceneNumber]);

  const handleSelectImageOption = useCallback((sceneNumber: number, optionIndex: number, options?: { silent?: boolean; overrideUrl?: string }) => {
    setGeneratedImages((prev) => {
      let changed = false;

      const next = prev
        .map((img) => {
          if (img.sceneNumber !== sceneNumber) {
            return img;
          }

          const optionList = img.options ?? [];
          const selectedOption = optionList[optionIndex];
          if (!selectedOption) {
            return img;
          }

          const overrideUrl = options?.overrideUrl;
          const updatedOptions = optionList.length
            ? optionList.map((option, idx) => {
                if (idx === optionIndex && overrideUrl) {
                  return { url: overrideUrl };
                }
                return option;
              })
            : optionList;

          const updated: GeneratedImage = {
            ...img,
            selectedOptionIndex: optionIndex,
            imageUrl: overrideUrl ?? selectedOption.url,
            options: updatedOptions,
            success: true,
          };

          if (
            updated.imageUrl !== img.imageUrl ||
            updated.selectedOptionIndex !== img.selectedOptionIndex
          ) {
            changed = true;
          }

          return updated;
        })
        .sort((a, b) => a.sceneNumber - b.sceneNumber);

      if (changed) {
        void persistImagesData(next);
        if (!options?.silent) {
          toast({
            title: "Image sélectionnée",
            description: `Scène ${sceneNumber} : option ${optionIndex + 1}`,
          });
        }
      }

      return next;
    });
  }, [persistImagesData, toast]);

  const handleWizardFinish = useCallback(() => {
    setWizardCompleted(true);
    setOverlaySceneNumber(null);
  }, []);

  const handleWizardPause = useCallback(() => {
    setWizardCompleted(true);
    setOverlaySceneNumber(null);
    setShowWizardChoice(false);
    void persistImagesData([...generatedImages]);
    navigate('/dashboard');
  }, [generatedImages, navigate, persistImagesData]);

  const startSceneFlow = useCallback(
    async (sceneIndex: number, options?: { force?: boolean }) => {
      if (!scriptData) return;
      const scene = scriptData.scenes[sceneIndex];
      if (!scene) return;
      const sceneNumber = scene.scene_number;
      const currentStatus = sceneFlowStatus[sceneNumber];

      const existingGenerated = generatedImages.find((img) => img.sceneNumber === sceneNumber);
      if (!options?.force) {
        if (currentStatus === 'generating') {
          return;
        }
        if (existingGenerated?.imageUrl) {
          setActiveWizardSceneIndex(sceneIndex);
          setSceneFlowStatus((prev) => ({
            ...prev,
            [sceneNumber]: 'completed',
          }));
          setOverlaySceneNumber(null);
          return;
        }
        if (existingGenerated?.options && existingGenerated.options.length > 0) {
          setActiveWizardSceneIndex(sceneIndex);
          setSceneFlowStatus((prev) => ({
            ...prev,
            [sceneNumber]: 'awaiting-selection',
          }));
          setOverlaySceneNumber(null);
          return;
        }
      }

      setActiveWizardSceneIndex(sceneIndex);
      setOverlaySceneNumber(sceneNumber);
      setSceneFlowStatus((prev) => ({
        ...prev,
        [sceneNumber]: 'generating',
      }));

      try {
        await generateSceneImage(sceneNumber, { silent: true, skipProgressTracking: true });
        setSceneFlowStatus((prev) => ({
          ...prev,
          [sceneNumber]: 'awaiting-selection',
        }));
      } catch (error) {
        setSceneFlowStatus((prev) => ({
          ...prev,
          [sceneNumber]: 'idle',
        }));
        toast({
          title: `Scène ${sceneNumber}`,
          description: extractFunctionErrorMessage(error, "Impossible de générer les images pour cette scène."),
          variant: "destructive",
        });
      } finally {
        setOverlaySceneNumber(null);
      }
    },
    [generateSceneImage, generatedImages, sceneFlowStatus, scriptData, toast],
  );

  const generateVideo = useCallback(async (sceneNumber: number, options?: { imageUrlOverride?: string }) => {
    const scene = scriptData?.scenes.find((s) => s.scene_number === sceneNumber);
    const generatedImage = generatedImages.find((img) => img.sceneNumber === sceneNumber);

    if (!scene || !generatedImage) {
      toast({
        title: "Erreur",
        description: "Image non trouvée pour cette scène",
        variant: "destructive",
      });
      throw new Error("Scene or image missing");
    }

    if (!projectId) {
      toast({
        title: "Projet introuvable",
        description: "Impossible de générer la vidéo sans identifiant de projet.",
        variant: "destructive",
      });
      throw new Error("Project ID missing");
    }

    setGeneratingVideoScenes((prev) => new Set(prev).add(sceneNumber));

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

      setGeneratedImages((prev) => {
        const next = prev.map((img) =>
          img.sceneNumber === sceneNumber
            ? {
                ...img,
                videoPrompt: sanitizedPrompt,
              }
            : img,
        );
        void persistImagesData(next);
        return next;
      });

      const imageUrlForVideo = options?.imageUrlOverride ?? generatedImage.imageUrl;
      if (!imageUrlForVideo) {
        throw new Error("Image sélectionnée introuvable pour la génération vidéo.");
      }

      const seedValue = videoSeed.trim() !== '' ? Number.parseInt(videoSeed, 10) : undefined;
      const numericSeed = typeof seedValue === 'number' && Number.isFinite(seedValue) ? seedValue : undefined;
      const trimmedVideoNegative = videoNegativePrompt.trim();

      const audioDurationSeconds = sceneAudioDurations[sceneNumber];
      const roundedVideoDuration = audioDurationSeconds != null && Number.isFinite(audioDurationSeconds)
        ? Math.min(30, Math.max(1, Math.ceil(audioDurationSeconds)))
        : undefined;

      const payload = Object.fromEntries(
        Object.entries({
          imageUrl: imageUrlForVideo,
          prompt: sanitizedPrompt,
          sceneTitle: scene.title,
          projectId,
          sceneNumber,
          videoNegativePrompt: trimmedVideoNegative || undefined,
          seed: numericSeed,
          visualPrompt: generatedImage.prompt,
          styleId: generatedImage.styleId ?? resolveStyleId(visualStyle),
          stylePrompt: generatedImage.stylePrompt ?? resolveStylePrompt(visualStyle),
          videoDuration: roundedVideoDuration ? String(roundedVideoDuration) : undefined,
        }).filter(([_, value]) => value !== undefined && value !== null),
      );

      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: payload,
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error as string);
      }

      const videoUrlFromResponse = (data as { videoUrl?: string })?.videoUrl;

      if (videoUrlFromResponse) {
        setGeneratedImages((prev) => {
          let changed = false;
          const next = prev.map((img) => {
            if (img.sceneNumber !== sceneNumber) {
              return img;
            }
            if (img.videoUrl === videoUrlFromResponse) {
              return img;
            }
            changed = true;
            return { ...img, videoUrl: videoUrlFromResponse };
          });

          if (changed) {
            void persistImagesData(next);
          }

          return next;
        });

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

      throw error;
    } finally {
      setGeneratingVideoScenes((prev) => {
        const newSet = new Set(prev);
        newSet.delete(sceneNumber);
        return newSet;
      });
    }
  }, [
    generatedImages,
    persistImagesData,
    projectId,
    sceneAudioDurations,
    scriptData,
    supabase,
    toast,
    videoNegativePrompt,
    videoSeed,
    visualStyle,
  ]);

  const handleWizardSceneSelection = useCallback(
    async (sceneNumber: number, optionIndex: number) => {
      if (!scriptData) return;
      const status = sceneFlowStatus[sceneNumber];
      if (status === 'video-generating' || status === 'generating') {
        return;
      }

      const scene = scriptData.scenes.find((s) => s.scene_number === sceneNumber);
      const generated = generatedImages.find((img) => img.sceneNumber === sceneNumber);
      const selectedOption = generated?.options?.[optionIndex];

      if (!selectedOption?.url) {
        toast({
          title: `Scène ${sceneNumber}`,
          description: "Option introuvable pour cette scène.",
          variant: "destructive",
        });
        return;
      }

      let finalUrl = selectedOption.url;
      if (!isSupabaseStorageUrl(finalUrl)) {
        try {
          const uploadResult = await uploadImageToSupabase({
            sceneNumber,
            optionUrl: finalUrl,
            sceneTitle: scene?.title,
            projectId,
            ownerId: user?.id ?? null,
          });
          finalUrl = uploadResult.publicUrl;
        } catch (error) {
          console.error('Erreur upload image sélectionnée:', error);
          toast({
            title: `Scène ${sceneNumber}`,
            description: extractFunctionErrorMessage(error, "Impossible d'enregistrer l'image sélectionnée."),
            variant: "destructive",
          });
          return;
        }
      }

      handleSelectImageOption(sceneNumber, optionIndex, {
        silent: true,
        overrideUrl: finalUrl,
      });

      setSceneFlowStatus((prev) => ({
        ...prev,
        [sceneNumber]: 'video-generating',
      }));

      const sceneIndex = scriptData.scenes.findIndex((sceneDef) => sceneDef.scene_number === sceneNumber);
      if (sceneIndex >= 0) {
        const nextIndex = sceneIndex + 1;
        const totalScenes = scriptData.scenes.length;
        if (nextIndex < totalScenes) {
          const nextSceneNumber = scriptData.scenes[nextIndex].scene_number;
          const nextStatus = sceneFlowStatus[nextSceneNumber];
          setActiveWizardSceneIndex(nextIndex);
          if (nextStatus !== 'awaiting-selection' && nextStatus !== 'generating' && nextStatus !== 'video-generating') {
            void startSceneFlow(nextIndex);
          }
        }
      }

      try {
        await generateVideo(sceneNumber, { imageUrlOverride: finalUrl });
        setSceneFlowStatus((prev) => ({
          ...prev,
          [sceneNumber]: 'completed',
        }));
      } catch (error) {
        console.error('Erreur génération vidéo (wizard):', error);
        setSceneFlowStatus((prev) => ({
          ...prev,
          [sceneNumber]: 'awaiting-selection',
        }));
      }
    },
    [
      generateVideo,
      generatedImages,
      handleSelectImageOption,
      projectId,
      sceneFlowStatus,
      scriptData,
      startSceneFlow,
      toast,
      uploadImageToSupabase,
      sceneAudioDurations,
      user?.id,
    ],
  );

  const navigateWizardScene = useCallback(
    (targetIndex: number) => {
      if (!scriptData) return;
      const total = scriptData.scenes.length;
      if (targetIndex < 0 || targetIndex >= total) return;

      setActiveWizardSceneIndex(targetIndex);
      const sceneNumber = scriptData.scenes[targetIndex].scene_number;
      const status = sceneFlowStatus[sceneNumber];
      if (!status || status === 'idle') {
        void startSceneFlow(targetIndex);
      }
    },
    [sceneFlowStatus, scriptData, startSceneFlow],
  );

  const handleTimelineOptionSelect = useCallback(
    async (sceneNumber: number, optionIndex: number) => {
      const generated = generatedImages.find((img) => img.sceneNumber === sceneNumber);
      const option = generated?.options?.[optionIndex];
      if (!option?.url) {
        toast({
          title: `Scène ${sceneNumber}`,
          description: "Option introuvable pour cette scène.",
          variant: "destructive",
        });
        return;
      }

      let finalUrl = option.url;
      if (!isSupabaseStorageUrl(finalUrl)) {
        try {
          const uploadResult = await uploadImageToSupabase({
            sceneNumber,
            optionUrl: finalUrl,
            sceneTitle: scriptData?.scenes.find((scene) => scene.scene_number === sceneNumber)?.title,
            projectId,
            ownerId: user?.id ?? null,
          });
          finalUrl = uploadResult.publicUrl;
        } catch (error) {
          console.error('Erreur upload image (timeline):', error);
          toast({
            title: `Scène ${sceneNumber}`,
            description: extractFunctionErrorMessage(error, "Impossible d'enregistrer l'image sélectionnée."),
            variant: "destructive",
          });
          return;
        }
      }

      handleSelectImageOption(sceneNumber, optionIndex, { overrideUrl: finalUrl });
    },
    [generatedImages, handleSelectImageOption, projectId, sceneAudioDurations, scriptData, toast, uploadImageToSupabase, user?.id],
  );

  useEffect(() => {
    if (!scriptData) return;
    setSceneFlowStatus((prev) => {
      const next = { ...prev } as Record<number, SceneFlowStatus>;
      scriptData.scenes.forEach((scene) => {
        if (!next[scene.scene_number]) {
          const generated = generatedImages.find((img) => img.sceneNumber === scene.scene_number);
          if (generated?.imageUrl) {
            next[scene.scene_number] = 'completed';
          } else if (generated?.options && generated.options.length > 0) {
            next[scene.scene_number] = 'awaiting-selection';
          } else {
            next[scene.scene_number] = 'idle';
          }
        }
      });
      return next;
    });
  }, [scriptData, generatedImages]);

useEffect(() => {
  if (imagePromptStatus === 'success') {
    toast({
      title: 'Prompts visuels prêts',
      description: "Les descriptions d'images ont été générées en arrière-plan.",
    });
  }
  if (imagePromptStatus === 'error' && imagePromptError) {
    toast({
      title: 'Prompts visuels indisponibles',
      description: imagePromptError,
      variant: 'destructive',
    });
  }
}, [imagePromptError, imagePromptStatus, toast]);

  useEffect(() => {
    if (currentStep !== 'images' || !scriptData || !wizardAssetsReady) {
      return;
    }

    const totalScenes = scriptData.scenes.length;
    if (!totalScenes) {
      if (!wizardStarted) {
        setWizardStarted(true);
      }
      if (!wizardCompleted) {
        setWizardCompleted(true);
      }
      setShowWizardChoice(false);
      return;
    }

    if (wizardEntryDecision === 'resume') {
      const fallbackIndex = wizardProgress.firstIncompleteIndex;
      const targetIndexRaw = wizardResumeIndex ?? fallbackIndex;
      const targetIndex = Number.isFinite(targetIndexRaw)
        ? Math.min(Math.max(targetIndexRaw, 0), Math.max(totalScenes - 1, 0))
        : 0;
      const targetScene = scriptData.scenes[targetIndex];
      const targetStatus = targetScene ? sceneFlowStatus[targetScene.scene_number] : undefined;

      setShowWizardChoice(false);
      setWizardStarted(true);
      setWizardCompleted(false);
      setActiveWizardSceneIndex(targetIndex);
      if (!targetStatus || targetStatus === 'idle') {
        void startSceneFlow(targetIndex);
      }
      setWizardEntryDecision(null);
      setWizardResumeIndex(null);
      return;
    }

    if (wizardEntryDecision === 'timeline') {
      if (!wizardStarted) {
        setWizardStarted(true);
      }
      if (!wizardCompleted) {
        setWizardCompleted(true);
      }
      setShowWizardChoice(false);
      setWizardEntryDecision(null);
      setWizardResumeIndex(null);
      return;
    }

    if (wizardProgress.allCompleted) {
      if (!wizardStarted) {
        setWizardStarted(true);
      }
      if (!wizardCompleted) {
        setWizardCompleted(true);
      }
      setShowWizardChoice(false);
      return;
    }

    if (!wizardProgress.hasAnyGenerated) {
      setShowWizardChoice(false);
      if (!wizardStarted) {
        setWizardStarted(true);
        setWizardCompleted(false);
        setActiveWizardSceneIndex(0);
        void startSceneFlow(0);
      }
      return;
    }

    if (!wizardEntryDecision && !showWizardChoice && !wizardStarted) {
      setShowWizardChoice(true);
    }
  }, [
    currentStep,
    sceneFlowStatus,
    scriptData,
    showWizardChoice,
    startSceneFlow,
    wizardCompleted,
    wizardEntryDecision,
    wizardProgress,
    wizardStarted,
    wizardResumeIndex,
    wizardAssetsReady,
  ]);

  useEffect(() => {
    if (!scriptData || !wizardStarted || wizardCompleted) return;
    const total = scriptData.scenes.length;
    if (!total) return;
    const allCompleted = scriptData.scenes.every((scene) => sceneFlowStatus[scene.scene_number] === 'completed');
    if (allCompleted) {
      setWizardCompleted(true);
    }
  }, [sceneFlowStatus, scriptData, wizardStarted, wizardCompleted]);

  useEffect(() => {
    if (storyboardComplete) {
      setWizardCompleted(true);
    }
  }, [storyboardComplete]);


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
  const displayStepIndex =
    currentStep === 'images' && storyboardComplete
      ? STUDIO_STEPS.findIndex(step => step.id === 'complete')
      : currentStepIndex;
  const normalizedStepIndex = displayStepIndex < 0 ? 0 : displayStepIndex;
  const showScriptOverlay = scriptGenerationPhase !== 'idle';
  const scriptOverlaySubtitle = useMemo(() => {
    if (scriptGenerationPhase === 'loading') {
      return "Cela peut prendre quelques secondes.";
    }
    if (scriptGenerationPhase === 'success') {
      return "Script prêt. Ouverture de l'éditeur de scènes.";
    }
    if (scriptGenerationPhase === 'error') {
      return "Impossible de finaliser la génération. Réessayez.";
    }
    return undefined;
  }, [scriptGenerationPhase]);
  const scriptOverlayTasks = useMemo<GenerationTask[]>(() => {
    if (scriptGenerationPhase === 'idle') {
      return [];
    }
    const maxIndex =
      scriptGenerationPhase === 'success'
        ? SCRIPT_TASK_FLOW.length - 1
        : Math.min(scriptProgressIndex, SCRIPT_TASK_FLOW.length - 1);

    return SCRIPT_TASK_FLOW.map((task, index) => {
      let status: GenerationTaskStatus = 'pending';

      if (scriptGenerationPhase === 'success') {
        status = 'success';
      } else if (scriptGenerationPhase === 'error') {
        if (index < maxIndex) {
          status = 'success';
        } else if (index === maxIndex) {
          status = 'error';
        }
      } else {
        if (index < maxIndex) {
          status = 'success';
        } else if (index === maxIndex) {
          status = 'loading';
        }
      }

      let helper = task.helper;
      if (task.id === 'script-write' && scriptGenerationPhase === 'loading') {
        helper = `Rédaction en cours… scènes ${Math.min(maxIndex + 1, SCRIPT_TASK_FLOW.length)}/${SCRIPT_TASK_FLOW.length}`;
      }
      if (task.id === 'script-summary' && scriptGenerationPhase === 'success') {
        helper = "Le script est prêt à être révisé avant le storyboard.";
      }
      if (scriptGenerationPhase === 'error' && index === maxIndex) {
        helper = "Une erreur est survenue. Vérifiez votre connexion et réessayez.";
      }

      return {
        ...task,
        status,
        helper,
      };
    });
  }, [scriptGenerationPhase, scriptProgressIndex]);
  const scriptActiveTaskId = useMemo(() => {
    const current = scriptOverlayTasks.find((task) => task.status === 'loading' || task.status === 'error');
    if (current) return current.id;
    const last = scriptOverlayTasks[scriptOverlayTasks.length - 1];
    return last?.id;
  }, [scriptOverlayTasks]);
  const showVoiceOverlay = voiceGenerationPhase !== 'idle';
  const voiceOverlaySubtitle = useMemo(() => {
    if (voiceGenerationPhase === 'loading') {
      if (!sceneCount) return "Préparation des voix...";
      return `${generatedVoiceCount}/${sceneCount} scènes déjà prêtes`;
    }
    if (voiceGenerationPhase === 'success') {
      return "Vos audios sont prêts. Vérifiez chaque scène si besoin.";
    }
    if (voiceGenerationPhase === 'error') {
      return "Impossible de générer toutes les voix. Réessayez.";
    }
    return undefined;
  }, [voiceGenerationPhase, generatedVoiceCount, sceneCount]);
  const voiceOverlayTasks = useMemo<GenerationTask[]>(() => {
    if (voiceGenerationPhase === 'idle') {
      return [];
    }
    const maxIndex =
      voiceGenerationPhase === 'success'
        ? VOICE_TASK_FLOW.length - 1
        : Math.min(voiceProgressIndex, VOICE_TASK_FLOW.length - 1);

    return VOICE_TASK_FLOW.map((task, index) => {
      let status: GenerationTaskStatus = 'pending';
      if (voiceGenerationPhase === 'success') {
        status = 'success';
      } else if (voiceGenerationPhase === 'error') {
        if (index < maxIndex) {
          status = 'success';
        } else if (index === maxIndex) {
          status = 'error';
        }
      } else {
        if (index < maxIndex) {
          status = 'success';
        } else if (index === maxIndex) {
          status = 'loading';
        }
      }

      let helper = task.helper;
      if (task.id === 'voice-generate') {
        helper = sceneCount ? `${generatedVoiceCount}/${sceneCount} scènes` : task.helper;
      }
      if (task.id === 'voice-sync' && voiceGenerationPhase === 'loading' && voiceProgressIndex >= 2) {
        helper = "Analyse des durées réelles et équilibrage du rythme…";
      }
      if (voiceGenerationPhase === 'error' && index === maxIndex) {
        helper = "Relancez la génération pour continuer.";
      }

      return {
        ...task,
        status,
        helper,
      };
    });
  }, [voiceGenerationPhase, voiceProgressIndex, generatedVoiceCount, sceneCount]);
  const voiceActiveTaskId = useMemo(() => {
    const current = voiceOverlayTasks.find((task) => task.status === 'loading' || task.status === 'error');
    if (current) return current.id;
    const last = voiceOverlayTasks[voiceOverlayTasks.length - 1];
    return last?.id;
  }, [voiceOverlayTasks]);
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
            disabled={voiceGenerationPhase === 'loading' || !scriptData?.scenes.length}
            className="gap-2 w-full"
            size="lg"
          >
            {voiceGenerationPhase === 'loading' ? (
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
          {generatedVoiceCount > 0 && (
            <p className="text-xs text-center text-emerald-400">
              ✓ {generatedVoiceCount}/{scriptData?.scenes.length} voix générées
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
    <>
      <PageShell contentClassName="container px-4 pb-16">
      <div className="mx-auto max-w-6xl space-y-10">
        <Card className="space-y-6 rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="w-fit border-primary/40 text-primary">
                    Studio vidéo
                  </Badge>
                  {/* Quota Indicator */}
                  {subscription && (
                    <Badge
                      variant={isAtLimit ? "destructive" : isNearLimit ? "outline" : "secondary"}
                      className={cn(
                        "w-fit text-xs",
                        isAtLimit && "border-red-500 text-red-500",
                        isNearLimit && "border-orange-500 text-orange-500"
                      )}
                    >
                      {subscription.videosGenerated}/{subscription.videosQuota} vidéos ce mois
                    </Badge>
                  )}
                </div>
                <h1 className="text-3xl font-semibold text-foreground">Montez votre projet</h1>
                <p className="text-sm text-muted-foreground">
                  Progressez du brief à l&apos;export sans quitter cette interface.
                  {remainingVideos > 0 && remainingVideos <= 3 && (
                    <span className="ml-1 text-orange-600 font-medium">
                      ({remainingVideos} vidéo{remainingVideos > 1 ? 's' : ''} restante{remainingVideos > 1 ? 's' : ''})
                    </span>
                  )}
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
                    autoComplete="off"
                    data-lpignore="true"
                    data-bitwarden-ignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
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

              {showScriptOverlay && scriptOverlayTasks.length > 0 && (
                <GenerationOverlay
                  title="Assistant IA en action"
                  subtitle={scriptOverlaySubtitle}
                  tasks={scriptOverlayTasks}
                  activeTaskId={scriptActiveTaskId}
                />
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

              {showVoiceOverlay && voiceOverlayTasks.length > 0 && (
                <GenerationOverlay
                  title="Génération des voix IA"
                  subtitle={voiceOverlaySubtitle}
                  tasks={voiceOverlayTasks}
                  activeTaskId={voiceActiveTaskId}
                />
              )}
            </Card>
        )}

        {currentStep === 'images' && scriptData && wizardCompleted && (
            <div className="space-y-6">
              <Card className="rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Synchronisation</h3>
                    <p className="text-xs text-muted-foreground">Aligne toutes les scènes avec les vraies durées des audios</p>
                  </div>
                  <Button
                    onClick={syncAllDurationsWithAudio}
                    disabled={!Object.values(sceneAudioDurations).some(d => d > 0)}
                    variant="outline"
                    className="gap-2 whitespace-nowrap"
                    title="Synchronise toutes les scènes avec les vraies durées des audios"
                  >
                    🔄 Synchroniser
                  </Button>
                </div>
              </Card>

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
                  const hasOptions = generatedImage?.options && generatedImage.options.length > 0;
                  const hasSelection =
                    typeof generatedImage?.selectedOptionIndex === 'number' &&
                    generatedImage.options?.[generatedImage.selectedOptionIndex];

                  const status: SceneStatus = isGenerating
                    ? 'generating-video'
                    : hasSelection
                      ? 'ready'
                      : hasOptions
                        ? 'awaiting-selection'
                        : isLoadingProject
                          ? 'loading'
                          : 'empty';

                  return {
                    sceneNumber: scene.scene_number,
                    title: scene.title,
                    imageUrl: generatedImage?.imageUrl ?? generatedImage?.options?.[0]?.url,
                    imageOptions: generatedImage?.options ?? [],
                    selectedOptionIndex: generatedImage?.selectedOptionIndex,
                    gridUrl: generatedImage?.gridUrl ?? undefined,
                    videoUrl: generatedImage?.videoUrl,
                    prompt: generatedImage?.prompt,
                    narration: scene.narration,
                    styleId: generatedImage?.styleId,
                    stylePrompt: generatedImage?.stylePrompt,
                    styleOverrideId: sceneStyleOverrides[scene.scene_number],
                    visual: scene.visual,
                    status,
                    durationSeconds: sceneCustomDurations[scene.scene_number] ?? scene.duration_seconds ?? estimatedSceneDuration,
                  };
                })}
                onRegenerateImage={handleOpenRegeneratePopover}
                onGenerateVideo={(sceneNumber) => void generateVideo(sceneNumber)}
                isRegenerating={isGeneratingImage}
                isSceneGenerating={(sceneNumber) => generatingVideoScenes.has(sceneNumber)}
                onSceneStyleChange={handleSceneStyleChange}
                styleOptions={STYLE_OPTIONS}
                onSelectImageOption={(sceneNumber, optionIndex) => void handleTimelineOptionSelect(sceneNumber, optionIndex)}
              />

              <Card className="rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button variant="ghost" onClick={() => setCurrentStep('script')} className="flex-1">
                    Retour au script
                  </Button>
                  <Button
                    onClick={finishProject}
                    disabled={!storyboardComplete || isGeneratingImage}
                    className="flex-1 gap-2 text-sm"
                  >
                    <Check className="h-4 w-4" />
                    Terminer le projet
                  </Button>
                </div>
              </Card>
            </div>
        )}
      </div>
      </PageShell>

      {showWizardChoice && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-5 rounded-3xl border border-white/10 bg-black/90 p-6 shadow-2xl">
            <div className="space-y-2 text-left">
              <h3 className="text-xl font-semibold text-white">Reprendre la génération ?</h3>
              <p className="text-sm text-muted-foreground">
                Vous avez validé {wizardProgress.completedScenes}/{wizardProgress.totalScenes} scènes
                {wizardProgress.totalScenes > 0 ? ` (${wizardProgressPercent}%)` : ""}. Il reste {wizardRemainingScenes}{" "}
                {wizardRemainingScenes > 1 ? "scènes" : "scène"} à finaliser.
              </p>
              <p className="text-sm text-muted-foreground">
                Souhaitez-vous continuer la génération là où vous l&apos;avez stoppée ou consulter directement la timeline ?
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setWizardEntryDecision('timeline');
                  setShowWizardChoice(false);
                }}
                className="sm:w-auto"
              >
                Aller à la timeline
              </Button>
              <Button
                onClick={() => {
                  setWizardResumeIndex(wizardProgress.firstIncompleteIndex);
                  setWizardEntryDecision('resume');
                  setShowWizardChoice(false);
                }}
                className="sm:w-auto"
              >
                Reprendre la génération
              </Button>
            </div>
          </div>
        </div>
      )}

      {wizardActive && activeWizardScene && activeWizardSceneNumber != null && (
        <>
          {isWizardSceneGenerating && (
            <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm">
              <GridLoader color="#3b82f6" size={16} margin={6} />
              <p className="mt-6 text-lg font-semibold text-white">
                Génération des visuels – scène {activeWizardSceneIndex + 1}/{totalWizardScenes}
              </p>
              <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                Nous harmonisons les personnages et le style avec les scènes précédentes.
              </p>
            </div>
          )}
          {!isWizardSceneGenerating && (
            <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur">
              <div className="w-full max-w-5xl space-y-6 rounded-3xl border border-white/10 bg-black/85 p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canNavigateWizardPrev}
                    onClick={() => navigateWizardScene(activeWizardSceneIndex - 1)}
                  >
                    ← Scène précédente
                  </Button>
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Sélection des visuels</p>
                    <p className="text-lg font-semibold text-white">
                      Scène {activeWizardSceneIndex + 1} / {totalWizardScenes}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{activeWizardScene.title}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canNavigateWizardNext}
                    onClick={() => navigateWizardScene(activeWizardSceneIndex + 1)}
                  >
                    Scène suivante →
                  </Button>
                </div>

                <div className="space-y-5">
                  {activeWizardOptions.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {activeWizardOptions.map((option, index) => {
                        const isSelected = activeWizardSelectedIndex === index;
                        return (
                          <button
                            key={`${activeWizardSceneNumber}-option-${index}`}
                            type="button"
                            onClick={() => void handleWizardSceneSelection(activeWizardSceneNumber, index)}
                            disabled={isWizardVideoGenerating}
                            className={cn(
                              "group relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 transition-all duration-200",
                              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                              isSelected ? "ring-2 ring-primary" : "hover:-translate-y-1 hover:border-primary/60",
                              isWizardVideoGenerating && "cursor-not-allowed opacity-70"
                            )}
                          >
                            <img
                              src={option.url}
                              alt={`Option ${index + 1}`}
                              className="h-64 w-full object-cover"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 text-left">
                              <p className="text-xs font-semibold text-white/90">Option {index + 1}</p>
                              {isSelected && (
                                <p className="flex items-center gap-1 text-[11px] text-primary/90">
                                  <Check className="h-3 w-3" /> Sélectionnée
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-8 text-center text-sm text-muted-foreground">
                      <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                      Préparation des propositions visuelles…
                    </div>
                  )}

                  {activeWizardNarration && (
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-muted-foreground">
                      <p className="mb-2 text-sm font-medium text-foreground/80">Narration de la scène</p>
                      <p className="whitespace-pre-wrap text-base text-foreground/90">{activeWizardNarration}</p>
                    </div>
                  )}

                  {activeWizardSelectedUrl && (
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                      <p className="mb-3 text-sm font-medium text-foreground/80">Aperçu sélectionné</p>
                      <div className="overflow-hidden rounded-xl border border-white/10">
                        <img src={activeWizardSelectedUrl} alt="Sélection" className="h-[420px] w-full object-cover" />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-muted-foreground">
                    {activeWizardStatus === 'awaiting-selection' && (
                      <div className="flex items-center gap-2 text-foreground">
                        <Circle className="h-3 w-3 text-primary" />
                        Choisissez l'illustration qui vous plaît pour poursuivre le storyboard.
                      </div>
                    )}
                    {isWizardVideoGenerating && (
                      <div className="flex items-center gap-2 text-primary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Génération de la vidéo en arrière-plan…
                      </div>
                    )}
                    {activeWizardStatus === 'completed' && (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Vidéo générée. Vous pouvez revenir sur cette scène pour ajuster le visuel.
                      </div>
                    )}
                    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    {activeWizardSceneNumber && (
                      <Popover open={isRegeneratePopoverOpen} onOpenChange={(open) => {
                        setIsRegeneratePopoverOpen(open);
                        if (open && activeWizardSceneNumber) {
                          handleOpenRegeneratePopover(activeWizardSceneNumber);
                          }
                          if (!open) {
                            setPendingRegenerateSceneNumber(null);
                            setEditablePrompt("");
                          }
                        }}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isWizardSceneGenerating}
                            >
                              Régénérer cette scène
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent 
                            className="w-[520px] p-5 z-[100] speech-bubble rounded-lg duration-300" 
                            align="center"
                            side="top"
                            sideOffset={10}
                            onOpenAutoFocus={(e) => e.preventDefault()}
                          >
                            <div className="space-y-4 text-popover-foreground">
                              <Textarea
                                id="prompt-edit-popover"
                                value={editablePrompt}
                                onChange={(e) => setEditablePrompt(e.target.value)}
                                className="min-h-[180px] max-h-[280px] font-mono text-sm leading-relaxed resize-none bg-background/40 text-foreground border border-input rounded-md p-3 focus:border-primary focus:ring-2 focus:ring-primary/20 focus-visible:ring-primary/20"
                                placeholder="Modifiez le prompt pour régénérer l'image..."
                              />
                              <div className="flex justify-end gap-2 pt-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setIsRegeneratePopoverOpen(false);
                                    setPendingRegenerateSceneNumber(null);
                                    setEditablePrompt("");
                                  }}
                                  className="text-foreground border-border hover:bg-muted/50"
                                >
                                  Annuler
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleConfirmRegenerate}
                                  disabled={!editablePrompt.trim()}
                                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                                >
                                  Régénérer
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleWizardPause}
                        >
                          Sauvegarder & retour à l&apos;accueil
                        </Button>
                        {canNavigateWizardPrev && (
                          <Button variant="ghost" size="sm" onClick={() => navigateWizardScene(activeWizardSceneIndex - 1)}>
                            ← Précédente
                          </Button>
                        )}
                        {canNavigateWizardNext && (
                          <Button size="sm" onClick={() => navigateWizardScene(activeWizardSceneIndex + 1)}>
                            Suivante →
                          </Button>
                        )}
                        {canFinishWizard && (
                          <Button
                            size="sm"
                            onClick={handleWizardFinish}
                            disabled={isWizardSceneGenerating || isWizardVideoGenerating}
                          >
                            Ouvrir la timeline
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      
    </>
  );
};

export default CreateVideo;
