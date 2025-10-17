import React from "react";
import { motion } from "framer-motion";

type AuroraBackgroundProps = {
  className?: string;
};

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ className }) => {
  return (
    <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className ?? ""}`} aria-hidden>
      {/* Soft vignette - light */}
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,hsl(var(--primary)/0.08)_0%,transparent_70%)] dark:hidden" />
      {/* Stronger vignette - dark */}
      <div className="absolute inset-0 hidden dark:block bg-[radial-gradient(80%_60%_at_50%_0%,hsl(var(--primary)/0.16)_0%,transparent_70%)]" />

      {/* Animated blobs */}
      <motion.div
        className="absolute -top-24 -left-24 h-[50vmin] w-[50vmin] rounded-full bg-primary/20 dark:bg-primary/30 blur-3xl dark:blur-2xl mix-blend-screen"
        initial={{ x: -80, y: -40, scale: 1 }}
        animate={{ x: [ -80, 120, 80, -60, -80 ], y: [ -40, 40, 120, 40, -40 ], scale: [1, 1.2, 0.9, 1.15, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute top-1/4 -right-24 h-[55vmin] w-[55vmin] rounded-full bg-accent/20 dark:bg-accent/30 blur-3xl dark:blur-2xl mix-blend-screen"
        initial={{ x: 60, y: 0, scale: 1 }}
        animate={{ x: [ 60, -100, -60, 80, 60 ], y: [ 0, -40, 60, 120, 0 ], scale: [1, 1.1, 1.25, 0.95, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute bottom-[-10%] left-1/3 h-[60vmin] w-[60vmin] rounded-full bg-indigo-500/15 dark:bg-indigo-400/25 blur-[80px] dark:blur-[60px] mix-blend-screen"
        initial={{ x: 0, y: 0, scale: 1 }}
        animate={{ x: [ 0, -60, 80, -40, 0 ], y: [ 0, -40, -20, 40, 0 ], scale: [1, 1.15, 0.95, 1.1, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
};

export default AuroraBackground;


