import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

interface AnimationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageIndex: number;
  imageUrl: string;
  onAnimate: (params: {
    mode: 'auto' | 'advanced';
    motionPrompt?: string;
    durationTargetSec: number;
    loop: boolean;
  }) => Promise<void>;
}

export function AnimationModal({ 
  open, 
  onOpenChange, 
  imageIndex, 
  imageUrl, 
  onAnimate 
}: AnimationModalProps) {
  const [mode, setMode] = useState<'auto' | 'advanced'>('auto');
  const [motionPrompt, setMotionPrompt] = useState('');
  const [durationTargetSec, setDurationTargetSec] = useState(5);
  const [loop, setLoop] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAnimate = async () => {
    setIsLoading(true);
    try {
      await onAnimate({
        mode,
        motionPrompt: mode === 'advanced' ? motionPrompt : undefined,
        durationTargetSec,
        loop
      });
      onOpenChange(false);
      // Reset form
      setMode('auto');
      setMotionPrompt('');
      setDurationTargetSec(5);
      setLoop(false);
    } catch (error) {
      console.error('Erreur lors de l\'animation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Animer l'image #{imageIndex + 1}</DialogTitle>
          <DialogDescription>
            Choisissez les paramètres d'animation pour cette image
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Image preview */}
          <div className="rounded-lg overflow-hidden border">
            <img 
              src={imageUrl} 
              alt={`Image ${imageIndex + 1}`}
              className="w-full h-auto"
            />
          </div>

          {/* Mode selection */}
          <div className="space-y-3">
            <Label>Mode d'animation</Label>
            <RadioGroup value={mode} onValueChange={(value) => setMode(value as 'auto' | 'advanced')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="auto" id="auto" />
                <Label htmlFor="auto" className="font-normal cursor-pointer">
                  Automatique (animation standard)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="advanced" id="advanced" />
                <Label htmlFor="advanced" className="font-normal cursor-pointer">
                  Avancé (personnaliser le mouvement)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Advanced options */}
          {mode === 'advanced' && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="motionPrompt">Prompt de mouvement</Label>
                <Input
                  id="motionPrompt"
                  value={motionPrompt}
                  onChange={(e) => setMotionPrompt(e.target.value)}
                  placeholder="Ex: subtle head turn, slow parallax, light flicker..."
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Décrivez le type de mouvement souhaité pour l'animation
                </p>
              </div>
            </div>
          )}

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="duration">Durée cible (secondes)</Label>
            <Input
              id="duration"
              type="number"
              min={1}
              max={30}
              value={durationTargetSec}
              onChange={(e) => setDurationTargetSec(parseInt(e.target.value) || 5)}
              className="w-full"
            />
          </div>

          {/* Loop option */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="loop">Animation en boucle</Label>
              <p className="text-xs text-muted-foreground">
                L'animation se répètera de manière fluide
              </p>
            </div>
            <Switch
              id="loop"
              checked={loop}
              onCheckedChange={setLoop}
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button
              onClick={handleAnimate}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Création...' : 'Animer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
