import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Lock, CreditCard, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PageShell from "@/components/layout/PageShell";

const Account = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [emailForm, setEmailForm] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  if (loading) {
    return (
      <PageShell contentClassName="container px-4 pb-16">
        <div className="animate-pulse space-y-6 pt-6">
          <div className="h-12 w-2/3 rounded-lg bg-white/5"></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-64 rounded-lg bg-white/5"></div>
            <div className="h-64 rounded-lg bg-white/5"></div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!emailForm || emailForm === user.email) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer un nouvel email différent",
        variant: "destructive",
      });
      return;
    }

    setEmailLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: emailForm });

      if (error) throw error;

      toast({
        title: "Email mis à jour",
        description: "Un email de confirmation a été envoyé à votre nouvelle adresse",
      });
      setEmailForm("");
    } catch (error) {
      console.error("Erreur changement email:", error);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de changer l'email",
        variant: "destructive",
      });
    } finally {
      setEmailLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive",
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      toast({
        title: "Mot de passe changé",
        description: "Votre mot de passe a été mis à jour avec succès",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Erreur changement mot de passe:", error);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de changer le mot de passe",
        variant: "destructive",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <PageShell contentClassName="container px-4 pb-16">
      <div className="mx-auto max-w-3xl space-y-8 pt-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Mon espace</h1>
          <p className="mt-2 text-muted-foreground">Gérez vos informations personnelles et vos préférences</p>
        </div>

        {/* Informations personnelles */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Informations personnelles</h2>
          </div>

          <Card className="border border-white/10 bg-black/25 p-6 backdrop-blur-lg">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Email</Label>
                <p className="text-lg font-medium text-foreground">{user.email}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Compte créé</Label>
                <p className="text-lg font-medium text-foreground">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString("fr-FR") : "-"}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">ID utilisateur</Label>
                <p className="font-mono text-sm text-muted-foreground">{user.id}</p>
              </div>
              {user.user_metadata?.full_name && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nom complet</Label>
                  <p className="text-lg font-medium text-foreground">{user.user_metadata.full_name}</p>
                </div>
              )}
            </div>
          </Card>
        </section>

        <Separator className="bg-white/10" />

        {/* Changer l'email */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Changer l'email</h2>
          </div>

          <Card className="border border-white/10 bg-black/25 p-6 backdrop-blur-lg">
            <form onSubmit={handleChangeEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-email">Nouvel email</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="votre-nouveau@email.com"
                  value={emailForm}
                  onChange={(e) => setEmailForm(e.target.value)}
                  className="bg-background/50"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Un email de confirmation sera envoyé à la nouvelle adresse
                </p>
              </div>
              <Button
                type="submit"
                disabled={emailLoading}
                className="gap-2"
              >
                {emailLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {emailLoading ? "Mise à jour..." : "Changer l'email"}
              </Button>
            </form>
          </Card>
        </section>

        <Separator className="bg-white/10" />

        {/* Changer le mot de passe */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Changer le mot de passe</h2>
          </div>

          <Card className="border border-white/10 bg-black/25 p-6 backdrop-blur-lg">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nouveau mot de passe</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-background/50"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 6 caractères
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-background/50"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={passwordLoading}
                className="gap-2"
              >
                {passwordLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {passwordLoading ? "Mise à jour..." : "Changer le mot de passe"}
              </Button>
            </form>
          </Card>
        </section>

        <Separator className="bg-white/10" />

        {/* Facturation (placeholder) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Facturation</h2>
          </div>

          <Card className="border border-white/10 bg-black/25 p-6 backdrop-blur-lg">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Gestion des abonnements, historique de facturation et documents comptables.
              </p>
              <Button variant="outline" disabled className="gap-2">
                <CreditCard className="h-4 w-4" />
                Gérer la facturation (à venir)
              </Button>
            </div>
          </Card>
        </section>

        {/* Zone de danger */}
        <div className="pt-8">
          <Separator className="bg-white/10" />
        </div>
      </div>
    </PageShell>
  );
};

export default Account;
