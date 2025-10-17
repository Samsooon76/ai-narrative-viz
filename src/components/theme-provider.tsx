import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "videoai-theme";

export type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getSystemPreference = () => {
  if (typeof window === "undefined") return "light" as const;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyThemeClass = (mode: "light" | "dark") => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(mode);
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return getSystemPreference();
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return stored ?? getSystemPreference();
  });

  const resolvedMode = useMemo(() => mode, [mode]);

  // Sync resolved mode to DOM
  useEffect(() => {
    applyThemeClass(resolvedMode);
  }, [resolvedMode]);

  // No system mode anymore

  const setModePersist = useCallback((nextMode: ThemeMode) => {
    setMode(nextMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    }
  }, []);

  const toggleMode = useCallback(() => {
    setModePersist(resolvedMode === "dark" ? "light" : "dark");
  }, [resolvedMode, setModePersist]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedMode, setMode: setModePersist, toggleMode }),
    [mode, resolvedMode, setModePersist, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
