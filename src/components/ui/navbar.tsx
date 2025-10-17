import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Video, LogOut, Power } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/lib/use-auth";
import { useMemo } from "react";

const navLinkBase = "rounded-full px-4 py-2 text-base font-semibold transition-colors";

export const Navbar = () => {
  const { user, signOut } = useAuth();

  const links = useMemo(
    () => [
      { to: "/", label: "Accueil", requireAuth: false, hideWhenAuth: true },
      { to: "/pricing", label: "Pricing", requireAuth: false, hideWhenAuth: true },
      { to: "/process", label: "Comment ça marche", requireAuth: false, hideWhenAuth: true },
      { to: "/dashboard", label: "Dashboard", requireAuth: true },
      { to: "/create", label: "Studio", requireAuth: true },
    ],
    []
  );

  return (
    <nav className="fixed inset-x-0 top-0 z-50" style={{ willChange: 'transform' }}>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mt-3 flex h-14 items-center justify-between rounded-full border border-white/10 bg-white/5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-white/5 pl-2 md:pl-3" style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}>
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-primary shadow-sm">
              <Video className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold tracking-tight">VideoAI Studio</span>
            </div>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {links
              .filter((item) => (!item.requireAuth || !!user) && !(item.hideWhenAuth && user))
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `${navLinkBase} ${isActive ? "text-white" : "text-muted-foreground hover:text-foreground"}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
          </div>

          <div className="flex items-center gap-2 pr-2">
            <ThemeToggle className="flex" compact />
            {user ? (
              <>
                <Link to="/dashboard">
                  <Button size="sm" variant="ghost" className="hidden sm:inline-flex rounded-full px-4 text-sm font-semibold text-white hover:bg-white/10">
                    Mon espace
                  </Button>
                </Link>
                <button
                  onClick={signOut}
                  className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  aria-label="Déconnexion"
                  title="Déconnexion"
                >
                  <Power className="h-4 w-4" />
                </button>
              </>
            ) : (
              <Link to="/auth">
                <Button size="sm" className="rounded-full px-5 text-sm font-semibold shadow-lg shadow-primary/25">
                  Se connecter
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
