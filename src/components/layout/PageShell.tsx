import { ReactNode } from "react";
import { Navbar } from "@/components/ui/navbar";
import Aurora from "@/components/Aurora";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  hideNavbar?: boolean;
}

const PageShell = ({
  children,
  className,
  contentClassName,
  hideNavbar = false,
}: PageShellProps) => {
  return (
    <div
      className={cn(
        "relative min-h-screen bg-gradient-to-br from-background via-background to-muted/20",
        className,
      )}
      style={{ isolation: "isolate" }}
    >
      <Aurora
        className="pointer-events-none select-none"
        colorStops={["#3A29FF", "#FF94B4", "#FF3232"]}
        blend={0.5}
        amplitude={1.0}
        speed={0.5}
      />
      {!hideNavbar && <Navbar />}
      <main
        className={cn(
          "relative z-[1] pt-28 md:pt-32 lg:pt-36 pb-16",
          contentClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
};

export default PageShell;
