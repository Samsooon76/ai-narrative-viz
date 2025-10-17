import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Play, Clock3, Volume2 } from "lucide-react";

const PROMPT = "Fais-moi une vidéo sur Victor Hugo.";

const TIMELINE_SCENES = [
  {
    duration: 5,
    end: "00:05",
    thumbnail: "https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?auto=format&fit=crop&w=1200&q=80",
    title: "Paris s'éveille",
  },
  {
    duration: 7,
    end: "00:12",
    thumbnail: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1200&q=80",
    title: "Victor à l'écriture",
  },
  {
    duration: 8,
    end: "00:20",
    thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80",
    title: "Les personnages prennent vie",
  },
  {
    duration: 10,
    end: "00:30",
    thumbnail: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80",
    title: "Conclusion orchestrale",
  },
] as const;

const AUDIO_WAVE_POINTS = [
  12, 28, 18, 40, 22, 35, 16, 32, 24, 44, 20, 36, 18, 30, 14, 24, 20, 42, 26, 38, 24, 32, 18, 28, 14, 26, 18, 40, 22, 34, 16, 30,
  22, 44, 26, 40, 24, 30, 16, 28, 18, 34, 20, 36, 18, 32, 22, 38, 20, 30, 16, 28, 18, 32, 20, 34, 18, 28, 16, 26, 18, 32, 22, 36,
  20, 30, 18, 34, 22, 40, 24, 32, 18, 28, 20, 36, 24, 40, 22, 34, 18, 30, 16, 26, 18, 32, 20, 34, 18, 30, 16, 28, 20, 36, 24, 38,
  22, 30, 18, 26, 16, 24,
];

const buildWavePath = (points: readonly number[], width = 1000, height = 180) => {
  if (!points.length) return "";
  const mid = height / 2;
  const step = width / (points.length - 1);

  const top = points.map((value, index) => {
    const x = index * step;
    const y = Math.max(0, mid - value);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const bottom = [...points].reverse().map((value, index) => {
    const x = (points.length - 1 - index) * step;
    const y = Math.min(height, mid + value);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  return `M 0 ${mid.toFixed(1)} L ${top.join(" L ")} L ${width.toFixed(1)} ${mid.toFixed(
    1
  )} L ${bottom.join(" L ")} Z`;
};

type Phase = "typing" | "ready" | "sending" | "processing" | "complete";

type LandingProcessProps = {
  autoStart?: boolean;
  autoStartDelayMs?: number;
  startSignal?: number | null;
};

export const LandingProcess = ({
  autoStart = true,
  autoStartDelayMs = 0,
  startSignal = null,
}: LandingProcessProps) => {
  const [displayPrompt, setDisplayPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const [progress, setProgress] = useState(0);
  const [buttonPressed, setButtonPressed] = useState(false);
  const timeoutsRef = useRef<number[]>([]);
  const intervalRef = useRef<number | null>(null);
  const lastStartSignalRef = useRef<number | null>(null);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const typePrompt = useCallback(() => {
    clearTimeouts();
    stopInterval();
    setDisplayPrompt("");
    setProgress(0);
    setButtonPressed(false);
    setPhase("typing");

    const chars = Array.from(PROMPT);
    chars.forEach((char, index) => {
      const timeout = window.setTimeout(() => {
        setDisplayPrompt((prev) => prev + char);
        if (index === chars.length - 1) {
          const readyTimeout = window.setTimeout(() => setPhase("ready"), 240);
          timeoutsRef.current.push(readyTimeout);
        }
      }, 45 * (index + 1));
      timeoutsRef.current.push(timeout);
    });
  }, [clearTimeouts, stopInterval]);

  useEffect(() => {
    if (!autoStart) return;
    const timeout = window.setTimeout(() => {
      typePrompt();
    }, Math.max(0, autoStartDelayMs));
    timeoutsRef.current.push(timeout);
    return () => window.clearTimeout(timeout);
  }, [autoStart, autoStartDelayMs, typePrompt]);

  useEffect(() => {
    if (startSignal === null || startSignal === undefined) return;
    if (lastStartSignalRef.current === startSignal) return;
    lastStartSignalRef.current = startSignal;
    const timeout = window.setTimeout(() => {
      typePrompt();
    }, Math.max(0, autoStartDelayMs));
    timeoutsRef.current.push(timeout);
    return () => window.clearTimeout(timeout);
  }, [startSignal, autoStartDelayMs, typePrompt]);

  useEffect(() => {
    return () => {
      clearTimeouts();
      stopInterval();
    };
  }, [clearTimeouts, stopInterval]);

  useEffect(() => {
    if (phase !== "sending") return;
    const timeout = window.setTimeout(() => {
      setButtonPressed(false);
      setProgress(0);
      setPhase("processing");
    }, 480);
    timeoutsRef.current.push(timeout);
  }, [phase]);

  useEffect(() => {
    if (phase !== "processing") return;

    stopInterval();
    let current = 15;
    setProgress(15);

    intervalRef.current = window.setInterval(() => {
      current = Math.min(100, current + 12 + Math.random() * 8);
      setProgress(Math.round(current));

      if (current >= 100) {
        stopInterval();
        setProgress(100);
        const timeout = window.setTimeout(() => setPhase("complete"), 380);
        timeoutsRef.current.push(timeout);
      }
    }, 180);

    return () => stopInterval();
  }, [phase, stopInterval]);

  const handleSend = useCallback(() => {
    if (phase !== "ready" && phase !== "complete") return;
    clearTimeouts();
    stopInterval();
    setProgress(0);
    setButtonPressed(true);
    setPhase("sending");
  }, [phase, clearTimeouts, stopInterval]);

  const resetDemo = useCallback(() => {
    typePrompt();
  }, [typePrompt]);

  const progressLabel = phase === "sending" ? "Brief envoyé" : "Génération du storyboard";
  const clampedProgress = Math.min(progress, 100);
  const shouldShowProgress = phase === "sending" || (phase === "processing" && clampedProgress < 100);
  const progressValue = phase === "processing" ? clampedProgress : 0;

  const totalDurationSeconds = TIMELINE_SCENES.reduce((acc, scene) => acc + scene.duration, 0);
  const tickStep = 5;
  const timelineTicks = useMemo(
    () => Array.from({ length: Math.floor(totalDurationSeconds / tickStep) + 1 }, (_, i) => i * tickStep),
    [totalDurationSeconds, tickStep]
  );

  const formatTick = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}.00`;
  }, []);

  const wavePath = useMemo(() => buildWavePath(AUDIO_WAVE_POINTS), []);

  return (
    <div className="relative mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <div className="rounded-full border border-white/10 bg-white/5 px-5 py-4 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.75)] backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <div className="min-h-[2.25rem] whitespace-pre-line text-base font-medium leading-relaxed text-foreground">
                {displayPrompt || (
                  <span className="text-muted-foreground/70">Décrivez la vidéo à produire...</span>
                )}
              </div>
            </div>
            <div className="relative flex justify-end sm:justify-center sm:self-center">
              <motion.div
                animate={{ scale: buttonPressed ? 0.94 : 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="relative"
              >
                {(phase === "ready" || phase === "complete") && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full border-2 border-primary/50"
                    animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                <Button
                  onClick={handleSend}
                  disabled={phase === "typing" || phase === "sending" || phase === "processing"}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-accent px-6 py-2 text-sm font-semibold shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Envoyer
                  <Send className="h-4 w-4" />
                </Button>
              </motion.div>
              {(phase === "ready" || phase === "complete") && (
                <motion.div
                  className="pointer-events-none absolute -top-10 right-0 flex items-center gap-2 sm:-top-12 sm:right-[-4.5rem]"
                  animate={{ y: [-4, 0, -4], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary shadow-[0_6px_20px_-12px_rgba(59,130,246,0.9)] backdrop-blur">
                    Cliquez sur « Envoyer »
                  </div>
                  <motion.span
                    aria-hidden
                    className="h-6 w-6 rotate-45 rounded-lg bg-primary/12 shadow-[0_0_25px_rgba(59,130,246,0.4)]"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.div>
              )}
            </div>
          </div>
        </div>
        <AnimatePresence mode="wait">
          {shouldShowProgress && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.6)] backdrop-blur-sm"
            >
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {progressLabel}
                </span>
                <span>{`${Math.min(progressValue, 100)}%`}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-primary/80 to-accent"
                  animate={{ width: `${Math.min(progressValue, 100)}%` }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  style={{ width: "0%" }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {phase === "complete" && (
          <motion.div
            key="timeline"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-sm"
          >
            <motion.div
              className="absolute top-14 bottom-16 w-px bg-primary/70 shadow-[0_0_25px_rgba(59,130,246,0.45)]"
              initial={{ left: "0%" }}
              animate={{ left: "82%" }}
              transition={{ duration: 2.6, ease: "easeInOut" }}
            >
              <div className="absolute -top-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary" />
            </motion.div>

            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Play className="h-4 w-4" />
              Timeline générée
            </div>
            <div className="relative mt-6 space-y-6">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                {timelineTicks.map((tick) => (
                  <span key={tick}>{formatTick(tick)}</span>
                ))}
              </div>
              <div className="space-y-6 rounded-2xl border border-white/10 bg-black/40 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300 ring-1 ring-inset ring-purple-500/30">
                    <Volume2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
                      Audio
                    </div>
                    <div className="relative mt-3 overflow-hidden rounded-xl border border-purple-500/25 bg-[#110826] shadow-[0_18px_45px_-30px_rgba(124,58,237,0.75)]">
                      <motion.svg
                        viewBox="0 0 1000 180"
                        className="h-28 w-full"
                        animate={{ scaleY: [1, 1.05, 0.98] }}
                        transition={{ duration: 2.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
                        style={{ transformOrigin: "50% 50%" }}
                      >
                        <defs>
                          <linearGradient id="landing-wave-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                            <stop offset="0%" stopColor="#c084fc" stopOpacity="0.5" />
                            <stop offset="45%" stopColor="#a855f7" stopOpacity="0.85" />
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.6" />
                          </linearGradient>
                          <linearGradient id="landing-wave-edge" x1="0%" x2="0%" y1="0%" y2="100%">
                            <stop offset="0%" stopColor="#f0abfc" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#5b21b6" stopOpacity="0.15" />
                          </linearGradient>
                        </defs>

                        <motion.path
                          d={wavePath}
                          fill="url(#landing-wave-gradient)"
                          stroke="url(#landing-wave-edge)"
                          strokeWidth="1.5"
                          initial={{ opacity: 0.9 }}
                          animate={{ opacity: [0.85, 1, 0.9] }}
                          transition={{ duration: 3.1, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
                        />
                      </motion.svg>
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-purple-200/15" />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-purple-300/25" />
                      <div className="pointer-events-none absolute inset-y-6 left-0 w-24 bg-gradient-to-r from-[#110826] via-[#110826]/60 to-transparent" />
                      <div className="pointer-events-none absolute inset-y-6 right-0 w-24 bg-gradient-to-l from-[#110826] via-[#110826]/60 to-transparent" />
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                    <Play className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
                      Vidéo
                    </div>
                    <div className="mt-3 flex w-full overflow-hidden gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
                      {TIMELINE_SCENES.map((scene, index) => (
                        <motion.div
                          key={scene.title}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.12, duration: 0.45 }}
                          className="relative flex min-h-[120px] min-w-0 overflow-hidden rounded-2xl border border-white/10 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.6)]"
                          style={{ flex: `${scene.duration} 1 0%` }}
                        >
                          <img src={scene.thumbnail} alt={scene.title} className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-black/5 to-black/40" />
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-3 text-xs font-semibold text-white/85">
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-2 py-0.5 backdrop-blur-sm">
                              #{index + 1}
                              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                            </span>
                            <span className="text-[11px] uppercase tracking-wide text-white/75">{scene.end}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={resetDemo}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
              >
                <Clock3 className="h-3.5 w-3.5" />
                Revenir au brief
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LandingProcess;
