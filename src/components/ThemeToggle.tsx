import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MonitorCog, MoonStar, Sun } from "lucide-react";
import { useTheme, ThemeMode } from "./theme-provider";

const MODE_LABELS: Record<ThemeMode, string> = {
  light: "Mode clair",
  dark: "Mode sombre",
};

export const ThemeToggle = ({ className, compact }: { className?: string; compact?: boolean }) => {
  const { mode, resolvedMode, setMode, toggleMode } = useTheme();

  const renderIcon = () => {
    switch (resolvedMode) {
      case "dark":
        return <MoonStar className="h-4 w-4" />;
      default:
        return <Sun className="h-4 w-4" />;
    }
  };

  const handleSelect = (value: ThemeMode) => () => setMode(value);

  // Compact mode: simple icon button, toggles between dark/light. No dropdown, no system option.
  if (compact) {
    return (
      <Button
        variant="secondary"
        size="icon"
        onClick={toggleMode}
        title={MODE_LABELS[resolvedMode]}
        aria-label="Changer le thème"
        className={cn("h-8 w-8 rounded-full border border-white/10 bg-white/10 text-foreground/90 hover:bg-white/15", className)}
      >
        {renderIcon()}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={compact ? "secondary" : "ghost"}
          size={compact ? "icon" : "sm"}
          onClick={compact ? toggleMode : undefined}
          title={MODE_LABELS[resolvedMode]}
          aria-label="Changer le thème"
          className={cn(
            compact
              ? "h-8 w-8 rounded-full border border-white/10 bg-white/10 text-foreground/90 hover:bg-white/15"
              : "gap-2 text-xs",
            className
          )}
        >
          {renderIcon()}
          {!compact && (
            <span className="hidden sm:inline">
              {mode === "system" ? `Auto (${MODE_LABELS[resolvedMode]})` : MODE_LABELS[resolvedMode]}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuCheckboxItem
          checked={mode === "light"}
          onCheckedChange={handleSelect("light")}
        >
          <div className="flex items-center gap-2">
            <Sun className="h-3.5 w-3.5" />
            Mode clair
          </div>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={mode === "dark"}
          onCheckedChange={handleSelect("dark")}
        >
          <div className="flex items-center gap-2">
            <MoonStar className="h-3.5 w-3.5" />
            Mode sombre
          </div>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
