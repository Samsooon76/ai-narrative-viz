import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSubscription } from "@/hooks/use-subscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Crown, TrendingUp, AlertCircle, Settings } from "lucide-react";
import { Link } from "react-router-dom";

export function SubscriptionStatus() {
  const {
    subscription,
    isLoading,
    quotaPercentage,
    isNearLimit,
    isAtLimit,
    hasActiveSubscription,
    isSubscriptionWarning,
    remainingVideos,
  } = useSubscription();

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-portal", {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error opening Stripe portal:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible d'ouvrir le portail de gestion. Veuillez réessayer.",
      });
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Abonnement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-8 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return null;
  }

  const getPlanBadgeVariant = () => {
    if (subscription.planName === "business") return "default";
    if (subscription.planName === "pro") return "secondary";
    if (subscription.planName === "starter") return "outline";
    return "destructive";
  };

  const getQuotaColor = () => {
    if (isAtLimit) return "bg-red-500";
    if (isNearLimit) return "bg-orange-500";
    return "bg-green-500";
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <CardTitle>Abonnement</CardTitle>
          </div>
          <Badge variant={getPlanBadgeVariant()} className="text-sm">
            {subscription.planDisplayName}
          </Badge>
        </div>
        <CardDescription>
          {isSubscriptionWarning && (
            <span className="flex items-center gap-1 text-orange-600">
              <AlertCircle className="h-4 w-4" />
              {subscription.cancelAtPeriodEnd
                ? "Votre abonnement sera annulé à la fin de la période"
                : "Problème de paiement détecté"}
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quota Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Vidéos générées</span>
            <span className="text-muted-foreground">
              {subscription.videosGenerated} / {subscription.videosQuota}
            </span>
          </div>

          <Progress value={quotaPercentage} className="h-2" indicatorClassName={getQuotaColor()} />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {isAtLimit ? (
                <span className="text-red-600 font-medium">Quota atteint</span>
              ) : isNearLimit ? (
                <span className="text-orange-600 font-medium">Proche de la limite</span>
              ) : (
                <span>
                  {remainingVideos} vidéo{remainingVideos > 1 ? "s" : ""} restante{remainingVideos > 1 ? "s" : ""}
                </span>
              )}
            </span>
            <span>{quotaPercentage}%</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          {!hasActiveSubscription && (
            <Button asChild className="w-full" size="sm">
              <Link to="/pricing">
                <TrendingUp className="h-4 w-4 mr-2" />
                Upgrader mon plan
              </Link>
            </Button>
          )}

          {hasActiveSubscription && (isAtLimit || isNearLimit) && (
            <Button asChild variant="default" className="w-full" size="sm">
              <Link to="/pricing">
                <TrendingUp className="h-4 w-4 mr-2" />
                Augmenter mon quota
              </Link>
            </Button>
          )}

          {hasActiveSubscription && (
            <Button
              onClick={handleManageSubscription}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <Settings className="h-4 w-4 mr-2" />
              Gérer mon abonnement
            </Button>
          )}
        </div>

        {/* Period Info */}
        {subscription.currentPeriodEnd && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            {subscription.cancelAtPeriodEnd ? (
              <span>Actif jusqu'au {new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}</span>
            ) : (
              <span>Renouvellement le {new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
