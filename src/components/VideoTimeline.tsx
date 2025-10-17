import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Loader2,
  Clapperboard,
  Video as VideoIcon,
  Image as ImageIcon,
  Quote,
  Sparkles,
  Volume2,
  Plus,
  Download,
} from "lucide-react";

type SceneStatus = "loading" | "ready" | "generating-video" | "error" | "empty";

interface TimelineAudioClip {
  id: string;
  label: string;
  start: number;
  duration: number;
  accentClassName?: string;
  description?: string;
}

interface TimelineScene {
  sceneNumber: number;
  title: string;
  imageUrl?: string;
  videoUrl?: string;
  prompt?: string;
  narration?: string;
  visual?: string;
  styleId?: string;
  stylePrompt?: string;
  styleOverrideId?: string;
  status: SceneStatus;
  durationSeconds?: number;
  startOffset?: number;
}

type SceneVoiceRecord = {
  voiceId: string;
  audioBase64: string;
  duration: number;
};

type VideoFrameCallbackMetadata = {
  presentationTime: number;
  expectedDisplayTime: number;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
};

export type TimelinePlaybackController = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  isPlaying: () => boolean;
};

interface VideoTimelineProps {
  scenes: TimelineScene[];
  audioClips?: TimelineAudioClip[];
  timelineDuration?: number;
  onRegenerateImage: (sceneNumber: number) => void;
  onGenerateVideo: (sceneNumber: number) => void;
  isRegenerating?: boolean;
  isSceneGenerating?: (sceneNumber: number) => boolean;
  onSceneStyleChange?: (sceneNumber: number, styleId: string) => void;
  styleOptions: { value: string; label: string }[];
  previewVideoRef?: RefObject<HTMLVideoElement>;
  onActiveSceneChange?: (sceneNumber: number | null) => void;
  onDownloadAssets?: () => void;
  isDownloadDisabled?: boolean;
  onPlaybackControllerChange?: (controller: TimelinePlaybackController | null) => void;
  sceneVoiceData?: Record<number, SceneVoiceRecord>;
}

const statusTokens: Record<SceneStatus, { label: string; tone: "ready" | "pending" | "error" | "idle" }> = {
  ready: { label: "Prêt", tone: "ready" },
  "generating-video": { label: "Rendu vidéo", tone: "pending" },
  error: { label: "Erreur", tone: "error" },
  loading: { label: "Chargement", tone: "pending" },
  empty: { label: "À générer", tone: "idle" },
};

const DEFAULT_SCENE_DURATION = 8;
const PIXELS_PER_SECOND = 80;
const MIN_CLIP_WIDTH = 96;

const TIME_GRID_LEVELS = [
  { threshold: 240, step: 20 },
  { threshold: 180, step: 15 },
  { threshold: 120, step: 10 },
  { threshold: 60, step: 5 },
  { threshold: 30, step: 2 },
  { threshold: 0, step: 1 },
];

const DEFAULT_WAVEFORM = [24, 18, 32, 14, 28, 20, 30, 16, 28, 22, 26, 18, 30, 16, 24, 20];

const formatTime = (valueInSeconds: number) => {
  const safeValue = Math.max(0, valueInSeconds);
  const totalHundredths = Math.round(safeValue * 100);
  const minutes = Math.floor(totalHundredths / 6000);
  const seconds = Math.floor((totalHundredths % 6000) / 100);
  const hundredths = totalHundredths % 100;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${hundredths.toString().padStart(2, "0")}`;
};

const renderEmptyState = (sceneNumber: number) => (
  <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
    Aucun visuel pour la scène {sceneNumber}
  </div>
);

export const VideoTimeline = ({
  scenes,
  audioClips,
  timelineDuration,
  onRegenerateImage,
  onGenerateVideo,
  isRegenerating,
  isSceneGenerating,
  onSceneStyleChange,
  styleOptions,
  previewVideoRef,
  onActiveSceneChange,
  onDownloadAssets,
  isDownloadDisabled,
  onPlaybackControllerChange,
  sceneVoiceData,
}: VideoTimelineProps) => {
  const [activeScene, setActiveScene] = useState<number | null>(scenes[0]?.sceneNumber ?? null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const isPreviewPlayingRef = useRef(false);
  const [pendingAutoPlay, setPendingAutoPlay] = useState(false);

  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const playheadTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const videoFrameCallbackRef = useRef<number | null>(null);
  const playbackClockRef = useRef<number | null>(null);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioSceneRef = useRef<number | null>(null);
  const advanceToNextSegmentRef = useRef<(() => void) | null>(null);
  const isTransitioningRef = useRef(false);
  const [videoDurations, setVideoDurations] = useState<Record<number, number>>({});

  const getSceneAudioSrc = useCallback(
    (sceneNumber: number) => {
      const record = sceneVoiceData?.[sceneNumber];
      if (!record?.audioBase64) return null;
      const base64 = record.audioBase64.trim();
      return base64.startsWith("data:") ? base64 : `data:audio/mpeg;base64,${base64}`;
    },
    [sceneVoiceData]
  );

  const stopNarrationAudio = useCallback(
    (resetOffset: boolean) => {
      const audio = narrationAudioRef.current;
      if (!audio) return;
      audio.pause();
      audio.onended = null;
      audio.onloadeddata = null;
      if (resetOffset) {
        try {
          audio.currentTime = 0;
        } catch (_) {
          // ignore seek errors
        }
      }
    },
    []
  );

  useEffect(() => {
    playheadTimeRef.current = playheadTime;
  }, [playheadTime]);

  useEffect(() => {
    isPreviewPlayingRef.current = isPreviewPlaying;
  }, [isPreviewPlaying]);

  useEffect(() => {
    if (!activeScene && scenes.length) {
      setActiveScene(scenes[0].sceneNumber);
    }
  }, [activeScene, scenes]);

  useEffect(() => {
    if (!activeScene) return;
    const stillExists = scenes.some((scene) => scene.sceneNumber === activeScene);
    if (!stillExists) {
      setActiveScene(scenes[0]?.sceneNumber ?? null);
    }
  }, [activeScene, scenes]);

  useEffect(() => {
    onActiveSceneChange?.(activeScene ?? null);
  }, [activeScene, onActiveSceneChange]);

  const timelineSegments = useMemo(() => {
    if (!scenes.length) return [];

    const fallbackDuration =
      timelineDuration && timelineDuration > 0
        ? Math.max(timelineDuration / scenes.length, 1)
        : DEFAULT_SCENE_DURATION;

    let cursor = 0;
    return scenes.map((scene) => {
      // Priority: video duration > voice duration > scene duration > fallback
      const videoDuration = videoDurations[scene.sceneNumber];
      const voiceDuration = sceneVoiceData?.[scene.sceneNumber]?.duration;

      let candidateDuration: number;
      if (typeof videoDuration === "number" && Number.isFinite(videoDuration) && videoDuration > 0) {
        candidateDuration = videoDuration;
      } else if (typeof voiceDuration === "number" && Number.isFinite(voiceDuration) && voiceDuration > 0) {
        candidateDuration = voiceDuration;
      } else {
        candidateDuration = scene.durationSeconds ?? fallbackDuration;
      }

      const duration = Math.max(candidateDuration, 3);
      const start = scene.startOffset ?? cursor;
      const end = start + duration;
      cursor = Math.max(cursor, end);

      return {
        ...scene,
        durationSeconds: duration,
        start,
        end,
      };
    });
  }, [sceneVoiceData, scenes, timelineDuration, videoDurations]);

  const computedDuration = timelineSegments.length ? timelineSegments[timelineSegments.length - 1].end : 0;
  const totalDuration = Math.max(timelineDuration ?? 0, computedDuration);
  const safeDuration = totalDuration || DEFAULT_SCENE_DURATION * Math.max(scenes.length, 1);
  const timelineWidthPx = Math.max(
    Math.round(safeDuration * PIXELS_PER_SECOND),
    timelineSegments.length ? timelineSegments.length * MIN_CLIP_WIDTH : 320
  );

  const ensurePlayheadVisible = useCallback(
    (time: number, intent: "auto" | "smooth" | "instant" = "auto") => {
      const scroller = timelineScrollRef.current;
      if (!scroller) return;
      const target = Math.max(0, time * PIXELS_PER_SECOND - scroller.clientWidth / 2);

      if (intent === "instant") {
        scroller.scrollLeft = target;
        return;
      }

      const smoothing = intent === "auto" ? 0.15 : 0.35;
      scroller.scrollLeft += (target - scroller.scrollLeft) * smoothing;
    },
    []
  );

  const clampTime = useCallback((time: number) => Math.min(Math.max(time, 0), safeDuration), [safeDuration]);

  const updatePlayhead = useCallback(
    (time: number, intent: "auto" | "smooth" | "instant" = "auto") => {
      const clamped = clampTime(time);
      if (Math.abs(clamped - playheadTimeRef.current) > 0.0005) {
        playheadTimeRef.current = clamped;
        setPlayheadTime(clamped);
      } else {
        playheadTimeRef.current = clamped;
      }
      ensurePlayheadVisible(clamped, intent);
    },
    [clampTime, ensurePlayheadVisible]
  );

const stopAnimations = useCallback(() => {
  if (rafRef.current !== null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  const video = previewVideoRef?.current;
  if (video && typeof (video as any).cancelVideoFrameCallback === "function" && videoFrameCallbackRef.current !== null) {
    (video as any).cancelVideoFrameCallback(videoFrameCallbackRef.current);
  }
  videoFrameCallbackRef.current = null;
  playbackClockRef.current = null;
}, [previewVideoRef]);

  useEffect(() => () => stopAnimations(), [stopAnimations]);

  const pauseNarration = useCallback(() => {
    const audio = narrationAudioRef.current;
    if (!audio) return;
    console.log('[pauseNarration] Pausing narration audio, current scene:', currentAudioSceneRef.current);
    audio.pause();
  }, []);

  const resetNarration = useCallback(() => {
    stopNarrationAudio(true);
    const audio = narrationAudioRef.current;
    if (audio) {
      audio.src = "";
    }
    currentAudioSceneRef.current = null;
  }, [stopNarrationAudio]);

  const playNarrationForScene = useCallback(
    (sceneNumber: number | null, offsetSeconds = 0) => {
      console.log('[playNarrationForScene] Called with scene:', sceneNumber, 'offset:', offsetSeconds);

      if (sceneNumber == null) {
        console.log('[playNarrationForScene] No scene number, resetting narration');
        resetNarration();
        return;
      }

      const audioSrc = getSceneAudioSrc(sceneNumber);
      console.log('[playNarrationForScene] Audio src for scene', sceneNumber, ':', audioSrc ? 'found' : 'NOT FOUND');

      if (!audioSrc) {
        console.log('[playNarrationForScene] No audio source for scene', sceneNumber, '- continuing with existing audio');
        // Don't reset narration - let the existing audio continue playing
        // This handles the case where not all scenes have individual audio tracks
        return;
      }

      let audio = narrationAudioRef.current;
      if (!audio) {
        console.log('[playNarrationForScene] Creating new Audio element');
        audio = new Audio();
        audio.preload = "auto";
        audio.crossOrigin = "anonymous";
        narrationAudioRef.current = audio;
      }

      // Check if audio is already playing for this scene at the right offset
      if (
        currentAudioSceneRef.current === sceneNumber &&
        audio.src === audioSrc &&
        !audio.paused &&
        Math.abs(audio.currentTime - offsetSeconds) < 0.05
      ) {
        console.log('[playNarrationForScene] Audio already playing at correct position');
        return;
      }

      console.log('[playNarrationForScene] Stopping current audio');
      stopNarrationAudio(false);

      const record = sceneVoiceData?.[sceneNumber];
      const effectiveDuration =
        record?.duration && Number.isFinite(record.duration) && record.duration > 0
          ? record.duration
          : audio.duration;
      const desiredOffset =
        effectiveDuration && Number.isFinite(effectiveDuration) && effectiveDuration > 0
          ? Math.min(Math.max(offsetSeconds, 0), Math.max(effectiveDuration - 0.05, 0))
          : Math.max(offsetSeconds, 0);

      console.log('[playNarrationForScene] Desired offset:', desiredOffset, 'effective duration:', effectiveDuration);

      const startPlayback = () => {
        console.log('[playNarrationForScene] startPlayback called, audio.readyState:', audio.readyState);
        try {
          if (Math.abs(audio.currentTime - desiredOffset) > 0.05) {
            console.log('[playNarrationForScene] Setting audio.currentTime to:', desiredOffset);
            audio.currentTime = desiredOffset;
          }
        } catch (err) {
          console.error('[playNarrationForScene] Error setting currentTime:', err);
        }

        console.log('[playNarrationForScene] Calling audio.play()');
        const playPromise = audio.play();
        if (playPromise) {
          playPromise
            .then(() => {
              console.log('[playNarrationForScene] Audio play succeeded');
            })
            .catch((err) => {
              console.error('[playNarrationForScene] Audio play failed:', err);
            });
        }
      };

      if (audio.src !== audioSrc) {
        console.log('[playNarrationForScene] Setting new audio src, waiting for loadeddata');
        audio.src = audioSrc;
        audio.addEventListener("loadeddata", startPlayback, { once: true });
      } else if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        console.log('[playNarrationForScene] Audio already loaded, starting playback immediately');
        startPlayback();
      } else {
        console.log('[playNarrationForScene] Audio not loaded, waiting for loadeddata');
        audio.addEventListener("loadeddata", startPlayback, { once: true });
      }

      // Audio end should NOT trigger scene transitions
      // Scene transitions are handled by video end OR fallback timer
      audio.onended = () => {
        console.log('[playNarrationForScene] Audio ended for scene', sceneNumber);
        currentAudioSceneRef.current = null;
      };

      currentAudioSceneRef.current = sceneNumber;
      console.log('[playNarrationForScene] Set currentAudioSceneRef to:', sceneNumber);
    },
    [getSceneAudioSrc, previewVideoRef, resetNarration, scenes, sceneVoiceData, stopNarrationAudio]
  );

  useEffect(
    () => () => {
      resetNarration();
    },
    [resetNarration]
  );

  useEffect(() => {
    if (!sceneVoiceData) {
      resetNarration();
      return;
    }

    const sceneNumber = currentAudioSceneRef.current;
    if (sceneNumber != null && !sceneVoiceData[sceneNumber]?.audioBase64) {
      resetNarration();
    }
  }, [resetNarration, sceneVoiceData]);

  const tickStep = useMemo(() => {
    return TIME_GRID_LEVELS.find((level) => safeDuration >= level.threshold)?.step ?? 1;
  }, [safeDuration]);

  const ticks = useMemo(() => {
    const values: number[] = [];
    for (let t = 0; t <= safeDuration; t += tickStep) {
      values.push(Number(t.toFixed(2)));
    }
    if (values[values.length - 1] < safeDuration) {
      values.push(Number(safeDuration.toFixed(2)));
    }
    return values;
  }, [safeDuration, tickStep]);

  const normalizedAudioClips = useMemo(() => {
    if (!audioClips?.length) return [];

    return audioClips.map((clip, index) => {
      const start = Math.max(0, clip.start);
      const duration = Math.max(clip.duration, 0.5);
      const accentClassName =
        clip.accentClassName ??
        [
          "border-primary/40 bg-gradient-to-r from-primary/40 via-primary/20 to-primary/10 text-primary",
          "border-emerald-400/40 bg-gradient-to-r from-emerald-400/40 via-emerald-400/20 to-emerald-400/10 text-emerald-600",
          "border-sky-400/40 bg-gradient-to-r from-sky-400/40 via-sky-400/20 to-sky-400/10 text-sky-600",
        ][index % 3];

      return {
        ...clip,
        start,
        duration,
        accentClassName,
      };
    });
  }, [audioClips]);

  const selectedSegment = useMemo(
    () => timelineSegments.find((segment) => segment.sceneNumber === activeScene) ?? null,
    [timelineSegments, activeScene]
  );

  const selectedScene = useMemo(
    () => scenes.find((scene) => scene.sceneNumber === activeScene) ?? null,
    [activeScene, scenes]
  );

  const selectedSceneNumber = selectedScene?.sceneNumber ?? null;
  const selectedSegmentStart = selectedSegment?.start ?? null;
  const selectedSegmentEnd = selectedSegment?.end ?? null;
  const segmentDuration = selectedSegment?.durationSeconds ?? DEFAULT_SCENE_DURATION;

  const advanceToNextSegment = useCallback(() => {
    console.log('[advanceToNextSegment] Called, current scene:', selectedSceneNumber);
    if (selectedSceneNumber == null) {
      console.log('[advanceToNextSegment] No current scene, returning');
      return;
    }

    const currentIndex = timelineSegments.findIndex((segment) => segment.sceneNumber === selectedSceneNumber);
    console.log('[advanceToNextSegment] Current index:', currentIndex);
    if (currentIndex < 0) return;

    const nextSegment = timelineSegments[currentIndex + 1];
    console.log('[advanceToNextSegment] Next segment:', nextSegment?.sceneNumber);

    if (!nextSegment) {
      console.log('[advanceToNextSegment] No next segment, stopping playback');
      pauseNarration();
      setIsPreviewPlaying(false);
      return;
    }

    console.log('[advanceToNextSegment] Transitioning to scene', nextSegment.sceneNumber, '- DO NOT PAUSE AUDIO');
    isTransitioningRef.current = true;
    setActiveScene(nextSegment.sceneNumber);
    updatePlayhead(nextSegment.start, "instant");
    setPendingAutoPlay(true); // Always auto-play the next scene
    // Audio should continue playing during the transition
    // Reset transition flag after a brief delay to allow scene change to complete
    setTimeout(() => {
      isTransitioningRef.current = false;
    }, 100);
  }, [pauseNarration, selectedSceneNumber, timelineSegments, updatePlayhead]);

  useEffect(() => {
    advanceToNextSegmentRef.current = advanceToNextSegment;
  }, [advanceToNextSegment]);

  useEffect(() => {
    if (selectedSegmentStart != null && !pendingAutoPlay) {
      // Only update playhead on scene change if NOT in auto-play mode
      // During auto-play transitions, let pendingAutoPlay handle the playback
      updatePlayhead(selectedSegmentStart, "instant");
    }
  }, [selectedSegmentStart, pendingAutoPlay, updatePlayhead]);

  const runVideoFrameLoop = useCallback(
    (video: HTMLVideoElement) => {
      stopAnimations();
      const segmentStart = selectedSegmentStart ?? 0;
      const supportsVideoFrame = typeof (video as any).requestVideoFrameCallback === "function";

      if (supportsVideoFrame) {
        const step = (_now: number, metadata: VideoFrameCallbackMetadata) => {
          updatePlayhead(segmentStart + metadata.mediaTime);
          videoFrameCallbackRef.current = (video as any).requestVideoFrameCallback(step);
        };
        videoFrameCallbackRef.current = (video as any).requestVideoFrameCallback(step);
      } else {
        const step = () => {
          updatePlayhead(segmentStart + video.currentTime);
          rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [selectedSegmentStart, stopAnimations, updatePlayhead]
  );

  const runFallbackLoop = useCallback(() => {
    stopAnimations();
    const segmentStart = selectedSegmentStart ?? playheadTimeRef.current;
    playbackClockRef.current = null;

    const step = () => {
      const audio = narrationAudioRef.current;
      const record = selectedSceneNumber != null ? sceneVoiceData?.[selectedSceneNumber] : null;
      const narrationActive =
        audio &&
        currentAudioSceneRef.current === selectedSceneNumber &&
        !audio.paused &&
        !audio.ended;

      let elapsed = 0;
      let effectiveDuration = segmentDuration;

      if (narrationActive) {
        const durationFromRecord = record?.duration;
        if (durationFromRecord && Number.isFinite(durationFromRecord) && durationFromRecord > 0) {
          effectiveDuration = durationFromRecord;
        } else if (Number.isFinite(audio.duration) && audio.duration > 0) {
          effectiveDuration = audio.duration;
        }
        elapsed = audio.currentTime;
      } else {
        if (playbackClockRef.current == null) {
          playbackClockRef.current = performance.now() - (playheadTimeRef.current - segmentStart) * 1000;
        }
        elapsed = (performance.now() - playbackClockRef.current) / 1000;
        if (elapsed >= effectiveDuration) {
          updatePlayhead(segmentStart + effectiveDuration, "auto");
          stopAnimations();
          advanceToNextSegment();
          return;
        }
      }

      const target = segmentStart + elapsed;
      updatePlayhead(target);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [
    advanceToNextSegment,
    sceneVoiceData,
    segmentDuration,
    selectedSceneNumber,
    selectedSegmentStart,
    stopAnimations,
    updatePlayhead,
  ]);

  const playPreview = useCallback(() => {
    console.log('[playPreview] Called for scene', selectedScene?.sceneNumber);
    setPendingAutoPlay(false);

    const video = previewVideoRef?.current ?? null;
    const hasVideo = Boolean(selectedScene?.videoUrl && video);
    const sceneNumber = selectedScene?.sceneNumber ?? null;
    const segmentStart = selectedSegmentStart ?? 0;
    const currentOffset = Math.max(playheadTimeRef.current - segmentStart, 0);

    console.log('[playPreview] hasVideo:', hasVideo, 'sceneNumber:', sceneNumber);

    if (hasVideo && video) {
      console.log('[playPreview] Playing video for scene', sceneNumber);
      // Reset video to start
      video.currentTime = 0;

      // DON'T start narration here - let handlePlay event handler do it
      // This allows audio to continue seamlessly during scene transitions
      console.log('[playPreview] Skipping audio start - will be handled by handlePlay event');

      // Start video playback
      const playNow = () => {
        console.log('[playPreview] Starting video playback, readyState:', video.readyState);
        const playPromise = video.play();
        if (playPromise) {
          playPromise
            .then(() => {
              console.log('[playPreview] Video play succeeded');
            })
            .catch((err) => {
              console.error('[playPreview] Video play failed:', err);
            });
        }
        // Note: runVideoFrameLoop will be called by the 'play' event handler
      };

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        console.log('[playPreview] Video ready, playing immediately');
        playNow();
      } else {
        console.log('[playPreview] Waiting for video to load, readyState:', video.readyState);

        // Use 'canplay' event which fires when enough data is loaded to start playback
        const handleCanPlay = () => {
          console.log('[playPreview] canplay event fired, readyState:', video.readyState);
          video.removeEventListener("canplay", handleCanPlay);
          video.removeEventListener("loadeddata", handleLoadedData);
          playNow();
        };

        const handleLoadedData = () => {
          console.log('[playPreview] loadeddata event fired, readyState:', video.readyState);
          video.removeEventListener("canplay", handleCanPlay);
          video.removeEventListener("loadeddata", handleLoadedData);
          playNow();
        };

        video.addEventListener("canplay", handleCanPlay, { once: true });
        video.addEventListener("loadeddata", handleLoadedData, { once: true });
      }

      return;
    }

    // Fallback for scenes without video
    console.log('[playPreview] No video, using fallback loop');
    setIsPreviewPlaying(true);
    playNarrationForScene(sceneNumber, currentOffset);
    runFallbackLoop();
  }, [playNarrationForScene, previewVideoRef, runFallbackLoop, runVideoFrameLoop, selectedScene, selectedSegmentStart, setPendingAutoPlay]);

  const pausePreview = useCallback(() => {
    setPendingAutoPlay(false);
    const video = previewVideoRef?.current ?? null;

    if (selectedScene?.videoUrl && video) {
      video.pause();
      pauseNarration();
      return;
    }

    setIsPreviewPlaying(false);
    stopAnimations();
    pauseNarration();
  }, [pauseNarration, previewVideoRef, selectedScene, setPendingAutoPlay, stopAnimations]);

  const togglePreview = useCallback(() => {
    console.log('[togglePreview] Called');
    const video = previewVideoRef?.current ?? null;
    console.log('[togglePreview] video:', !!video, 'selectedScene:', selectedScene?.sceneNumber, 'hasVideoUrl:', !!selectedScene?.videoUrl);

    if (selectedScene?.videoUrl && video) {
      console.log('[togglePreview] Video mode, paused:', video.paused);
      if (video.paused) {
        playPreview();
      } else {
        pausePreview();
      }
      return;
    }

    console.log('[togglePreview] Fallback mode, isPreviewPlaying:', isPreviewPlaying);
    if (isPreviewPlaying) {
      pausePreview();
    } else {
      playPreview();
    }
  }, [isPreviewPlaying, pausePreview, playPreview, previewVideoRef, selectedScene]);

  const playbackController = useMemo<TimelinePlaybackController>(() => ({
    play: playPreview,
    pause: pausePreview,
    toggle: togglePreview,
    isPlaying: () => {
      const video = previewVideoRef?.current ?? null;
      if (selectedScene?.videoUrl && video) {
        return !video.paused;
      }
      return isPreviewPlaying;
    },
  }), [pausePreview, playPreview, previewVideoRef, selectedScene, togglePreview, isPreviewPlaying]);

  useEffect(() => {
    onPlaybackControllerChange?.(playbackController);
    return () => {
      onPlaybackControllerChange?.(null);
    };
  }, [onPlaybackControllerChange, playbackController]);

  useEffect(() => {
    if (!previewVideoRef || selectedScene?.videoUrl) return;
    previewVideoRef.current = null;
  }, [previewVideoRef, selectedScene?.videoUrl]);

  // Force video to load when scene changes
  useEffect(() => {
    const video = previewVideoRef?.current;
    if (!video || !selectedScene?.videoUrl) return;

    console.log('[VideoTimeline] Scene changed, forcing video load for scene', selectedScene.sceneNumber);
    console.log('[VideoTimeline] Video readyState before load():', video.readyState);

    // Force the browser to load the video
    video.load();

    console.log('[VideoTimeline] Video readyState after load():', video.readyState);
  }, [previewVideoRef, selectedScene?.sceneNumber, selectedScene?.videoUrl]);

  useEffect(() => {
    console.log('[pendingAutoPlay effect] pendingAutoPlay:', pendingAutoPlay, 'selectedSegmentStart:', selectedSegmentStart);
    if (!pendingAutoPlay) return;

    if (selectedSegmentStart == null) {
      console.log('[pendingAutoPlay effect] No segment start, canceling auto-play');
      setPendingAutoPlay(false);
      return;
    }

    console.log('[pendingAutoPlay effect] Starting auto-play at', selectedSegmentStart);
    updatePlayhead(selectedSegmentStart, "instant");
    playPreview();
  }, [pendingAutoPlay, playPreview, selectedSegmentStart, setPendingAutoPlay, updatePlayhead]);

  useEffect(() => {
    const video = previewVideoRef?.current;
    if (!video || selectedSegmentStart == null) return;

    const handlePlay = () => {
      console.log('[VideoTimeline] handlePlay triggered, video.currentTime:', video.currentTime, 'activeScene:', activeScene);
      setIsPreviewPlaying(true);
      runVideoFrameLoop(video);

      // Start/continue audio for this scene
      // Audio should continue from where it left off on the timeline
      const sceneNumber = selectedScene?.sceneNumber ?? null;
      const offset = selectedSegmentStart != null ? Math.max(playheadTimeRef.current - selectedSegmentStart, 0) : 0;
      console.log('[VideoTimeline] handlePlay - sceneNumber:', sceneNumber, 'offset:', offset, 'playheadTime:', playheadTimeRef.current, 'segmentStart:', selectedSegmentStart, 'currentAudioScene:', currentAudioSceneRef.current);

      // Only start audio if we're at the beginning of the video or if audio isn't already playing
      const audio = narrationAudioRef.current;
      const audioPlaying = audio && !audio.paused;

      console.log('[VideoTimeline] handlePlay - audio state: paused=', audio?.paused, 'currentAudioScene=', currentAudioSceneRef.current, 'sceneNumber=', sceneNumber, 'audioPlaying=', audioPlaying);

      if (!audioPlaying) {
        // No audio is playing, so start audio for this scene
        console.log('[VideoTimeline] handlePlay - starting audio at offset:', offset);
        playNarrationForScene(sceneNumber, offset);
      } else if (currentAudioSceneRef.current !== sceneNumber) {
        // Audio is playing but for a different scene (e.g., continuing from previous scene)
        // This is OK - let it continue, just update the current scene reference
        console.log('[VideoTimeline] handlePlay - audio continuing from previous scene', currentAudioSceneRef.current, 'into scene', sceneNumber);
      } else {
        // Audio is already playing for this scene
        console.log('[VideoTimeline] handlePlay - audio already playing for scene', sceneNumber, ', NOT calling playNarrationForScene again');
      }
    };

    const handlePause = () => {
      console.log('[VideoTimeline] handlePause triggered, isTransitioning:', isTransitioningRef.current, 'video.currentTime:', video.currentTime);
      console.log('[VideoTimeline] handlePause - selectedSegmentStart:', selectedSegmentStart, 'activeScene:', activeScene);

      const videoEnded =
        video.ended ||
        (Number.isFinite(video.duration) &&
          Number.isFinite(video.currentTime) &&
          Math.abs(video.duration - video.currentTime) < 0.05);

      if (videoEnded) {
        console.log('[VideoTimeline] handlePause - ignoring pause event because video ended');
        return;
      }

      // Skip pause handling during scene transitions to avoid stopping audio
      if (isTransitioningRef.current) {
        console.log('[VideoTimeline] handlePause - skipping during scene transition');
        return;
      }

      setIsPreviewPlaying(false);
      stopAnimations();
      updatePlayhead(selectedSegmentStart != null ? selectedSegmentStart + video.currentTime : video.currentTime, "smooth");
      pauseNarration();
    };

    const handleEnded = () => {
      console.log('[VideoTimeline] Video ended, advancing to next scene');
      stopAnimations();

      // Don't check isPreviewPlayingRef - if video ended, we were playing
      // Just advance directly
      advanceToNextSegment();
    };

    const handleSeeked = () => {
      const relativeTime = Math.max(video.currentTime, 0);
      updatePlayhead(selectedSegmentStart + relativeTime, isPreviewPlaying ? "auto" : "smooth");
      if (isPreviewPlaying) {
        runVideoFrameLoop(video);
        const sceneNumber = selectedScene?.sceneNumber ?? null;
        playNarrationForScene(sceneNumber, relativeTime);
      }
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("seeked", handleSeeked);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("seeked", handleSeeked);
    };
  }, [advanceToNextSegment, isPreviewPlaying, pauseNarration, playNarrationForScene, previewVideoRef, runVideoFrameLoop, selectedScene, selectedSegmentEnd, selectedSegmentStart, stopAnimations, updatePlayhead]);

  const handleTimelineSeek = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (!timelineSegments.length) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const rawTime = offsetX / PIXELS_PER_SECOND;
      const clampedTime = clampTime(rawTime);
      updatePlayhead(clampedTime, isPreviewPlaying ? "auto" : "smooth");

      const segment =
        timelineSegments.find((candidate) => clampedTime >= candidate.start && clampedTime <= candidate.end) ??
        timelineSegments[timelineSegments.length - 1];

      if (!segment) return;

      if (segment.sceneNumber === activeScene) {
        const video = previewVideoRef?.current;
        if (video && segment.videoUrl) {
          video.currentTime = Math.max(clampedTime - segment.start, 0);
          if (isPreviewPlaying) {
            runVideoFrameLoop(video);
          }
        } else {
          playbackClockRef.current = performance.now() - Math.max(clampedTime - segment.start, 0) * 1000;
        }
      } else {
        setActiveScene(segment.sceneNumber);
        setPendingAutoPlay(isPreviewPlaying);
      }
    },
    [activeScene, clampTime, isPreviewPlaying, previewVideoRef, runVideoFrameLoop, timelineSegments, updatePlayhead]
  );

  const handleSegmentPress = useCallback(
    (segment: (typeof timelineSegments)[number], event: ReactMouseEvent<HTMLButtonElement>) => {
      const video = previewVideoRef?.current;

      if (event.button !== 0) {
        setActiveScene(segment.sceneNumber);
        updatePlayhead(segment.start, "instant");
        setPendingAutoPlay(false);
        if (segment.sceneNumber === activeScene && video && segment.videoUrl) {
          video.currentTime = 0;
        }
        return;
      }

      const buttonRect = event.currentTarget.getBoundingClientRect();
      const offsetX = event.clientX - buttonRect.left;
      const localTime = segment.start + offsetX / PIXELS_PER_SECOND;
      const clamped = clampTime(localTime);
      updatePlayhead(clamped, isPreviewPlaying ? "auto" : "smooth");

      if (segment.sceneNumber === activeScene) {
        if (video && segment.videoUrl) {
          video.currentTime = Math.max(clamped - segment.start, 0);
          if (isPreviewPlaying) {
            runVideoFrameLoop(video);
          }
        } else {
          playbackClockRef.current = performance.now() - Math.max(clamped - segment.start, 0) * 1000;
        }
      } else {
        setActiveScene(segment.sceneNumber);
        setPendingAutoPlay(isPreviewPlaying);
      }
    },
    [activeScene, clampTime, isPreviewPlaying, previewVideoRef, runVideoFrameLoop, timelineSegments, updatePlayhead]
  );

  const playheadPosition = Math.round(playheadTime * PIXELS_PER_SECOND);

  const segmentBorderClasses: Record<SceneStatus, string> = {
    ready: "border-emerald-400/60",
    "generating-video": "border-primary/60",
    error: "border-destructive/50",
    loading: "border-primary/40",
    empty: "border-border/60",
  };

  const statusIndicatorClasses: Record<SceneStatus, string> = {
    ready: "bg-emerald-400",
    "generating-video": "bg-primary",
    error: "bg-destructive",
    loading: "bg-primary/70",
    empty: "bg-border",
  };

  return (
    <Card className="space-y-6 rounded-3xl border border-primary/10 bg-gradient-to-br from-card via-card/95 to-card/90 p-6 shadow-lg shadow-primary/5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Timeline</p>
          <h3 className="text-2xl font-bold text-foreground mt-1">
            {scenes.length ? `${scenes.length} scène${scenes.length > 1 ? "s" : ""}` : "Aucune scène"}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Badge className="gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 transition-colors">
            <Sparkles className="h-3.5 w-3.5" />
            Prêt à lire
          </Badge>
          <div className="rounded-full border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-4 py-2 font-semibold text-foreground shadow-sm shadow-primary/10">
            {formatTime(playheadTime)} / {formatTime(safeDuration)}
          </div>
          {onDownloadAssets ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadAssets}
              disabled={isDownloadDisabled}
              className="gap-2 text-xs bg-primary/5 hover:bg-primary/10 border-primary/20 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Télécharger
            </Button>
          ) : (
            <span className="hidden sm:block text-muted-foreground">Sélectionnez une scène pour prévisualiser.</span>
          )}
        </div>
      </header>

      <div className="space-y-4">
        <div
          ref={timelineScrollRef}
          className="relative overflow-x-auto rounded-2xl border border-primary/15 bg-gradient-to-b from-background/80 to-background/60 shadow-lg shadow-primary/10"
        >
          <div className="relative" style={{ width: timelineWidthPx }}>
            <div
              className="relative h-16 border-b border-primary/20 bg-gradient-to-b from-background/95 to-background/80 cursor-pointer hover:bg-gradient-to-b hover:from-primary/5 hover:to-background/80 transition-colors"
              onMouseDownCapture={handleTimelineSeek}
            >
              {ticks.map((tick, index) => (
                <div
                  key={`${tick}-${index}`}
                  className={cn(
                    "absolute top-0 flex flex-col items-center text-[11px] text-muted-foreground/70 hover:text-primary/70 transition-colors",
                    tick !== 0 && "-translate-x-1/2"
                  )}
                  style={{ left: Math.round(tick * PIXELS_PER_SECOND) }}
                >
                  <div className="h-3 w-[1px] bg-gradient-to-b from-primary/40 to-primary/10" />
                  <span className="mt-1 font-medium">{formatTime(tick)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-6 px-5 py-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary/80">
                  <Volume2 className="h-4 w-4" />
                  Narration
                </div>
                <div className="relative h-20 rounded-xl border border-primary/20 bg-gradient-to-b from-emerald-500/5 via-background/80 to-background/60 shadow-sm shadow-emerald-500/10">
                  {normalizedAudioClips.length ? (
                    normalizedAudioClips.map((clip) => {
                      const left = Math.round(clip.start * PIXELS_PER_SECOND);
                      const width = Math.max(Math.round(clip.duration * PIXELS_PER_SECOND), MIN_CLIP_WIDTH);
                      const maxWidth = timelineWidthPx - left - 8;
                      const safeWidth = Math.max(Math.min(width, maxWidth), MIN_CLIP_WIDTH);

                      return (
                        <div
                          key={clip.id}
                          className={cn(
                            "absolute top-1 bottom-1 flex min-w-[96px] flex-col justify-between rounded-lg border px-3 py-2 shadow-md hover:shadow-lg transition-shadow",
                            clip.accentClassName
                          )}
                          style={{ left, width: safeWidth }}
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                            <span className="truncate">{clip.label}</span>
                            <span className="text-[10px] text-foreground/60">
                              {formatTime(clip.start)} - {formatTime(clip.start + clip.duration)}
                            </span>
                          </div>
                          <div className="flex h-6 items-end gap-1 text-emerald-400">
                            {DEFAULT_WAVEFORM.map((height, index) => (
                              <span
                                key={index}
                                className="flex-1 rounded-full bg-current/70 hover:bg-current transition-colors"
                                style={{ height: `${height / 2}px` }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/60">
                      <Volume2 className="h-3 w-3" />
                      Narration ElevenLabs générée
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary/80">
                  <Clapperboard className="h-4 w-4" />
                  Storyboard
                </div>
                <div
                  className="relative h-40 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 via-background/80 to-background/60 shadow-sm shadow-primary/10 hover:shadow-md transition-shadow"
                  onMouseDownCapture={handleTimelineSeek}
                >
                  {timelineSegments.map((segment) => {
                    const tone = statusTokens[segment.status];
                    const isActive = segment.sceneNumber === activeScene;
                    const generating = isSceneGenerating?.(segment.sceneNumber) ?? false;
                    const left = Math.round(segment.start * PIXELS_PER_SECOND);
                    const width = Math.max(Math.round(segment.durationSeconds * PIXELS_PER_SECOND), MIN_CLIP_WIDTH);

                    return (
                      <button
                        key={segment.sceneNumber}
                        onMouseDown={(event) => handleSegmentPress(segment, event)}
                        onClick={(event) => handleSegmentPress(segment, event)}
                        className={cn(
                          "group absolute top-3 bottom-3 overflow-hidden rounded-lg border-2 text-left shadow-md hover:shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
                          isActive ? "ring-2 ring-primary/60 shadow-lg shadow-primary/30" : "hover:border-primary/50 hover:shadow-primary/20",
                          segmentBorderClasses[segment.status]
                        )}
                        style={{ left, width }}
                        aria-pressed={isActive}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20" />
                        {segment.videoUrl ? (
                          <video
                            src={segment.videoUrl}
                            className="absolute inset-0 h-full w-full object-cover"
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              const video = e.currentTarget;
                              if (video.duration && Number.isFinite(video.duration) && video.duration > 0) {
                                setVideoDurations((prev) => ({
                                  ...prev,
                                  [segment.sceneNumber]: video.duration,
                                }));
                              }
                            }}
                          />
                        ) : segment.imageUrl ? (
                          <img
                            src={segment.imageUrl}
                            alt={segment.title}
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          renderEmptyState(segment.sceneNumber)
                        )}
                        <div className="absolute left-2 top-2 flex items-center gap-2">
                          <span className="rounded-full bg-background/80 px-2 py-[2px] text-[10px] font-semibold text-foreground">
                            #{segment.sceneNumber}
                          </span>
                          <span
                            className={cn(
                              "h-2.5 w-2.5 rounded-full border border-background/80 shadow-sm",
                              statusIndicatorClasses[segment.status]
                            )}
                            title={tone.label}
                          />
                          {generating && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />}
                        </div>
                      </button>
                    );
                  })}

                  {!timelineSegments.length && (
                    <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                      Ajoutez des scènes pour construire votre timeline.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {timelineSegments.length > 0 && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-1 bg-gradient-to-b from-primary via-primary/80 to-primary/30 shadow-lg shadow-primary/40"
                style={{ left: Math.max(playheadPosition, 0) }}
              />
            )}
          </div>
        </div>
      </div>

      {selectedScene ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
          <Card className="flex flex-col gap-3 border border-border/60 bg-background/90 p-4">
            <div className="rounded-xl bg-background/80 p-3">
              <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-secondary/40">
                {selectedScene.videoUrl ? (
                  <video
                    src={selectedScene.videoUrl}
                    className="absolute inset-0 h-full w-full object-cover"
                    muted
                    playsInline
                    preload="auto"
                    ref={previewVideoRef ?? undefined}
                  />
                ) : selectedScene.imageUrl ? (
                  <img
                    src={selectedScene.imageUrl}
                    alt={selectedScene.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  renderEmptyState(selectedScene.sceneNumber)
                )}
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">{selectedScene.title}</p>
              <p className="text-xs text-muted-foreground">
                Scène {selectedScene.sceneNumber} · {formatTime(selectedSegmentStart ?? 0)} → {formatTime((selectedSegmentStart ?? 0) + segmentDuration)}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center gap-2"
                onClick={() => onRegenerateImage(selectedScene.sceneNumber)}
                disabled={isRegenerating}
              >
                {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {selectedScene.imageUrl ? "Régénérer l'image" : "Générer l'image"}
              </Button>
              <Button
                size="sm"
                className="w-full justify-center gap-2"
                onClick={() => onGenerateVideo(selectedScene.sceneNumber)}
                disabled={isSceneGenerating?.(selectedScene.sceneNumber)}
              >
                {isSceneGenerating?.(selectedScene.sceneNumber) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <VideoIcon className="h-3.5 w-3.5" />
                )}
                Générer la vidéo
              </Button>
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="space-y-3 border border-border/60 bg-background/90 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Style visuel</p>
                <Badge variant="outline" className="border-border/60 text-[10px] uppercase">
                  Timeline
                </Badge>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`style-${selectedScene.sceneNumber}`} className="text-xs font-semibold">
                  Thème de régénération
                </Label>
                <select
                  id={`style-${selectedScene.sceneNumber}`}
                  value={selectedScene.styleOverrideId ?? selectedScene.styleId ?? "none"}
                  onChange={(event) => onSceneStyleChange?.(selectedScene.sceneNumber, event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {styleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">Ce style sera utilisé lors de la prochaine régénération.</p>
              </div>
            </Card>

            <Card className="space-y-4 border border-border/60 bg-background/90 p-4">
              {selectedScene.narration && (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Quote className="h-3.5 w-3.5" /> Narration
                  </div>
                  <p className="leading-relaxed text-foreground/90">{selectedScene.narration}</p>
                </div>
              )}
              {selectedScene.visual && (
                <div className="space-y-2 border-t border-border/40 pt-3 text-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Clapperboard className="h-3.5 w-3.5" /> Visuel attendu
                  </div>
                  <p className="text-muted-foreground">{selectedScene.visual}</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sélectionnez une scène pour afficher sa prévisualisation.</p>
      )}
    </Card>
  );
};
