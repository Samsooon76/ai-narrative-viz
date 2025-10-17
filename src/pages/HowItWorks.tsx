import { motion } from "framer-motion";
import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Bot, Clapperboard, Rocket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import Aurora from "@/components/Aurora";
import { useAuth } from "@/lib/use-auth";
import ScrollStack, { ScrollStackItem } from "@/components/ScrollStack";

type HowItWorksStep = {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
  points: string[];
};

const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    icon: Sparkles,
    title: "Décrivez votre projet",
    description:
      "Choisissez un format, précisez votre message et laissez l'IA comprendre le contexte, le ton et le public visé.",
    accent: "from-purple-500 to-fuchsia-500",
    points: [
      "Briefez en langage naturel, l'assistant pose les bonnes questions",
      "Définissez le call-to-action, la durée et le rythme souhaités",
    ],
  },
  {
    icon: Bot,
    title: "L'IA imagine le storyboard",
    description:
      "Chaque scène est générée avec narration, visuel recommandé et intention sonore. Ajustez tout en direct.",
    accent: "from-sky-500 to-cyan-500",
    points: [
      "Storyboard complet avec voix off, transitions et structure",
      "Réécriture instantanée selon votre feedback",
    ],
  },
  {
    icon: Clapperboard,
    title: "Générez vos scènes",
    description:
      "Sélectionnez les assets générés ou importez vos médias. Animations, musique et sous-titres sont proposés automatiquement.",
    accent: "from-amber-500 to-orange-500",
    points: [
      "Banque de médias intégrée + génération IA (images, vidéos, voix)",
      "Aperçus temps réel pour chaque scène clé",
    ],
  },
  {
    icon: Rocket,
    title: "Assemblez et partagez",
    description:
      "La timeline finale se construit automatiquement. Ajustez, validez puis exportez en HD dans tous les formats.",
    accent: "from-emerald-500 to-teal-500",
    points: [
      "Montage automatique avec points clés éditables",
      "Exports 16:9, 9:16, 1:1 + sous-titres et doublage multilingue",
    ],
  },
];

const HowItWorks = () => {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-muted/20 text-foreground">
      <Aurora className="z-0" colorStops={["#3A29FF", "#FF94B4", "#FF3232"]} blend={0.5} amplitude={1.0} speed={0.5} />
      <Navbar />

      <main className="relative z-[1] pt-32 pb-24">
        <section className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mx-auto max-w-3xl text-center space-y-6"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-sm font-medium text-primary/90 backdrop-blur">
              <Sparkles className="h-4 w-4" />
              IA au service de votre narration
            </span>
            <h1 className="text-4xl font-bold md:text-5xl lg:text-6xl">Comment fonctionne VideoAI Studio ?</h1>
            <p className="text-lg text-muted-foreground">
              Du premier brief à l’export final, suivez un workflow guidé qui transforme vos idées en vidéos prêtes à diffuser. Pas besoin d’expérience en montage.
            </p>
          </motion.div>
        </section>

        <section className="container px-4 pt-16">
          <div className="mx-auto max-w-4xl">
            <ScrollStack
              useWindowScroll
              itemDistance={-420}
              itemStackDistance={36}
              itemScale={0.04}
              baseScale={0.82}
              stackPosition="25%"
              scaleEndPosition="15%"
              className="scroll-stack-window-wrapper"
            >
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <ScrollStackItem key={step.title} itemClassName="bg-white/6 border border-white/10 backdrop-blur-2xl">
                  <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-gradient-to-br from-white/12 via-white/5 to-transparent opacity-80" />
                  <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-gradient-to-br from-black/15 via-transparent to-black/15 opacity-55" />
                  <div className="relative flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
                    <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br ${step.accent} text-white shadow-xl shadow-black/35`}>
                      <step.icon className="h-10 w-10" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.35em] text-primary/70">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary/80">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        Étape {index + 1}
                      </div>
                      <h2 className="mt-6 text-3xl font-semibold text-foreground md:text-[34px]">{step.title}</h2>
                      <p className="mt-4 text-base leading-relaxed text-muted-foreground/90">{step.description}</p>
                      <ul className="mt-6 space-y-3 text-sm text-muted-foreground/80">
                        {step.points.map((point) => (
                          <li key={point} className="flex items-start gap-3">
                            <span className="mt-2 h-2.5 w-2.5 rounded-full bg-primary/70 shadow-[0_0_0_4px_rgba(59,130,246,0.18)]" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </ScrollStackItem>
              ))}
            </ScrollStack>
          </div>
        </section>

        <section className="container px-4 pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/[0.04] p-10 backdrop-blur"
          >
            <h2 className="text-3xl font-semibold md:text-4xl">Une expérience fluide et collaborative</h2>
            <ul className="mt-6 space-y-4 text-sm text-muted-foreground">
              <li>• Relecture assistée : l’IA suggère des variantes de script et gère les transitions.</li>
              <li>• Timeline intuitive : naviguez entre les scènes, ajoutez des sous-titres, changez la musique.</li>
              <li>• Collaboration temps réel : invitez vos coéquipiers, commentent et valident directement dans le studio.</li>
              <li>• Exports multiples : livrez vos contenus en 9:16, 1:1 ou 16:9 en quelques secondes.</li>
            </ul>
          </motion.div>
        </section>

        <section className="container px-4 pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10 p-12 text-center backdrop-blur"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/25 via-transparent to-accent/20 opacity-60" />
            <div className="relative space-y-5">
              <h2 className="text-3xl font-semibold md:text-4xl">Passez du brief à la vidéo en moins de 5 minutes</h2>
              <p className="text-base text-muted-foreground">
                Lancez votre première production dès maintenant et laissez VideoAI Studio orchestrer l’intégralité du montage.
              </p>
              <Button asChild size="lg" className="rounded-full px-8">
                <Link to="/create">
                  Démarrer un projet
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
};

export default HowItWorks;
