import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, RefreshCw, Loader2, Download } from "lucide-react";

interface TimelineScene {
  sceneNumber: number;
  title: string;
  imageUrl?: string;
  videoUrl?: string;
  prompt?: string;
  narration?: string;
  status: 'loading' | 'ready' | 'generating-video' | 'error';
}

interface VideoTimelineProps {
  scenes: TimelineScene[];
  onRegenerateImage: (sceneNumber: number) => void;
  onGenerateVideo: (sceneNumber: number) => void;
  isRegenerating?: boolean;
}

export const VideoTimeline = ({ 
  scenes, 
  onRegenerateImage, 
  onGenerateVideo,
  isRegenerating 
}: VideoTimelineProps) => {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Timeline du projet</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenes.map((scene) => (
          <Card key={scene.sceneNumber} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Scène {scene.sceneNumber}</span>
              <span className={`text-xs px-2 py-1 rounded ${
                scene.status === 'ready' ? 'bg-green-500/20 text-green-600' :
                scene.status === 'generating-video' ? 'bg-blue-500/20 text-blue-600' :
                scene.status === 'error' ? 'bg-red-500/20 text-red-600' :
                'bg-muted'
              }`}>
                {scene.status === 'ready' ? '✓ Prêt' :
                 scene.status === 'generating-video' ? 'Vidéo...' :
                 scene.status === 'error' ? 'Erreur' :
                 'Chargement...'}
              </span>
            </div>

            <h4 className="text-sm font-medium line-clamp-1">{scene.title}</h4>

            {/* Image ou Skeleton */}
            <div className="aspect-[9/16] bg-muted rounded-lg overflow-hidden relative">
              {scene.status === 'loading' ? (
                <Skeleton className="w-full h-full" />
              ) : scene.imageUrl ? (
                <>
                  <img 
                    src={scene.imageUrl} 
                    alt={scene.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {scene.videoUrl && (
                    <div className="absolute top-2 right-2 bg-primary/90 text-primary-foreground px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                      <Video className="h-3 w-3" />
                      Vidéo
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  Aucune image
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRegenerateImage(scene.sceneNumber)}
                disabled={isRegenerating || scene.status === 'loading'}
                className="flex-1"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Régénérer
              </Button>
              
              {scene.imageUrl && (
                <Button
                  variant={scene.videoUrl ? "secondary" : "default"}
                  size="sm"
                  onClick={() => onGenerateVideo(scene.sceneNumber)}
                  disabled={scene.status === 'generating-video'}
                  className="flex-1"
                >
                  {scene.status === 'generating-video' ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Génération...
                    </>
                  ) : scene.videoUrl ? (
                    <>
                      <Video className="h-3 w-3 mr-1" />
                      Refaire
                    </>
                  ) : (
                    <>
                      <Video className="h-3 w-3 mr-1" />
                      Vidéo
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Vidéo si disponible */}
            {scene.videoUrl && (
              <video 
                src={scene.videoUrl} 
                className="w-full aspect-[9/16] rounded-lg"
                controls
                loop
                muted
                playsInline
              />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};
