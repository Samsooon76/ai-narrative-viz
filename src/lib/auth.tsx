import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { AuthContext, type AuthContextType } from './auth-context';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isSubscribed) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (event === 'SIGNED_IN' && isSubscribed) {
          console.log('User signed in');
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isSubscribed) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/dashboard`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName
        }
      }
    });
    
    if (error) {
      console.error('Sign up error:', error.message);
    }
    
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('Sign in error:', error.message);
    }
    
    return { error };
  };

  const signInWithGoogle = async () => {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: redirectTo
        ? {
            redirectTo,
            queryParams: { prompt: "select_account" },
          }
        : {
            queryParams: { prompt: "select_account" },
          },
    });

    if (error) {
      console.error("Google sign-in error:", error.message);
      toast({
        title: "Connexion Google impossible",
        description: "Veuillez réessayer ou utiliser un autre moyen de connexion.",
        variant: "destructive",
      });
    }

    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error:', error.message);
      toast({
        title: "Erreur",
        description: "Impossible de se déconnecter",
        variant: "destructive"
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, signUp, signIn, signInWithGoogle, signOut, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
};
