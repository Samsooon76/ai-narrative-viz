import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wand2, Zap, Users, ArrowRight, Play, ChevronDown, Sparkles, Bot, Clapperboard, Rocket } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/use-auth";
import { useAuthModal } from "@/lib/auth-modal-context";
import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef, useEffect, useState, useCallback } from "react";
import SplitText from "@/components/SplitText";
import Aurora from "@/components/Aurora";
import LandingProcess from "@/components/LandingProcess";
const FEATURES = [
  {
    icon: Wand2,
    title: "IA créative",
    description: "Storyboard en 60 secondes",
    color: "from-blue-500 to-cyan-500"
  },
  {
    icon: Zap,
    title: "Workflow fluide",
    description: "Timeline intuitive & contrôles précis",
    color: "from-yellow-500 to-orange-500"
  },
  {
    icon: Users,
    title: "Équipes agiles",
    description: "Collaboration en temps réel",
    color: "from-green-500 to-emerald-500"
  },
];

type Feature = typeof FEATURES[number];

const HOW_IT_WORKS_PREVIEW = [
  {
    icon: Sparkles,
    title: "Brief express",
    description: "Décrivez votre projet en langage naturel. L'IA suggère ton, durée et cible automatiquement.",
  },
  {
    icon: Bot,
    title: "Storyboard généré",
    description: "Les scènes sont écrites pour vous avec voix off, intentions visuelles et transitions clés.",
  },
  {
    icon: Clapperboard,
    title: "Visuels & médias",
    description: "Générez ou sélectionnez les visuels, musiques et animations adaptés à chaque scène.",
  },
  {
    icon: Rocket,
    title: "Export prêt à publier",
    description: "Assemblez, ajustez puis exportez en HD (16:9, 9:16, 1:1) en un clic avec sous-titres.",
  },
];

const gridVariants = {
  hidden: {
    opacity: 0,
    transition: {
      staggerChildren: 0.18,
      staggerDirection: -1,
    },
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.22,
      delayChildren: 0.2,
    },
  },
};

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 40,
    scale: 0.98,
    transition: {
      duration: 0.5,
      ease: "easeInOut",
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: "easeOut",
    },
  },
};

// Composant Scroll Stack personnalisé avec effets de parallaxe optimisé
const ScrollStack = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  const [scrollY, setScrollY] = useState(0);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const rafRef = useRef<number>();

  useEffect(() => {
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        rafRef.current = window.requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!ticking) {
        rafRef.current = window.requestAnimationFrame(() => {
          setMousePosition({ x: e.clientX, y: e.clientY });
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Calcul de l'effet de parallaxe basé sur le scroll (réduit pour éviter les flashs)
  const parallaxOffset = scrollY * 0.05;
  const rotationX = (mousePosition.y - window.innerHeight / 2) * 0.005;
  const rotationY = (mousePosition.x - window.innerWidth / 2) * 0.005;

  return (
    <div
      className={`relative ${className}`}
      style={{
        transform: `translate3d(0, ${parallaxOffset}px, 0) rotateX(${rotationX}deg) rotateY(${rotationY}deg)`,
        transformStyle: "preserve-3d",
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
    >
      {children}
    </div>
  );
};

// Composant Masonry personnalisé avec effets avancés
type FeatureCardProps = {
  item: Feature;
  mousePosition: { x: number; y: number };
};

const FeatureCard = ({ item, mousePosition }: FeatureCardProps) => {
  const hasWindow = typeof window !== "undefined";
  const xCenter = hasWindow ? window.innerWidth / 2 : 0;
  const yCenter = hasWindow ? window.innerHeight / 2 : 0;
  const xOffset = hasWindow ? (mousePosition.x - xCenter) * 0.01 : 0;
  const yOffset = hasWindow ? (mousePosition.y - yCenter) * 0.01 : 0;

  return (
    <motion.div
      variants={cardVariants}
      className="group relative overflow-visible"
    >
      <div className={`pointer-events-none absolute -inset-x-8 bottom-[-70px] h-32 rounded-full bg-gradient-to-r ${item.color} opacity-30 blur-3xl transition-opacity duration-700 group-hover:opacity-60`} />

      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-[0_25px_70px_-40px_rgba(15,23,42,0.9)] backdrop-blur-2xl transition-all duration-500 group-hover:-translate-y-3 group-hover:border-white/20 group-hover:shadow-[0_35px_110px_-45px_rgba(37,99,235,0.55)]">
        <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-br from-white/20 via-white/5 to-transparent opacity-80" />
        <div
          className="pointer-events-none absolute inset-0 rounded-[28px] transition duration-500"
          style={{
            background: `radial-gradient(circle at ${50 + xOffset * 8}% ${50 + yOffset * 8}%, rgba(255,255,255,0.22), transparent 60%)`,
            opacity: 0.6,
          }}
        />

        <div className="relative flex flex-col gap-6">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} text-white shadow-lg shadow-black/20`}>
            <item.icon className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
            <p className="text-base leading-relaxed text-muted-foreground/90">{item.description}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const MasonryGrid = ({
  items,
  className = "",
  isActive,
}: {
  items: Feature[];
  className?: string;
  isActive: boolean;
}) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <motion.div
      variants={gridVariants}
      initial="hidden"
      animate={isActive ? "visible" : "hidden"}
      className={`grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 ${className}`}
    >
      {items.map((item) => (
        <FeatureCard key={item.title} item={item} mousePosition={mousePosition} />
      ))}
    </motion.div>
  );
};

const Index = () => {
  const { user } = useAuth();
  const { openModal } = useAuthModal();
  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const ctaRef = useRef(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [demoStartSignal, setDemoStartSignal] = useState<number | null>(null);
  const demoStartTimeoutRef = useRef<number | null>(null);
  const heroAutoStartScheduledRef = useRef(false);
  const handleHeroTextComplete = useCallback(() => {
    if (heroAutoStartScheduledRef.current) return;
    heroAutoStartScheduledRef.current = true;
    if (demoStartTimeoutRef.current !== null) {
      window.clearTimeout(demoStartTimeoutRef.current);
    }
    demoStartTimeoutRef.current = window.setTimeout(() => {
      setDemoStartSignal(Date.now());
      demoStartTimeoutRef.current = null;
    }, 1_000);
  }, []);

  const heroInView = useInView(heroRef, { once: true, margin: "-100px", amount: 0.3 });
  const rawFeaturesInView = useInView(featuresRef, { once: true, margin: "-200px", amount: 0.2 });
  const ctaInView = useInView(ctaRef, { once: true, margin: "-100px", amount: 0.3 });
  const [hasFeaturesAnimated, setHasFeaturesAnimated] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setHasScrolled(window.scrollY > 80);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (rawFeaturesInView) {
      setHasFeaturesAnimated(true);
    }
  }, [rawFeaturesInView]);

  useEffect(() => {
    return () => {
      if (demoStartTimeoutRef.current !== null) {
        window.clearTimeout(demoStartTimeoutRef.current);
      }
    };
  }, []);

  const featuresShouldShow = rawFeaturesInView || hasFeaturesAnimated;

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-background to-muted/20" style={{ isolation: 'isolate' }}>
      {/* New Aurora (OGL) background */}
      <Aurora className="z-0" colorStops={["#3A29FF", "#FF94B4", "#FF3232"]} blend={0.5} amplitude={1.0} speed={0.5} />
      <Navbar />

      <main className="relative z-[1] pt-28 md:pt-36 lg:pt-44 pb-16" style={{ willChange: 'contents' }}>
        {/* Hero Section */}
        <section ref={heroRef} className="container relative px-4 py-14 lg:py-20">
          <div className="mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={heroInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="space-y-10"
            >
              {/* Removed hero pill badge per request */}

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="text-4xl font-bold leading-none tracking-tight text-foreground md:text-6xl lg:text-7xl"
              >
                <SplitText
                  prefix="Créez des vidéos"
                  highlight="extraordinaires"
                  suffix="en quelques clics"
                  twoLines
                  onComplete={handleHeroTextComplete}
                />
              </motion.h1>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.8, delay: 0.45 }}
                className="mx-auto max-w-5xl"
              >
                <LandingProcess autoStart={false} startSignal={demoStartSignal} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="flex flex-col gap-4 sm:flex-row sm:justify-center"
              >
                {user ? (
                  <Link to="/create">
                    <Button size="lg" className="h-14 gap-3 px-8 text-lg font-semibold rounded-full bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-lg">
                      <Play className="h-5 w-5" />
                      Ouvrir le studio
                    </Button>
                  </Link>
                ) : (
                  <Button
                    size="lg"
                    onClick={openModal}
                    className="h-14 gap-3 px-8 text-lg font-semibold rounded-full bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-lg"
                  >
                    <Play className="h-5 w-5" />
                    Commencer gratuitement
                  </Button>
                )}
                {!user && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={openModal}
                    className="h-14 gap-3 px-8 text-lg rounded-full"
                  >
                    Se connecter
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={!hasScrolled && heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="flex justify-center pt-12"
              >
                {!hasScrolled && (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 shadow-sm backdrop-blur">
                    <ChevronDown className="h-6 w-6 animate-bounce" />
                  </div>
                )}
              </motion.div>

            </motion.div>
          </div>
        </section>

        {/* Features Section avec Masonry */}
        <section ref={featuresRef} className="container px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={featuresShouldShow ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center"
          >
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              Tout ce dont vous avez besoin
            </h2>
            <p className="mx-auto mb-12 max-w-2xl text-muted-foreground">
              Une plateforme complète pour créer des vidéos professionnelles sans les complications techniques.
            </p>
          </motion.div>

          <MasonryGrid items={FEATURES} isActive={featuresShouldShow} />
        </section>

        {/* Section Comment ça marche */}
        <section className="container px-4 py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 0.7 }}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary/80">
              Comment ça marche
            </span>
            <h2 className="mt-4 text-3xl font-bold text-foreground md:text-4xl">De l&apos;idée à la vidéo en quelques clics</h2>
            <p className="mt-4 text-muted-foreground">
              Retrouvez le même workflow que dans le studio : vous briefez, l&apos;IA réalise le storyboard, propose les visuels et assemble la vidéo.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-2"
          >
            {HOW_IT_WORKS_PREVIEW.map((step, index) => (
              <div
                key={step.title}
                className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-[0_25px_70px_-40px_rgba(15,23,42,0.85)] backdrop-blur-lg transition-all duration-500 hover:-translate-y-2 hover:border-white/20"
              >
                <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-br from-white/15 via-white/5 to-transparent opacity-70 transition-opacity duration-500 group-hover:opacity-90" />
                <div className="relative space-y-4 text-left">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-inner shadow-primary/20">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-semibold uppercase tracking-[0.25em] text-primary/60">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* CTA Section avec Scroll Stack */}
        <section ref={ctaRef} className="container px-4 py-16">
          <ScrollStack className="relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={ctaInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.8 }}
              className="mx-auto max-w-4xl"
            >
              <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10 p-12 text-center backdrop-blur-sm">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />

                <div className="relative">
                  <Badge className="mb-6 bg-primary/10 text-primary border-primary/20">
                    Prêt à créer ?
                  </Badge>

                  <h2 className="mb-6 text-3xl font-bold text-foreground md:text-4xl">
                    Votre premier storyboard en moins de 2 minutes
                  </h2>

                  <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
                    Rejoignez des milliers de créateurs qui ont déjà transformé leur workflow vidéo.
                  </p>

                  <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
                    {user ? (
                      <Link to="/create">
                        <Button size="lg" className="h-14 gap-3 px-8 text-lg font-semibold rounded-full bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-lg">
                          <Play className="h-5 w-5" />
                          Continuer
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        size="lg"
                        onClick={openModal}
                        className="h-14 gap-3 px-8 text-lg font-semibold rounded-full bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-lg"
                      >
                        <Play className="h-5 w-5" />
                        Créer mon compte
                      </Button>
                    )}
                    <Link to="/dashboard">
                      <Button variant="outline" size="lg" className="h-14 gap-3 px-8 text-lg rounded-full">
                        Voir les projets
                        <ArrowRight className="h-5 w-5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </ScrollStack>
        </section>
      </main>

      <footer className="border-t border-border/50 py-8 text-sm text-muted-foreground">
        <div className="container px-4">
          <div className="flex flex-col gap-2 text-center sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} VideoAI Studio</span>
            <span>Propulsé par l'IA, conçu pour les humains</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
