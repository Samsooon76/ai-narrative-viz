import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "@/hooks/use-toast";
import PageShell from "@/components/layout/PageShell";
import { Check, Loader2, ArrowLeft, CreditCard } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly: number;
  stripe_price_id: string | null;
  video_quota: number;
  features: string[];
}

export default function Checkout() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingCheckout, setProcessingCheckout] = useState(false);

  useEffect(() => {
    // Check for success/cancel query params
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");

    if (success === "true") {
      toast({
        title: "Paiement réussi !",
        description: "Votre abonnement a été activé avec succès.",
      });
      navigate("/dashboard");
      return;
    }

    if (canceled === "true") {
      toast({
        variant: "destructive",
        title: "Paiement annulé",
        description: "Vous avez annulé le processus de paiement.",
      });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    if (planId && user) {
      loadPlan();
    }
  }, [planId, user, authLoading, navigate]);

  const loadPlan = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .or(`id.eq.${planId},name.eq.${planId}`)
        .single();

      if (error) throw error;

      if (!data) {
        toast({
          variant: "destructive",
          title: "Plan introuvable",
          description: "Le plan sélectionné n'existe pas.",
        });
        navigate("/pricing");
        return;
      }

      // Don't allow checkout for free plan
      if (data.name === "free") {
        toast({
          variant: "destructive",
          title: "Plan gratuit",
          description: "Le plan gratuit ne nécessite pas de paiement.",
        });
        navigate("/pricing");
        return;
      }

      setPlan(data);
    } catch (error) {
      console.error("Error loading plan:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les détails du plan.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!plan || !plan.stripe_price_id || !user) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Informations de paiement manquantes.",
      });
      return;
    }

    setProcessingCheckout(true);

    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: {
          priceId: plan.stripe_price_id,
          planId: plan.id,
        },
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de créer la session de paiement. Veuillez réessayer.",
      });
      setProcessingCheckout(false);
    }
  };

  if (authLoading || loading) {
    return (
      <PageShell>
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full mt-2" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  if (!plan) {
    return (
      <PageShell>
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-8 text-center">
              <p>Plan introuvable</p>
              <Button onClick={() => navigate("/pricing")} className="mt-4">
                Retour aux plans
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/pricing")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux plans
        </Button>

        <h1 className="text-3xl font-bold mb-6">Finaliser l'abonnement</h1>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Plan Details */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Plan {plan.display_name}</CardTitle>
                <Badge variant="default">{plan.video_quota} vidéos/mois</Badge>
              </div>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Prix mensuel</p>
                <p className="text-3xl font-bold">{plan.price_monthly}€</p>
                <p className="text-xs text-muted-foreground mt-1">Facturation mensuelle</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Fonctionnalités incluses :</p>
                <ul className="space-y-2">
                  {plan.features.map((feature: string, index: number) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Payment Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Récapitulatif</CardTitle>
              <CardDescription>Détails de votre commande</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Plan {plan.display_name}</span>
                  <span>{plan.price_monthly}€/mois</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>TVA (20%)</span>
                  <span>{(plan.price_monthly * 0.2).toFixed(2)}€</span>
                </div>
              </div>

              <div className="border-t pt-2">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{(plan.price_monthly * 1.2).toFixed(2)}€/mois</span>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg text-sm">
                <p className="text-blue-900 dark:text-blue-100">
                  ✓ Annulation à tout moment
                  <br />✓ Quota réinitialisé chaque mois
                  <br />✓ Support prioritaire
                </p>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={processingCheckout}
                className="w-full"
                size="lg"
              >
                {processingCheckout ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Redirection vers Stripe...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Passer au paiement
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Paiement sécurisé par Stripe. Vos informations bancaires ne sont jamais
                stockées sur nos serveurs.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
