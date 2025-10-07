import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wand2, Volume2, Image, Check, Edit2, Loader2, RefreshCw, Download } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Step = 'topic' | 'script' | 'images' | 'complete';

interface ScriptScene {
  scene_number: number;
  title: string;
  visual: string;
  narration: string;
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
}

const CreateVideo = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState<Step>('topic');
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  
  // Step 1: Topic
  const [projectName, setProjectName] = useState("");
  const [topic, setTopic] = useState("");
  const [cinematicStyle, setCinematicStyle] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Step 2: Script
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  const [editedScriptJson, setEditedScriptJson] = useState("");
  const [isEditingScript, setIsEditingScript] = useState(false);
  
  // Step 3: Images
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImages, setSelectedImages] = useState<Record<number, string>>({});
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Load existing project if project ID is in URL
  useEffect(() => {
    const projectIdFromUrl = searchParams.get('project');
    if (projectIdFromUrl && user) {
      loadProject(projectIdFromUrl);
    }
  }, [searchParams, user]);

  const loadProject = async (id: string) => {
    setIsLoadingProject(true);
    try {
      const { data, error } = await supabase
        .from('video_projects')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Restore project data
      setProjectId(data.id);
      setProjectName(data.title);
      setTopic(data.prompt || "");
      
      if (data.script) {
        const parsedScript = typeof data.script === 'string' 
          ? JSON.parse(data.script) 
          : data.script;
        setScriptData(parsedScript);
        setEditedScriptJson(JSON.stringify(parsedScript, null, 2));
      }

      if (data.images_data) {
        const imagesData = typeof data.images_data === 'string'
          ? JSON.parse(data.images_data)
          : data.images_data;
        
        if (typeof imagesData === 'object' && !Array.isArray(imagesData)) {
          // Convert object to GeneratedImage array
          const imagesArray: GeneratedImage[] = Object.entries(imagesData).map(([sceneNumber, imageUrl]) => ({
            sceneNumber: parseInt(sceneNumber),
            imageUrl: imageUrl as string,
            prompt: ''
          }));
          setGeneratedImages(imagesArray);
          setSelectedImages(imagesData as Record<number, string>);
        }
      }

      // Determine which step to show
      if (data.status === 'completed' || data.images_data) {
        setCurrentStep('images');
      } else if (data.script) {
        setCurrentStep('script');
      } else {
        setCurrentStep('topic');
      }

      toast({
        title: "Projet chargé",
        description: `Projet "${data.title}" ouvert avec succès`
      });
    } catch (error: any) {
      console.error('Erreur chargement projet:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de charger le projet",
        variant: "destructive"
      });
    } finally {
      setIsLoadingProject(false);
    }
  };

  if (loading || isLoadingProject) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

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
        body: { topic, type: 'script', cinematicStyle }
      });

      console.log('Response data:', data);
      console.log('Response error:', error);

      if (error) throw error;
      if (!data || !data.script) {
        console.error('Data structure:', data);
        throw new Error('Aucun script reçu');
      }

      console.log('Script data:', data.script);
      console.log('Script scenes:', data.script.scenes);

      setScriptData(data.script);
      setEditedScriptJson(JSON.stringify(data.script, null, 2));
      setCurrentStep('script');
      
      toast({
        title: "Script généré !",
        description: "Vous pouvez maintenant le réviser avant de continuer"
      });
    } catch (error: any) {
      console.error('Erreur génération script:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de générer le script",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const approveScript = async () => {
    try {
      let finalScript = scriptData;
      
      if (isEditingScript) {
        finalScript = JSON.parse(editedScriptJson);
        setScriptData(finalScript);
      }

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
    } catch (error: any) {
      console.error('Erreur approbation script:', error);
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de l'approbation",
        variant: "destructive"
      });
    }
  };

  const generateAllImages = async () => {
    if (!scriptData) return;
    
    setIsGeneratingImage(true);
    const stylePrompt = cinematicStyle 
      ? `Dark cinematic atmosphere with desaturated teal-green tones, dramatic artificial lighting (yellow/red accents), strong contrasts, human silhouettes in backlight, imposing industrial or military architecture, atmospheric fog/mist, dystopian mysterious ambiance inspired by noir cinema and Simon Stålenhag style.`
      : `Cinematic, dramatic lighting, high quality, professional video production.`;

    const newImages: GeneratedImage[] = [];
    
    try {
      // Generate images sequentially to avoid rate limits
      for (const scene of scriptData.scenes) {
        const prompt = `Create a 9:16 vertical portrait image for: ${scene.visual}. Style: ${stylePrompt}`;
        
        try {
          const { data, error } = await supabase.functions.invoke('generate-image', {
            body: { 
              prompt,
              sceneTitle: scene.title 
            }
          });

          if (error) throw error;
          if (!data || !data.imageUrl) {
            throw new Error('Aucune image générée');
          }

          const newImage: GeneratedImage = {
            sceneNumber: scene.scene_number,
            imageUrl: data.imageUrl,
            prompt
          };
          
          newImages.push(newImage);
          
          // Update UI progressively as each image is generated
          setGeneratedImages([...newImages]);
          setSelectedImages(prev => ({
            ...prev,
            [scene.scene_number]: data.imageUrl
          }));

          toast({
            title: `Image ${newImages.length}/${scriptData.scenes.length} générée`,
            description: `Scène ${scene.scene_number}: ${scene.title}`
          });

          // Wait 2 seconds between each generation to avoid rate limits
          if (scene.scene_number < scriptData.scenes.length) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error: any) {
          console.error(`Erreur scène ${scene.scene_number}:`, error);
          toast({
            title: `Erreur scène ${scene.scene_number}`,
            description: error.message || "Impossible de générer cette image",
            variant: "destructive"
          });
        }
      }

      toast({
        title: "Génération terminée !",
        description: `${newImages.length}/${scriptData.scenes.length} images créées avec succès`
      });
    } catch (error: any) {
      console.error('Erreur génération images:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de générer les images",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const regenerateImage = async (sceneNumber: number) => {
    if (!scriptData) return;
    
    const scene = scriptData.scenes.find(s => s.scene_number === sceneNumber);
    if (!scene) return;

    setIsGeneratingImage(true);

    try {
      const stylePrompt = cinematicStyle 
        ? `Dark cinematic atmosphere with desaturated teal-green tones, dramatic artificial lighting (yellow/red accents), strong contrasts, human silhouettes in backlight, imposing industrial or military architecture, atmospheric fog/mist, dystopian mysterious ambiance inspired by noir cinema and Simon Stålenhag style.`
        : `Cinematic, dramatic lighting, high quality, professional video production.`;
      
      const prompt = `Create a 9:16 vertical portrait image for: ${scene.visual}. Style: ${stylePrompt}`;

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          sceneTitle: scene.title 
        }
      });

      if (error) throw error;
      if (!data || !data.imageUrl) {
        throw new Error('Aucune image générée');
      }

      const newImage: GeneratedImage = {
        sceneNumber: scene.scene_number,
        imageUrl: data.imageUrl,
        prompt
      };

      // Replace the image for this scene
      setGeneratedImages(prev => 
        prev.map(img => img.sceneNumber === sceneNumber ? newImage : img)
      );
      
      // Auto-select the new image
      setSelectedImages(prev => ({
        ...prev,
        [sceneNumber]: data.imageUrl
      }));
      
      toast({
        title: "Image régénérée !",
        description: `Nouvelle image pour la scène ${sceneNumber}`
      });
    } catch (error: any) {
      console.error('Erreur régénération image:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de régénérer l'image",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const downloadAllImages = async () => {
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

      // Convert base64 images to blob and add to zip
      for (const image of generatedImages) {
        const base64Data = image.imageUrl.split(',')[1];
        const blob = await fetch(image.imageUrl).then(r => r.blob());
        zip.file(`scene_${image.sceneNumber}.png`, blob);
      }

      // Generate zip file
      const content = await zip.generateAsync({ type: 'blob' });
      
      // Create download link
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName || 'video'}_images.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Téléchargement lancé !",
        description: "Toutes les images sont en cours de téléchargement"
      });
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      toast({
        title: "Erreur",
        description: "Impossible de télécharger les images",
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
            images_data: selectedImages,
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
      toast({
        title: "Erreur",
        description: "Impossible de finaliser le projet",
        variant: "destructive"
      });
    }
  };

  const renderScriptPreview = () => {
    if (!scriptData) return null;

    return (
      <div className="bg-background/50 p-6 rounded-lg border border-border/40 space-y-6">
        <div>
          <h3 className="text-2xl font-bold mb-2">{scriptData.title}</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            {scriptData.music}
          </p>
        </div>

        <div className="space-y-4">
          {scriptData.scenes.map((scene) => (
            <Card key={scene.scene_number} className="p-4 bg-background/30 border-border/40">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-primary/20">
                    Scène {scene.scene_number}
                  </span>
                  <h4 className="font-semibold">{scene.title}</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold text-primary">VISUEL:</span>
                    <p className="text-muted-foreground mt-1">{scene.visual}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-accent">NARRATION:</span>
                    <p className="mt-1">{scene.narration}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between max-w-2xl mx-auto">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  currentStep === 'topic' ? 'bg-primary' : 'bg-primary/20'
                }`}>
                  {currentStep !== 'topic' ? <Check className="h-5 w-5" /> : '1'}
                </div>
                <span className="text-xs mt-2">Sujet</span>
              </div>
              <div className={`flex-1 h-0.5 ${currentStep !== 'topic' ? 'bg-primary' : 'bg-border'}`} />
              <div className="flex flex-col items-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  currentStep === 'script' ? 'bg-primary' : currentStep === 'images' ? 'bg-primary/20' : 'bg-border'
                }`}>
                  {currentStep === 'images' ? <Check className="h-5 w-5" /> : '2'}
                </div>
                <span className="text-xs mt-2">Script</span>
              </div>
              <div className={`flex-1 h-0.5 ${currentStep === 'images' ? 'bg-primary' : 'bg-border'}`} />
              <div className="flex flex-col items-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  currentStep === 'images' ? 'bg-primary' : 'bg-border'
                }`}>
                  3
                </div>
                <span className="text-xs mt-2">Images</span>
              </div>
            </div>
          </div>

          {/* Step 1: Topic Input */}
          {currentStep === 'topic' && (
            <Card className="p-8 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold mb-2">Créer une vidéo</h2>
                  <p className="text-muted-foreground">Décrivez le sujet de votre vidéo intrigante</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-name">Nom du projet</Label>
                  <Input
                    id="project-name"
                    placeholder="Ex: L'histoire du Mur de Berlin"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="bg-background/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="topic">Sujet de la vidéo</Label>
                  <Textarea
                    id="topic"
                    placeholder="Ex: Raconte l'histoire intrigante du Mur de Berlin, comment il a divisé une ville et des familles pendant des décennies..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    rows={6}
                    className="bg-background/50 resize-none"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="cinematic-style"
                    checked={cinematicStyle}
                    onChange={(e) => setCinematicStyle(e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-background/50"
                  />
                  <Label htmlFor="cinematic-style" className="cursor-pointer">
                    Utiliser le style cinématique sombre (dystopique, contrastes forts, atmosphère mystérieuse)
                  </Label>
                </div>

                <Button 
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-lg h-14"
                  disabled={!projectName.trim() || !topic.trim() || isGenerating}
                  onClick={generateScript}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Génération du script...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-5 w-5 mr-2" />
                      Générer le script avec l'IA
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* Step 2: Script Review */}
          {currentStep === 'script' && (
            <Card className="p-8 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">Révision du script</h2>
                    <p className="text-muted-foreground">Modifiez le script si nécessaire</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditingScript(!isEditingScript)}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    {isEditingScript ? 'Voir le rendu' : 'Éditer JSON'}
                  </Button>
                </div>

                {isEditingScript ? (
                  <Textarea
                    value={editedScriptJson}
                    onChange={(e) => setEditedScriptJson(e.target.value)}
                    rows={20}
                    className="bg-background/50 font-mono text-sm"
                  />
                ) : (
                  renderScriptPreview()
                )}

                <div className="flex gap-4">
                  <Button 
                    variant="outline"
                    onClick={() => setCurrentStep('topic')}
                    className="flex-1"
                  >
                    Retour
                  </Button>
                  <Button 
                    className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                    onClick={approveScript}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approuver et continuer
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Step 3: Image Generation */}
          {currentStep === 'images' && scriptData && (
            <div className="space-y-6">
              {generatedImages.length === 0 ? (
                <Card className="p-8 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm text-center">
                  <Wand2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Générer toutes les images</h3>
                  <p className="text-muted-foreground mb-6">
                    Générez toutes les images d'un coup pour visualiser l'ensemble du projet
                  </p>
                  <div className="flex gap-4 justify-center">
                    <Button 
                      variant="outline"
                      onClick={() => setCurrentStep('script')}
                      size="lg"
                    >
                      Retour au script
                    </Button>
                    <Button 
                      onClick={generateAllImages}
                      disabled={isGeneratingImage}
                      size="lg"
                      className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
                    >
                      {isGeneratingImage ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Génération de {scriptData.scenes.length} images...
                        </>
                      ) : (
                        <>
                          <Wand2 className="mr-2 h-5 w-5" />
                          Générer toutes les images ({scriptData.scenes.length})
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              ) : (
                <>
                  <Card className="p-6 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-semibold">
                        Images générées ({generatedImages.length}/{scriptData.scenes.length})
                      </h3>
                      <Button
                        onClick={downloadAllImages}
                        variant="outline"
                        disabled={isGeneratingImage}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Télécharger tout (ZIP)
                      </Button>
                    </div>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {scriptData.scenes.map((scene) => {
                      const generatedImage = generatedImages.find(img => img.sceneNumber === scene.scene_number);
                      
                      return (
                        <Card key={scene.scene_number} className="p-4 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold">Scène {scene.scene_number}</h4>
                              <p className="text-xs text-muted-foreground">{scene.title}</p>
                            </div>
                            {generatedImage && (
                              <Button
                                onClick={() => regenerateImage(scene.scene_number)}
                                disabled={isGeneratingImage}
                                size="sm"
                                variant="outline"
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Refaire
                              </Button>
                            )}
                          </div>

                           {generatedImage ? (
                            <div className="relative group">
                              <img 
                                src={generatedImage.imageUrl} 
                                alt={`Scène ${scene.scene_number}`}
                                className="w-full aspect-[9/16] object-cover rounded-lg border-2 border-border/40"
                              />
                              <div className="absolute top-2 right-2 bg-primary text-primary-foreground px-2 py-1 rounded-md text-xs font-medium">
                                ✓ Générée
                              </div>
                            </div>
                          ) : (
                            <div className="w-full aspect-[9/16] bg-background/30 rounded-lg border-2 border-dashed border-border/40 flex items-center justify-center">
                              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                          )}

                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Visual:</p>
                            <p className="text-xs line-clamp-2">{scene.visual}</p>
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  <Card className="p-6 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
                    <div className="flex gap-4">
                      <Button variant="outline" onClick={() => setCurrentStep('script')} className="flex-1">
                        Retour au script
                      </Button>
                      <Button 
                        onClick={finishProject}
                        disabled={generatedImages.length !== scriptData.scenes.length || isGeneratingImage}
                        className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Terminer le projet
                      </Button>
                    </div>
                  </Card>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateVideo;
