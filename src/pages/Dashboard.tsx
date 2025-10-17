import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Video, Clock, Archive, Trash2, RefreshCw } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/use-auth";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import PageShell from "@/components/layout/PageShell";

type VideoProjectRow = Database["public"]["Tables"]["video_projects"]["Row"];

type ProjectImage = {
  sceneNumber?: number;
  sceneTitle?: string;
  imageUrl?: string;
  videoUrl?: string;
  prompt?: string;
  narration?: string;
};

type VideoProjectStatus = Exclude<VideoProjectRow["status"], null>;

interface VideoProject {
  id: VideoProjectRow["id"];
  title: VideoProjectRow["title"];
  description: VideoProjectRow["description"];
  status: VideoProjectStatus;
  created_at: NonNullable<VideoProjectRow["created_at"]>;
  images_data: ProjectImage[];
}

const Dashboard = () => {
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const loadProjects = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const { data, error } = await supabase
        .from("video_projects")
        .select<Pick<VideoProjectRow, "id" | "title" | "description" | "status" | "created_at">>(
          "id, title, description, status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) throw error;

      const projectsData: VideoProject[] = (data ?? []).map((project) => ({
        ...project,
        created_at: project.created_at ?? new Date().toISOString(),
        status: (project.status ?? "draft") as VideoProjectStatus,
        images_data: [],
      }));

      setProjects(projectsData);
      localStorage.setItem("dashboard_projects", JSON.stringify(projectsData));
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Erreur chargement projets:", error);

      const cached = localStorage.getItem("dashboard_projects");
      if (!cached) {
        setProjects([]);
      }

      const errorMessage =
        error instanceof DOMException && error.name === "AbortError"
          ? "Timeout: la base de données met trop de temps à répondre"
          : error instanceof Error && error.message?.includes("timeout")
            ? "La connexion a pris trop de temps"
            : "Erreur de chargement";

      toast({
        title: "Mode dégradé",
        description: cached ? `Données en cache affichées. ${errorMessage}` : errorMessage,
        variant: cached ? "default" : "destructive",
      });
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadProjectsWithCache = useCallback(async () => {
    // Charger le cache immédiatement
    const cached = localStorage.getItem("dashboard_projects");
    if (cached) {
      try {
        const cachedProjects = JSON.parse(cached) as VideoProject[];
        setProjects(cachedProjects);
        setLoadingProjects(false);
      } catch (error) {
        console.error("Cache invalide", error);
      }
    }

    // Puis charger les données fraîches
    await loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (user) {
      void loadProjectsWithCache();
    } else {
      setLoadingProjects(false);
    }
  }, [user, loadProjectsWithCache]);

  const deleteProject = async (projectId: string) => {
    try {
      const { error } = await supabase.from("video_projects").delete().eq("id", projectId);

      if (error) throw error;

      setProjects(projects.filter(p => p.id !== projectId));
      toast({
        title: "Projet supprimé",
        description: "Le projet a été supprimé avec succès",
      });
    } catch (error) {
      console.error("Erreur suppression:", error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le projet",
        variant: "destructive",
      });
    }
  };

  if (!loading && !user) {
    return <Navigate to="/auth" replace />;
  }

  if (loading || loadingProjects) {
    return (
      <PageShell contentClassName="container px-4">
        <div className="space-y-6 pt-6">
          <Skeleton className="h-12 w-2/3" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-[420px]" />
        </div>
      </PageShell>
    );
  }

  const getStatusBadge = (status: VideoProjectStatus) => {
    const statusMap: Record<VideoProjectStatus, { label: string; variant: "secondary" | "outline" | "destructive"; className?: string }> = {
      draft: { label: "Brouillon", variant: "secondary" },
      generating: { label: "En cours", variant: "outline", className: "border-primary/40 text-primary" },
      completed: { label: "Terminé", variant: "outline", className: "border-accent/40 text-accent" },
      failed: { label: "Échoué", variant: "destructive" },
    };

    const config = statusMap[status] || statusMap.draft;
    return <Badge variant={config.variant} className={`text-xs ${config.className ?? ""}`}>{config.label}</Badge>;
  };

  return (
    <PageShell contentClassName="container px-4 pb-16">
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Tableau de bord</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Mes projets vidéo</h1>
            <p className="text-sm text-muted-foreground">
              {projects.length > 0
                ? `${projects.length} projet${projects.length > 1 ? "s" : ""} archivés dans le cloud`
                : "Créez un projet pour démarrer votre storyboard assisté"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLoadingProjects(true);
                loadProjects();
              }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </Button>
            <Link to="/create">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Nouveau projet
              </Button>
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border border-white/10 bg-black/25 p-5 backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-muted-foreground">Projets actifs</div>
              <Badge variant="secondary" className="border-none text-[10px] uppercase">
                Studio
              </Badge>
            </div>
            <p className="mt-4 text-3xl font-semibold text-foreground">{projects.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">incluant les brouillons en cours</p>
          </Card>
          <Card className="border border-white/10 bg-black/25 p-5 backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-muted-foreground">Terminés</div>
              <Video className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-4 text-3xl font-semibold text-foreground">
              {projects.filter((project) => project.status === "completed").length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Prêts pour l'export</p>
          </Card>
          <Card className="border border-white/10 bg-black/25 p-5 backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-muted-foreground">Dernière mise à jour</div>
              <Archive className="h-4 w-4 text-accent" />
            </div>
            <p className="mt-4 text-3xl font-semibold text-foreground">
              {projects[0] ? new Date(projects[0].created_at).toLocaleDateString("fr-FR") : "-"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Date du dernier projet ajouté</p>
          </Card>
        </section>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Vos projets</h2>
            <p className="text-xs text-muted-foreground">Sélectionnez un projet pour reprendre là où vous en étiez.</p>
          </div>

          {projects.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <Card key={project.id} className="group flex h-full flex-col border border-white/10 bg-black/25 p-5 backdrop-blur-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Video className="h-4 w-4" />
                    </div>
                    {getStatusBadge(project.status)}
                  </div>
                  <div className="mt-5 space-y-2">
                    <h3 className="line-clamp-2 text-lg font-semibold text-foreground">{project.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Créé le {new Date(project.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-6">
                    <Link to={`/create?project=${project.id}`} className="flex-1">
                      <Button variant="ghost" size="sm" className="w-full gap-2 text-xs">
                        <Video className="h-3.5 w-3.5" />
                        Ouvrir dans le studio
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteProject(project.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Supprimer le projet"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center gap-4 border border-white/10 bg-black/25 p-12 text-center backdrop-blur-lg">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary">
                <Video className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-foreground">Aucun projet pour l'instant</h3>
                <p className="text-sm text-muted-foreground">Créez votre premier storyboard avec l'aide de l'IA.</p>
              </div>
              <Link to="/create">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Créer mon premier projet
                </Button>
              </Link>
            </Card>
          )}
        </section>

        <section>
          <Card className="space-y-4 border border-white/10 bg-black/25 p-6 backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock className="h-4 w-4 text-primary" />
                Activité récente
              </div>
              <p className="text-xs text-muted-foreground">Les 5 derniers projets créés</p>
            </div>
            {projects.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {projects.slice(0, 5).map((project) => (
                  <li
                    key={project.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-4 py-3"
                  >
                    <span className="font-medium text-foreground">{project.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(project.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune activité à afficher pour le moment.</p>
            )}
          </Card>
        </section>
      </div>
    </PageShell>
  );
};

export default Dashboard;
