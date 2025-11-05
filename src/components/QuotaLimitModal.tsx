import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuotaLimitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videosGenerated: number;
  videosQuota: number;
  planName: string;
  planDisplayName: string;
  currentPeriodEnd?: string | null;
}

export function QuotaLimitModal({
  open,
  onOpenChange,
  videosGenerated,
  videosQuota,
  planName,
  planDisplayName,
  currentPeriodEnd,
}: QuotaLimitModalProps) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate("/pricing");
  };

  const getNextPlan = () => {
    switch (planName) {
      case "free":
        return { name: "Starter", quota: 10, price: "69€" };
      case "starter":
        return { name: "Pro", quota: 25, price: "129€" };
      case "pro":
        return { name: "Business", quota: 50, price: "169€" };
      default:
        return null;
    }
  };

  const nextPlan = getNextPlan();
  const isMaxPlan = planName === "business";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            🚫 Quota mensuel atteint
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 pt-2">
            <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
              <div>
                <p className="text-sm font-medium text-foreground">Plan actuel</p>
                <Badge variant="outline" className="mt-1">
                  {planDisplayName}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">
                  {videosGenerated}/{videosQuota}
                </p>
                <p className="text-xs text-muted-foreground">vidéos générées</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {isMaxPlan ? (
                <>
                  Vous avez atteint la limite mensuelle de votre plan Business. Votre quota sera
                  réinitialisé lors du prochain cycle de facturation.
                </>
              ) : (
                <>
                  Vous avez utilisé toutes vos vidéos pour ce mois-ci. Upgradez votre plan pour
                  continuer à créer des vidéos dès maintenant.
                </>
              )}
            </p>

            {currentPeriodEnd && (
              <div className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-blue-900 dark:text-blue-100">
                  Réinitialisation le{" "}
                  <strong>{new Date(currentPeriodEnd).toLocaleDateString("fr-FR")}</strong>
                </span>
              </div>
            )}

            {nextPlan && !isMaxPlan && (
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-4 rounded-lg border border-primary/20">
                <p className="text-sm font-medium text-foreground mb-2">
                  Passez au plan {nextPlan.name}
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {nextPlan.quota} vidéos/mois
                    </p>
                    <p className="text-lg font-bold text-primary">{nextPlan.price}/mois</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Fermer</AlertDialogCancel>
          {!isMaxPlan && (
            <AlertDialogAction onClick={handleUpgrade}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Upgrader maintenant
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
