import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Video, Clock, FileText, Trash2 } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface VideoProject {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  images_data: any;
}

const Dashboard = () => {
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    if (user) {
      loadProjects();
    }
  }, [user]);

  const loadProjects = async () => {
    try {
      // Ne sélectionner que les colonnes essentielles, SANS images_data
      const { data, error } = await supabase
        .from('video_projects')
        .select('id, title, description, status, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Ajouter un compteur vide pour l'affichage
      const projectsData = (data || []).map(project => ({
        ...project,
        images_data: [] // Ne pas charger les images
      }));
      
      setProjects(projectsData);
    } catch (error) {
      console.error('Erreur chargement projets:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les projets",
        variant: "destructive"
      });
    } finally {
      setLoadingProjects(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      const { error } = await supabase
        .from('video_projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;

      setProjects(projects.filter(p => p.id !== projectId));
      toast({
        title: "Projet supprimé",
        description: "Le projet a été supprimé avec succès"
      });
    } catch (error) {
      console.error('Erreur suppression:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le projet",
        variant: "destructive"
      });
    }
  };

  if (loading || loadingProjects) {
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

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      draft: { label: 'Brouillon', className: 'bg-muted' },
      generating: { label: 'En cours', className: 'bg-primary/20' },
      completed: { label: 'Terminé', className: 'bg-accent/20' },
      failed: { label: 'Échoué', className: 'bg-destructive/20' }
    };

    const config = statusMap[status] || statusMap.draft;
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${config.className}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold mb-2">Mes Projets</h1>
              <p className="text-muted-foreground">
                {projects.length > 0 
                  ? `${projects.length} projet${projects.length > 1 ? 's' : ''}`
                  : 'Aucun projet pour le moment'}
              </p>
            </div>
            <Link to="/create">
              <Button className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
                <Plus className="h-4 w-4 mr-2" />
                Nouveau projet
              </Button>
            </Link>
          </div>

          {/* Projects Grid */}
          {projects.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <Card 
                  key={project.id}
                  className="p-6 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm hover:shadow-lg hover:shadow-primary/10 transition-all"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <Video className="h-6 w-6 text-primary-foreground" />
                      </div>
                      {getStatusBadge(project.status)}
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold mb-2 line-clamp-2">
                        {project.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Créé le {new Date(project.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>


                    <div className="flex gap-2 pt-2">
                      <Link to={`/create?project=${project.id}`} className="flex-1">
                        <Button variant="outline" className="w-full" size="sm">
                          Voir détails
                        </Button>
                      </Link>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteProject(project.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            /* Empty State */
            <Card className="p-12 text-center border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
              <div className="max-w-md mx-auto space-y-6">
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <Video className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold mb-2">Aucun projet pour le moment</h3>
                  <p className="text-muted-foreground">
                    Commencez par créer votre première vidéo avec l'IA
                  </p>
                </div>
                <Link to="/create">
                  <Button className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
                    <Plus className="h-4 w-4 mr-2" />
                    Créer ma première vidéo
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {/* Recent Activity */}
          <div className="mt-12">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Activité récente
            </h2>
            <Card className="p-6 border-border/40 bg-card/60 backdrop-blur-sm">
              {projects.length > 0 ? (
                <div className="space-y-4">
                  {projects.slice(0, 5).map((project) => (
                    <div 
                      key={project.id}
                      className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="font-medium">{project.title}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(project.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Aucune activité récente
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
