import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wand2, Sparkles, Volume2, Image, Check, Edit2, Loader2, RefreshCw, ChevronRight, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Navigate, useNavigate } from "react-router-dom";
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
  const [currentStep, setCurrentStep] = useState<Step>('topic');
  
  // Step 1: Topic
  const [projectName, setProjectName] = useState("");
  const [topic, setTopic] = useState("");
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

  if (loading) {
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
        body: { topic, type: 'script' }
      });

      if (error) throw error;
      if (!data || !data.script) {
        throw new Error('Aucun script reçu');
      }

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

      // Sauvegarder le projet
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

  const generateImageForScene = async () => {
    if (!scriptData) return;
    
    const currentScene = scriptData.scenes[currentSceneIndex];
    setIsGeneratingImage(true);

    try {
      const prompt = `Create a cinematic 16:9 image for a video scene: ${currentScene.visual}. 
Style: cinematic, dramatic lighting, high quality, professional video production.`;

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          sceneTitle: currentScene.title 
        }
      });

      if (error) throw error;
      if (!data || !data.imageUrl) {
        throw new Error('Aucune image générée');
      }

      const newImage: GeneratedImage = {
        sceneNumber: currentScene.scene_number,
        imageUrl: data.imageUrl,
        prompt
      };

      setGeneratedImages(prev => [...prev, newImage]);
      
      toast({
        title: "Image générée !",
        description: "Vous pouvez la sélectionner ou en générer une autre"
      });
    } catch (error: any) {
      console.error('Erreur génération image:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de générer l'image",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const selectImage = (imageUrl: string) => {
    if (!scriptData) return;
    
    const currentScene = scriptData.scenes[currentSceneIndex];
    setSelectedImages(prev => ({
      ...prev,
      [currentScene.scene_number]: imageUrl
    }));

    toast({
      title: "Image sélectionnée !",
      description: `Image choisie pour la scène ${currentScene.scene_number}`
    });
  };

  const nextScene = () => {
    if (scriptData && currentSceneIndex < scriptData.scenes.length - 1) {
      setCurrentSceneIndex(currentSceneIndex + 1);
      setGeneratedImages([]);
    }
  };

  const previousScene = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(currentSceneIndex - 1);
      setGeneratedImages([]);
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
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Scene Info */}
              <Card className="p-6 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-2xl font-bold">
                        Scène {scriptData.scenes[currentSceneIndex].scene_number} / {scriptData.scenes.length}
                      </h3>
                      <span className="px-3 py-1 rounded-full text-sm font-semibold bg-primary/20">
                        {scriptData.scenes[currentSceneIndex].title}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <span className="font-semibold text-primary text-sm">VISUEL:</span>
                        <p className="text-muted-foreground mt-1">
                          {scriptData.scenes[currentSceneIndex].visual}
                        </p>
                      </div>
                      <div>
                        <span className="font-semibold text-accent text-sm">NARRATION:</span>
                        <p className="mt-1">{scriptData.scenes[currentSceneIndex].narration}</p>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
                    onClick={generateImageForScene}
                    disabled={isGeneratingImage}
                  >
                    {isGeneratingImage ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Génération en cours...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Générer une image
                      </>
                    )}
                  </Button>

                  {/* Navigation */}
                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={previousScene}
                      disabled={currentSceneIndex === 0}
                      className="flex-1"
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Scène précédente
                    </Button>
                    {currentSceneIndex === scriptData.scenes.length - 1 ? (
                      <Button
                        className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                        onClick={finishProject}
                        disabled={Object.keys(selectedImages).length !== scriptData.scenes.length}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Terminer
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={nextScene}
                        disabled={!selectedImages[scriptData.scenes[currentSceneIndex].scene_number]}
                        className="flex-1"
                      >
                        Scène suivante
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              {/* Generated Images */}
              <Card className="p-6 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
                <h3 className="text-xl font-bold mb-4">Images générées</h3>
                
                {generatedImages.length === 0 ? (
                  <div className="flex items-center justify-center h-64 border-2 border-dashed border-border/40 rounded-lg">
                    <div className="text-center space-y-2">
                      <Image className="h-12 w-12 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground">
                        Cliquez sur "Générer une image" pour commencer
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {generatedImages.map((img, idx) => (
                      <div key={idx} className="relative">
                        <img
                          src={img.imageUrl}
                          alt={`Génération ${idx + 1}`}
                          className="w-full rounded-lg border-2 border-border/40"
                        />
                        <Button
                          className="absolute bottom-4 right-4 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                          onClick={() => selectImage(img.imageUrl)}
                        >
                          {selectedImages[scriptData.scenes[currentSceneIndex].scene_number] === img.imageUrl ? (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Sélectionnée
                            </>
                          ) : (
                            'Sélectionner'
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateVideo;
