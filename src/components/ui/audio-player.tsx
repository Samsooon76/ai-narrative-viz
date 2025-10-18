import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Download, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  className?: string;
  fileName?: string;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const AudioPlayer = ({ src, className, fileName }: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    if (showSpeedMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSpeedMenu]);

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || "audio.mp3";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erreur téléchargement audio:", error);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = percent * duration;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn("flex items-center gap-3 rounded-lg bg-gradient-to-r from-primary/10 to-accent/5 p-4 backdrop-blur", className)}>
      <audio ref={audioRef} src={src} crossOrigin="anonymous" />

      {/* Play Button */}
      <button
        onClick={togglePlay}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-md transition-all hover:shadow-lg hover:scale-105 active:scale-95"
      >
        {isPlaying ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="h-5 w-5 ml-0.5 fill-current" />
        )}
      </button>

      {/* Time Display */}
      <span className="min-w-12 text-xs font-semibold text-foreground/80">
        {formatTime(currentTime)}
      </span>

      {/* Progress Bar */}
      <div
        ref={progressRef}
        onClick={handleProgressClick}
        className="relative flex-1 h-1.5 bg-gradient-to-r from-primary/20 to-accent/20 rounded-full cursor-pointer group"
      >
        <div
          className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all"
          style={{ width: `${progressPercent}%` }}
        />
        {/* Hover thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progressPercent}%`, transform: "translate(-50%, -50%)" }}
        />
      </div>

      {/* Duration */}
      <span className="min-w-12 text-xs font-semibold text-foreground/80 text-right">
        {formatTime(duration)}
      </span>

      {/* Speed Control */}
      <div ref={speedMenuRef} className="relative">
        <button
          onClick={() => setShowSpeedMenu(!showSpeedMenu)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-foreground/70 hover:text-foreground hover:bg-primary/10 transition-colors"
        >
          {playbackSpeed}x
          <ChevronDown className={cn("h-3 w-3 transition-transform", showSpeedMenu && "rotate-180")} />
        </button>
        {showSpeedMenu && (
          <div className="absolute bottom-full right-0 mb-2 bg-background border border-primary/20 rounded-lg shadow-lg overflow-hidden z-50">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                onClick={() => {
                  setPlaybackSpeed(speed);
                  setShowSpeedMenu(false);
                }}
                className={cn(
                  "block w-full px-4 py-2 text-xs font-medium text-left transition-colors hover:bg-primary/10",
                  playbackSpeed === speed && "bg-primary/20 text-primary font-bold"
                )}
              >
                {speed}x
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="text-foreground/60 hover:text-foreground transition-colors"
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={isMuted ? 0 : volume}
          onChange={(e) => {
            setVolume(parseFloat(e.target.value));
            setIsMuted(false);
          }}
          className="w-16 h-1 bg-gradient-to-r from-primary/30 to-accent/20 rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-primary [&::-webkit-slider-thumb]:to-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-primary [&::-moz-range-thumb]:to-accent [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:border-0"
        />
      </div>

      {/* Download Button */}
      <button
        onClick={handleDownload}
        className="text-foreground/60 hover:text-foreground hover:bg-primary/10 p-1.5 rounded-md transition-colors"
        title="Télécharger l'audio"
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
};
