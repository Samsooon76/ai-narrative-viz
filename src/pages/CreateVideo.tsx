import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wand2, Sparkles, Volume2, Image } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Navigate } from "react-router-dom";

const CreateVideo = () => {
  const { user, loading } = useAuth();
  const [projectName, setProjectName] = useState("");
  const [prompt, setPrompt] = useState("");

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Créer une vidéo</h1>
            <p className="text-muted-foreground">Laissez l'IA transformer votre idée en vidéo</p>
          </div>

          {/* Main Form */}
          <Card className="p-8 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
            <div className="space-y-6">
              {/* Project Name */}
              <div className="space-y-2">
                <Label htmlFor="project-name">Nom du projet</Label>
                <Input
                  id="project-name"
                  placeholder="Ma superbe vidéo..."
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="bg-background/50"
                />
              </div>

              {/* Prompt */}
              <div className="space-y-2">
                <Label htmlFor="prompt">Décrivez votre vidéo</Label>
                <Textarea
                  id="prompt"
                  placeholder="Exemple: Une vidéo sur les bienfaits de la méditation, avec une ambiance zen et apaisante..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  className="bg-background/50 resize-none"
                />
                <p className="text-sm text-muted-foreground">
                  Plus vous êtes précis, meilleur sera le résultat
                </p>
              </div>

              {/* Action Button */}
              <Button 
                className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-lg h-14"
                disabled={!projectName || !prompt}
              >
                <Wand2 className="h-5 w-5 mr-2" />
                Générer le script avec l'IA
              </Button>
            </div>
          </Card>

          {/* Pipeline Preview */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <Card className="p-6 border-border/40 bg-card/40 backdrop-blur-sm text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="font-semibold mb-2">Script IA</h3>
              <p className="text-sm text-muted-foreground">
                ChatGPT génère le contenu et les prompts
              </p>
            </Card>

            <Card className="p-6 border-border/40 bg-card/40 backdrop-blur-sm text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center">
                <Volume2 className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="font-semibold mb-2">Voix naturelle</h3>
              <p className="text-sm text-muted-foreground">
                ElevenLabs crée la narration
              </p>
            </Card>

            <Card className="p-6 border-border/40 bg-card/40 backdrop-blur-sm text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Image className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="font-semibold mb-2">Visuels IA</h3>
              <p className="text-sm text-muted-foreground">
                Midjourney génère les images
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateVideo;
