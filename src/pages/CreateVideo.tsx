import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wand2, Volume2, Image, Check, Edit2, Loader2, RefreshCw, Download, Video } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { VideoTimeline } from "@/components/VideoTimeline";

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
  videoUrl?: string;
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
  const [visualStyle, setVisualStyle] = useState<string>("none");
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
  const [generatingVideoScenes, setGeneratingVideoScenes] = useState<Set<number>>(new Set());

  // Load existing project and restore step from localStorage
  useEffect(() => {
    const projectIdFromUrl = searchParams.get('project');
    if (projectIdFromUrl && user && !projectId) {
      // Ne charger qu'une seule fois
      loadProject(projectIdFromUrl);
    }
  }, [searchParams, user]);

  // Restore step from localStorage when projectId is set
  useEffect(() => {
    if (projectId) {
      const savedStep = localStorage.getItem(`project_${projectId}_step`);
      if (savedStep && ['topic', 'script', 'images', 'complete'].includes(savedStep)) {
        setCurrentStep(savedStep as Step);
      }
    }
  }, [projectId]);

  // Save current step to localStorage whenever it changes
  useEffect(() => {
    if (projectId) {
      localStorage.setItem(`project_${projectId}_step`, currentStep);
    }
  }, [currentStep, projectId]);

  const loadProject = async (id: string) => {
    setIsLoadingProject(true);
    try {
      // Charger d'abord les métadonnées sans les images
      const { data, error } = await supabase
        .from('video_projects')
        .select('id, title, prompt, script, status, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Restore project data rapide
      setProjectId(data.id);
      setProjectName(data.title);
      setTopic(data.prompt || "");
      
      if (data.script) {
        const parsedScript = typeof data.script === 'string' 
          ? JSON.parse(data.script) 
          : data.script;
        setScriptData(parsedScript);
        setEditedScriptJson(JSON.stringify(parsedScript, null, 2));
        setCurrentStep('script');
      }

      // Fin du chargement rapide
      setIsLoadingProject(false);

      toast({
        title: "Projet chargé",
        description: `Projet "${data.title}" ouvert avec succès`
      });

      // Charger les images en arrière-plan après
      loadProjectImages(id);

    } catch (error: any) {
      console.error('Erreur chargement projet:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de charger le projet",
        variant: "destructive"
      });
      setIsLoadingProject(false);
    }
  };

  const loadProjectImages = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('video_projects')
        .select('images_data')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data?.images_data) {
        const imagesData = typeof data.images_data === 'string'
          ? JSON.parse(data.images_data)
          : data.images_data;
        
        // Handle both object and array formats
        if (Array.isArray(imagesData) && imagesData.length > 0) {
          setGeneratedImages(imagesData);
          // Create selectedImages from array
          const selected: Record<number, string> = {};
          imagesData.forEach((img: GeneratedImage) => {
            selected[img.sceneNumber] = img.imageUrl;
          });
          setSelectedImages(selected);
          setCurrentStep('images');
        } else if (typeof imagesData === 'object' && imagesData !== null && Object.keys(imagesData).length > 0) {
          // Convert object to GeneratedImage array
          const imagesArray: GeneratedImage[] = Object.entries(imagesData).map(([sceneNumber, imageUrl]) => ({
            sceneNumber: parseInt(sceneNumber),
            imageUrl: imageUrl as string,
            prompt: ''
          }));
          setGeneratedImages(imagesArray);
          setSelectedImages(imagesData as Record<number, string>);
          setCurrentStep('images');
        }
      }
    } catch (error) {
      console.error('Erreur chargement images:', error);
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
        body: { topic, type: 'script', visualStyle }
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
    if (!scriptData || !projectId) return;
    
    setIsGeneratingImage(true);
    
    const styleMap: Record<string, string> = {
      'desaturated-toon': 'desaturated 2D toon style, long shadows, subtle mist, poetic pacing --niji 6 --ar 16:9',
      'digital-noir': 'sharp-angled neo-minimalist cartoon style, flat shading, hard-edged shadows, geometric features, dark cinematic lighting, monochrome green palette --v 7',
      'bold-graphic': 'bold graphic minimalism, sharp-edged shadows, red-black color scheme, stylized comic atmosphere --v 7 --style raw --ar 16:9',
      'muted-adventure': 'muted desaturated animation style, limited palette, poetic vibe, wide landscape composition --v 7 --ar 16:9',
      'whimsical-cartoon': 'cracked-egg whimsical cartoon style, weird shapes, joyful chaos --niji 6 --ar 16:9',
      'late-night-action': 'late-night toonline action style, backlight silhouette, minimal dialogue energy --v 7 --ar 16:9'
    };

    const stylePrompt = visualStyle && visualStyle !== 'none'
      ? styleMap[visualStyle] || 'Cinematic, dramatic lighting, high quality, professional video production.'
      : 'Cinematic, dramatic lighting, high quality, professional video production.';

    const allGeneratedImages: GeneratedImage[] = [];

    try {
      // Generate all images in parallel
      const imagePromises = scriptData.scenes.map(async (scene) => {
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

          const newImage = {
            sceneNumber: scene.scene_number,
            imageUrl: data.imageUrl,
            prompt,
            success: true
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
          setSelectedImages(prev => ({
            ...prev,
            [scene.scene_number]: data.imageUrl
          }));

          toast({
            title: `Image ${allGeneratedImages.length}/${scriptData.scenes.length}`,
            description: `Scène: ${scene.title}`
          });

          return newImage;
        } catch (error: any) {
          console.error(`Erreur scène ${scene.scene_number}:`, error);
          toast({
            title: `Erreur scène ${scene.scene_number}`,
            description: error.message || "Impossible de générer cette image",
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
    if (!scriptData || !projectId) return;
    
    const scene = scriptData.scenes.find(s => s.scene_number === sceneNumber);
    if (!scene) return;

    setIsGeneratingImage(true);

    try {
      const styleMap: Record<string, string> = {
        'desaturated-toon': 'desaturated 2D toon style, long shadows, subtle mist, poetic pacing --niji 6 --ar 16:9',
        'digital-noir': 'sharp-angled neo-minimalist cartoon style, flat shading, hard-edged shadows, geometric features, dark cinematic lighting, monochrome green palette --v 7',
        'bold-graphic': 'bold graphic minimalism, sharp-edged shadows, red-black color scheme, stylized comic atmosphere --v 7 --style raw --ar 16:9',
        'muted-adventure': 'muted desaturated animation style, limited palette, poetic vibe, wide landscape composition --v 7 --ar 16:9',
        'whimsical-cartoon': 'cracked-egg whimsical cartoon style, weird shapes, joyful chaos --niji 6 --ar 16:9',
        'late-night-action': 'late-night toonline action style, backlight silhouette, minimal dialogue energy --v 7 --ar 16:9'
      };

      const stylePrompt = visualStyle && visualStyle !== 'none'
        ? styleMap[visualStyle] || 'Cinematic, dramatic lighting, high quality, professional video production.'
        : 'Cinematic, dramatic lighting, high quality, professional video production.';
      
      const prompt = `Create a 9:16 vertical portrait image for: ${scene.visual}. Style: ${stylePrompt}`;

      console.log(`Régénération de la scène ${sceneNumber}...`);

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          sceneTitle: scene.title 
        }
      });

      console.log('Réponse de generate-image:', { data, error });

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
        prompt
      };

      // Update local state
      const updatedImages = generatedImages.some(img => img.sceneNumber === sceneNumber)
        ? generatedImages.map(img => img.sceneNumber === sceneNumber ? newImage : img)
        : [...generatedImages, newImage];

      setGeneratedImages(updatedImages);
      setSelectedImages(prev => ({
        ...prev,
        [sceneNumber]: data.imageUrl
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

    setGeneratingVideoScenes(prev => new Set(prev).add(sceneNumber));

    try {
      console.log(`Génération vidéo pour scène ${sceneNumber}...`);

      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: {
          imageUrl: generatedImage.imageUrl,
          prompt: scene.narration,
          sceneTitle: scene.title,
          projectId: projectId,
          sceneNumber: sceneNumber,
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Génération démarrée",
        description: "La vidéo sera prête dans 1-2 minutes. Actualisez la page pour voir le résultat.",
      });

      // Polling pour vérifier si la vidéo est prête
      const pollInterval = setInterval(async () => {
        const { data: project } = await supabase
          .from('video_projects')
          .select('images_data')
          .eq('id', projectId)
          .single();

        if (project?.images_data) {
          const imagesData = typeof project.images_data === 'string'
            ? JSON.parse(project.images_data)
            : project.images_data;

          const updatedImage = Array.isArray(imagesData)
            ? imagesData.find((img: any) => img.sceneNumber === sceneNumber)
            : null;

          if (updatedImage?.videoUrl) {
            clearInterval(pollInterval);
            
            // Update local state
            setGeneratedImages(prev => 
              prev.map(img => 
                img.sceneNumber === sceneNumber 
                  ? { ...img, videoUrl: updatedImage.videoUrl }
                  : img
              )
            );

            setGeneratingVideoScenes(prev => {
              const newSet = new Set(prev);
              newSet.delete(sceneNumber);
              return newSet;
            });

            toast({
              title: "Vidéo générée !",
              description: `La vidéo pour la scène ${sceneNumber} est prête`,
            });
          }
        }
      }, 10000); // Vérifier toutes les 10 secondes

      // Arrêter le polling après 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setGeneratingVideoScenes(prev => {
          const newSet = new Set(prev);
          newSet.delete(sceneNumber);
          return newSet;
        });
      }, 300000);

      console.log(`Génération démarrée pour scène ${sceneNumber}`);

    } catch (error: any) {
      console.error('Erreur génération vidéo:', error);
      toast({
        title: "Erreur de génération",
        description: error.message || "Impossible de générer la vidéo",
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

      // Download images from URLs and add to zip
      for (const image of generatedImages) {
        const response = await fetch(image.imageUrl);
        const blob = await response.blob();
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

                <div className="space-y-2">
                  <Label htmlFor="visual-style">Style visuel</Label>
                  <select
                    id="visual-style"
                    value={visualStyle}
                    onChange={(e) => setVisualStyle(e.target.value)}
                    className="w-full px-3 py-2 border border-border bg-background/50 rounded-md text-foreground"
                  >
                    <option value="none">Aucun style spécifique</option>
                    <option value="desaturated-toon">🎨 Desaturated Atmospheric Toon (Niji 6) - Ambiance sérieuse, plat mais cinématique</option>
                    <option value="digital-noir">🌃 Digital Noir Angular Realism (v7) - Néo-minimaliste, éclairage dramatique</option>
                    <option value="bold-graphic">⚡ Bold Graphic Minimalism (v7) - Silhouettes fortes, tons plats, tension</option>
                    <option value="muted-adventure">🏔️ Muted Desaturated Adventure (v7) - Calme, cadrage large, storytelling par silhouettes</option>
                    <option value="whimsical-cartoon">🎪 Cracked-Egg Whimsical Cartoon (Niji 6) - Proportions bizarres, énergie joyeuse</option>
                    <option value="late-night-action">🌙 Late-Night Toonline Action (v7) - Ton sérieux, animation précise, ambiance lourde</option>
                  </select>
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

                  <VideoTimeline
                    scenes={scriptData.scenes.map((scene) => {
                      const generatedImage = generatedImages.find(img => img.sceneNumber === scene.scene_number);
                      const isGenerating = generatingVideoScenes.has(scene.scene_number);
                      
                      return {
                        sceneNumber: scene.scene_number,
                        title: scene.title,
                        imageUrl: generatedImage?.imageUrl,
                        videoUrl: generatedImage?.videoUrl,
                        prompt: generatedImage?.prompt,
                        narration: scene.narration,
                        status: isGenerating 
                          ? 'generating-video' 
                          : generatedImage 
                            ? 'ready' 
                            : 'loading'
                      };
                    })}
                    onRegenerateImage={regenerateImage}
                    onGenerateVideo={generateVideo}
                    isRegenerating={isGeneratingImage}
                  />

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
