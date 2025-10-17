import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, Mail, Lock, User, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { z } from "zod";

const emailSchema = z.string().email("Email invalide");
const passwordSchema = z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères");

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="#4285F4"
      d="M23.5 12.27c0-.79-.07-1.37-.22-1.97H12v3.58h6.48c-.13 1.12-.83 2.8-2.38 3.93l-.02.15 3.46 2.63.24.02c2.24-2.07 3.72-5.11 3.72-8.34Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.95-2.92L16.35 18c-1 .7-2.35 1.19-4.35 1.19-3.32 0-6.14-2.23-7.15-5.33l-.15.01-3.59 2.77-.05.14C3.69 21.78 7.51 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M4.85 13.86A7.97 7.97 0 0 1 4.42 12c0-.65.11-1.28.22-1.86l-.01-.13L1 7.21l-.12.05A11.99 11.99 0 0 0 0 12c0 1.93.47 3.76 1.29 5.37z"
    />
    <path
      fill="#EA4335"
      d="M12 4.73c2.25 0 3.76.97 4.62 1.79l3.38-3.3C17.93 1.17 15.24 0 12 0 7.51 0 3.69 2.22 1.17 5.46l3.88 3.03C5.95 6.96 8.67 4.73 12 4.73Z"
    />
  </svg>
);

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupFullName, setSignupFullName] = useState("");

  // Redirect if already logged in
  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Erreur de validation",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }

    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    
    if (error) {
      toast({
        title: "Erreur de connexion",
        description: error.message === "Invalid login credentials" 
          ? "Email ou mot de passe incorrect" 
          : error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Connexion réussie !",
        description: "Bienvenue sur VideoAI"
      });
      navigate("/dashboard");
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    if (oauthLoading) return;
    setOauthLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setOauthLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPassword);
      
      if (!signupFullName.trim()) {
        throw new Error("Le nom complet est requis");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Erreur de validation",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      } else if (error instanceof Error) {
        toast({
          title: "Erreur",
          description: error.message,
          variant: "destructive"
        });
        return;
      }
    }

    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupFullName);
    
    if (error) {
      if (error.message.includes("already registered")) {
        toast({
          title: "Compte existant",
          description: "Cet email est déjà utilisé. Essayez de vous connecter.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Erreur d'inscription",
          description: error.message,
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Compte créé !",
        description: "Bienvenue sur VideoAI"
      });
      navigate("/dashboard");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8 group">
          <div className="rounded-lg bg-gradient-to-br from-primary to-accent p-2 transition-transform group-hover:scale-110">
            <Video className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            VideoAI
          </span>
        </Link>

        <Card className="p-8 border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm">
          <div className="space-y-6">
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 bg-background/40"
              onClick={handleGoogleSignIn}
              disabled={loading || oauthLoading}
            >
              {oauthLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                <>
                  <GoogleIcon />
                  Continuer avec Google
                </>
              )}
            </Button>

            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
              <span className="h-px flex-1 bg-border/60" />
              <span>ou</span>
              <span className="h-px flex-1 bg-border/60" />
            </div>

            <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="login">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Inscription</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="votre@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10 bg-background/50"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 bg-background/50"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 h-12"
                  disabled={loading}
                >
                  {loading ? "Connexion..." : "Se connecter"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nom complet</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Jean Dupont"
                      value={signupFullName}
                      onChange={(e) => setSignupFullName(e.target.value)}
                      className="pl-10 bg-background/50"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="votre@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="pl-10 bg-background/50"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="pl-10 bg-background/50"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimum 6 caractères
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 h-12"
                  disabled={loading}
                >
                  {loading ? "Création..." : "Créer mon compte"}
                </Button>
              </form>
            </TabsContent>
            </Tabs>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
