import { motion } from "framer-motion";
import { Check, Sparkles, Zap, Users } from "lucide-react";
import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Link, Navigate } from "react-router-dom";
import Aurora from "@/components/Aurora";
import { useAuth } from "@/lib/use-auth";

const pricingTiers = [
  {
    name: "Starter",
    price: "0€",
    description: "Idéal pour découvrir le studio et produire vos premiers storyboards.",
    features: [
      "3 projets par mois",
      "Génération de scripts IA",
      "Exports 720p",
      "Bibliothèque de templates",
    ],
    cta: "Commencer",
    highlight: false,
  },
  {
    name: "Créateur",
    price: "39€",
    description: "Pensé pour les équipes créatives qui veulent accélérer leur production.",
    features: [
      "Projets illimités",
      "Exports 4K",
      "Voix IA premium",
      "Collaboration en temps réel",
      "Support prioritaire",
    ],
    cta: "Lancer l'abonnement",
    highlight: true,
  },
  {
    name: "Studio",
    price: "Sur mesure",
    description: "Accompagnement dédié pour les agences, studios et grandes équipes.",
    features: [
      "Onboarding personnalisé",
      "Intégrations API",
      "Brand kit étendu",
      "SLA et support dédié",
      "Formation des équipes",
    ],
    cta: "Nous contacter",
    highlight: false,
  },
];

const featureHighlights = [
  {
    icon: Sparkles,
    title: "IA créative",
    description: "Des scripts et storyboards générés en quelques secondes avec votre tonalité.",
  },
  {
    icon: Zap,
    title: "Workflow fluide",
    description: "Une timeline intuitive, pensée pour itérer rapidement et rester concentré.",
  },
  {
    icon: Users,
    title: "Collaboration native",
    description: "Commentaires, validations et versioning centralisés pour votre équipe.",
  },
];

const Pricing = () => {
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
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="mx-auto max-w-3xl text-center space-y-6"
          >
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1 text-sm font-medium text-primary/90 backdrop-blur">
              Choisissez votre rythme de création
            </span>
            <h1 className="text-4xl font-bold md:text-5xl lg:text-6xl">Des tarifs flexibles pour créer sans limites</h1>
            <p className="text-lg text-muted-foreground">
              Que vous démariez ou que vous produisiez à grande échelle, nous avons une offre adaptée. Passez à l&apos;offre supérieure quand vous en avez besoin.
            </p>
          </motion.div>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {pricingTiers.map((tier, index) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.12 }}
                className={`relative flex flex-col rounded-3xl border border-white/10 p-8 backdrop-blur-lg ${
                  tier.highlight ? "bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 shadow-xl shadow-primary/25" : "bg-white/5"
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground shadow-lg">
                    Populaire
                  </span>
                )}

                <div className="space-y-2 text-center">
                  <h3 className="text-xl font-semibold">{tier.name}</h3>
                  <div className="text-4xl font-bold">{tier.price}</div>
                  <p className="text-sm text-muted-foreground">{tier.description}</p>
                </div>

                <ul className="mt-8 flex flex-1 flex-col gap-3 text-sm text-muted-foreground">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-left">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  size="lg"
                  className={`mt-10 rounded-full px-8 ${
                    tier.highlight ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-white/10 text-foreground hover:bg-white/20"
                  }`}
                >
                  <Link to={tier.name === "Studio" ? "/contact" : "/auth"}>{tier.cta}</Link>
                </Button>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="container px-4 pt-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="mx-auto max-w-4xl text-center space-y-4"
          >
            <h2 className="text-3xl font-bold md:text-4xl">Tout ce qu&apos;il faut pour passer de l&apos;idée à la vidéo</h2>
            <p className="text-lg text-muted-foreground">
              Des outils pensés pour les créateurs modernes : storyboard assisté par IA, audio génératif, templates de plans et exports rapides.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {featureHighlights.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Pricing;
