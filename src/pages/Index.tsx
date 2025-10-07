import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Wand2, Film, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const Index = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
        
        <div className="container mx-auto relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Propulsé par l'IA</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Créez des vidéos
              <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient">
                en quelques clics
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Générez automatiquement des scripts, des voix naturelles et des visuels époustouflants 
              grâce à l'intelligence artificielle.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              {user ? (
                <Link to="/create">
                  <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-lg px-8 h-14"
                  >
                    Créer une vidéo
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/auth">
                    <Button 
                      size="lg" 
                      className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-lg px-8 h-14"
                    >
                      Commencer gratuitement
                    </Button>
                  </Link>
                  <Link to="/auth">
                    <Button size="lg" variant="outline" className="text-lg px-8 h-14">
                      Se connecter
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Comment ça fonctionne</h2>
            <p className="text-muted-foreground text-lg">Trois étapes simples pour créer votre vidéo</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="p-8 relative overflow-hidden border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm hover:shadow-lg hover:shadow-primary/10 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                  <Wand2 className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-3">1. Générez le script</h3>
                <p className="text-muted-foreground">
                  ChatGPT crée un script captivant et des prompts visuels optimisés pour votre vidéo.
                </p>
              </div>
            </Card>

            <Card className="p-8 relative overflow-hidden border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm hover:shadow-lg hover:shadow-accent/10 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-3xl" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center mb-4">
                  <Sparkles className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-3">2. Créez les assets</h3>
                <p className="text-muted-foreground">
                  ElevenLabs synthétise la voix tandis que Midjourney génère des images époustouflantes.
                </p>
              </div>
            </Card>

            <Card className="p-8 relative overflow-hidden border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm hover:shadow-lg hover:shadow-primary/10 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                  <Film className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-3">3. Exportez la vidéo</h3>
                <p className="text-muted-foreground">
                  L'IA assemble automatiquement tous les éléments en une vidéo professionnelle.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <Card className="relative overflow-hidden border-border/40 bg-gradient-to-br from-primary/10 via-card to-accent/10 backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 opacity-50" />
            <div className="relative p-12 text-center space-y-6">
              <Zap className="h-16 w-16 mx-auto text-primary" />
              <h2 className="text-4xl font-bold">Prêt à créer votre première vidéo ?</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Rejoignez des milliers de créateurs qui utilisent déjà VideoAI pour produire du contenu exceptionnel.
              </p>
              <Link to={user ? "/create" : "/auth"}>
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-lg px-8 h-14"
                >
                  {user ? "Créer une vidéo" : "Commencer maintenant"}
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-12 px-4">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>© 2025 VideoAI. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
