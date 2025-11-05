import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { AuthModalProvider } from "@/lib/auth-modal-context";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import CreateVideo from "./pages/CreateVideo";
import Pricing from "./pages/Pricing";
import HowItWorks from "./pages/HowItWorks";
import Account from "./pages/Account";
import NotFound from "./pages/NotFound";
import AuthModal from "@/components/auth/AuthModal";
import { useAuthModal } from "@/lib/auth-modal-context";
import { ThemeProvider } from "./components/theme-provider";

// Créer QueryClient en dehors pour éviter les réinitialisations
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false, // Ne pas recharger au focus
    },
  },
});

const AppContent: React.FC = () => {
  const { isOpen, closeModal } = useAuthModal();

  return (
    <>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/process" element={<HowItWorks />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/account" element={<Account />} />
        <Route path="/create" element={<CreateVideo />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      <AuthModal isOpen={isOpen} onClose={closeModal} />
    </>
  );
};

const App: React.FC = () => {
  const basename =
    import.meta.env.BASE_URL === "/"
      ? "/"
      : import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter
            basename={basename}
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <AuthProvider>
              <AuthModalProvider>
                <AppContent />
              </AuthModalProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
