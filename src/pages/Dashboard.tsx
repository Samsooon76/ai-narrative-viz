import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Video, Clock } from "lucide-react";
import { Link } from "react-router-dom";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold mb-2">Mes Projets</h1>
              <p className="text-muted-foreground">Gérez vos vidéos créées avec l'IA</p>
            </div>
            <Link to="/create">
              <Button className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
                <Plus className="h-4 w-4 mr-2" />
                Nouveau projet
              </Button>
            </Link>
          </div>

          {/* Empty State */}
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

          {/* Recent Activity */}
          <div className="mt-12">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Activité récente
            </h2>
            <Card className="p-6 border-border/40 bg-card/60 backdrop-blur-sm">
              <p className="text-muted-foreground text-center py-8">
                Aucune activité récente
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
