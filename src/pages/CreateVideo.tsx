import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wand2, Sparkles, Volume2, Image, Check, Edit2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Step = 'topic' | 'script' | 'prompts' | 'complete';

interface ImagePrompt {
  scene_number: number;
  scene_title: string;
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
  const [generatedScript, setGeneratedScript] = useState("");
  const [editedScript, setEditedScript] = useState("");
  const [isEditingScript, setIsEditingScript] = useState(false);
  
  // Step 3: Prompts
  const [imagePrompts, setImagePrompts] = useState<ImagePrompt[]>([]);
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

    console.log('Début génération script...');
    console.log('Topic:', topic);
    console.log('Project name:', projectName);

    setIsGenerating(true);
    try {
      console.log('Appel de l\'edge function generate-script...');
      
      const { data, error } = await supabase.functions.invoke('generate-script', {
        body: { topic, type: 'script' }
      });

      console.log('Réponse reçue:', { data, error });

      if (error) {
        console.error('Erreur de la fonction:', error);
        throw error;
      }

      if (!data || !data.content) {
        throw new Error('Aucun contenu reçu de l\'IA');
      }

      setGeneratedScript(data.content);
      setEditedScript(data.content);
      setCurrentStep('script');
      
      toast({
        title: "Script généré !",
        description: "Vous pouvez maintenant le réviser avant de continuer"
      });
    } catch (error: any) {
      console.error('Erreur complète génération script:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de générer le script",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
      console.log('Fin de la génération');
    }
  };

  const approveScript = async () => {
    setIsGenerating(true);
    try {
      // Sauvegarder le projet dans la DB
      const { data: project, error: dbError } = await supabase
        .from('video_projects')
        .insert({
          user_id: user.id,
          title: projectName,
          prompt: topic,
          script: editedScript,
          status: 'generating'
        })
        .select()
        .single();

      if (dbError) throw dbError;
      
      setProjectId(project.id);

      // Générer les prompts d'images
      const { data, error } = await supabase.functions.invoke('generate-script', {
        body: { 
          topic, 
          script: editedScript,
          type: 'prompts' 
        }
      });

      if (error) throw error;

      setImagePrompts(data.prompts || []);
      
      // Mettre à jour le projet avec les prompts
      await supabase
        .from('video_projects')
        .update({ 
          images_data: data.prompts,
          status: 'completed'
        })
        .eq('id', project.id);

      setCurrentStep('prompts');
      
      toast({
        title: "Prompts générés !",
        description: `${data.prompts?.length || 0} prompts créés pour votre moodboard`
      });
    } catch (error: any) {
      console.error('Erreur approbation script:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de générer les prompts",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const finishProject = () => {
    toast({
      title: "Projet créé !",
      description: "Vous pouvez maintenant utiliser ces prompts dans Midjourney"
    });
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-4xl">
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
                  currentStep === 'script' ? 'bg-primary' : currentStep === 'prompts' || currentStep === 'complete' ? 'bg-primary/20' : 'bg-border'
                }`}>
                  {currentStep === 'prompts' || currentStep === 'complete' ? <Check className="h-5 w-5" /> : '2'}
                </div>
                <span className="text-xs mt-2">Script</span>
              </div>
              <div className={`flex-1 h-0.5 ${currentStep === 'prompts' || currentStep === 'complete' ? 'bg-primary' : 'bg-border'}`} />
              <div className="flex flex-col items-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  currentStep === 'prompts' || currentStep === 'complete' ? 'bg-primary' : 'bg-border'
                }`}>
                  3
                </div>
                <span className="text-xs mt-2">Prompts</span>
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
                    placeholder="Ex: L'histoire mystérieuse du triangle des Bermudes"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="bg-background/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="topic">Sujet de la vidéo</Label>
                  <Textarea
                    id="topic"
                    placeholder="Ex: Raconte l'histoire intrigante d'un mystère non résolu qui fascine le monde entier. Inclus des détails surprenants et une théorie captivante."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    rows={6}
                    className="bg-background/50 resize-none"
                  />
                  <p className="text-sm text-muted-foreground">
                    Plus vous êtes précis, meilleur sera le résultat
                  </p>
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
                    <p className="text-muted-foreground">Modifiez le script si nécessaire avant de continuer</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditingScript(!isEditingScript)}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    {isEditingScript ? 'Voir le rendu' : 'Éditer'}
                  </Button>
                </div>

                {isEditingScript ? (
                  <Textarea
                    value={editedScript}
                    onChange={(e) => setEditedScript(e.target.value)}
                    rows={20}
                    className="bg-background/50 font-mono text-sm"
                  />
                ) : (
                  <div className="bg-background/50 p-6 rounded-lg border border-border/40 whitespace-pre-wrap">
                    {editedScript}
                  </div>
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
                    disabled={!editedScript.trim() || isGenerating}
                    onClick={approveScript}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Génération des prompts...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Approuver et générer les prompts
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Step 3: Image Prompts */}
          {currentStep === 'prompts' && (
            <Card className="p-8 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold mb-2">Prompts Midjourney</h2>
                  <p className="text-muted-foreground">
                    {imagePrompts.length} prompts générés pour créer votre moodboard
                  </p>
                </div>

                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {imagePrompts.map((promptData, index) => (
                    <Card key={index} className="p-4 bg-background/30 border-border/40">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-primary/20">
                            Scène {promptData.scene_number}
                          </span>
                          <h3 className="font-semibold">{promptData.scene_title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground font-mono bg-background/50 p-3 rounded">
                          {promptData.prompt}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(promptData.prompt);
                            toast({
                              title: "Copié !",
                              description: "Prompt copié dans le presse-papiers"
                            });
                          }}
                        >
                          Copier le prompt
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>

                <Button 
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 h-12"
                  onClick={finishProject}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Terminer le projet
                </Button>
              </div>
            </Card>
          )}

          {/* Pipeline Preview */}
          {currentStep === 'topic' && (
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <Card className="p-6 border-border/40 bg-card/40 backdrop-blur-sm text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold mb-2">1. Script IA</h3>
                <p className="text-sm text-muted-foreground">
                  GPT génère un script captivant et structuré
                </p>
              </Card>

              <Card className="p-6 border-border/40 bg-card/40 backdrop-blur-sm text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center">
                  <Edit2 className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold mb-2">2. Révision</h3>
                <p className="text-sm text-muted-foreground">
                  Vous validez et modifiez le script
                </p>
              </Card>

              <Card className="p-6 border-border/40 bg-card/40 backdrop-blur-sm text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Image className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold mb-3">3. Prompts visuels</h3>
                <p className="text-sm text-muted-foreground">
                  GPT crée 10-20 prompts Midjourney
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateVideo;
