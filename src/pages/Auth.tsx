import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/use-auth";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useEffect } from "react";

const Auth = () => {
  const { user } = useAuth();
  const { openModal } = useAuthModal();

  // Open the modal automatically when this page is visited
  useEffect(() => {
    if (!user) {
      openModal();
    }
  }, [openModal, user]);

  // Redirect authenticated users to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  // Show empty page while modal is opening
  // The modal will be rendered by App.tsx
  return null;
};

export default Auth;
