# VideoAI Studio

> Plateforme de création vidéo intelligente propulsée par l'IA

Une application web complète permettant de générer automatiquement des vidéos professionnelles à partir d'une simple description : scripts, voix-off, visuels et montage automatisés grâce à l'intelligence artificielle.

---

## Table des matières

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Installation](#installation)
- [Configuration](#configuration)
- [Structure du projet](#structure-du-projet)
- [Utilisation](#utilisation)
- [API et intégrations](#api-et-intégrations)
- [Déploiement](#déploiement)
- [Contribution](#contribution)

---

## Aperçu

**VideoAI Studio** transforme vos idées en vidéos professionnelles en quelques minutes. Plus besoin de compétences techniques en montage ou en scénarisation - l'IA s'occupe de tout :

- 📝 Génération automatique de scripts structurés (16-18 scènes)
- 🎙️ Voix-off naturelle en français via Cartesia AI
- 🎨 Création d'images cohérentes avec Fal.ai
- ⏱️ Timeline interactive pour l'édition fine
- 🎬 Export multi-formats (16:9, 9:16, 1:1)

### Flux utilisateur

```
Brief → Script IA → Génération voix → Création visuels → Timeline → Export vidéo
```

---

## Fonctionnalités

### 🤖 Génération de contenu IA

| Fonctionnalité | Description | Service |
|----------------|-------------|---------|
| **Script intelligent** | Scénarios complets avec narration, descriptions visuelles et ambiances sonores | OpenAI GPT-4 |
| **Voix-off naturelle** | Synthèse vocale réaliste en français/anglais | Cartesia AI |
| **Images IA** | 4 variantes par scène avec styles artistiques cohérents | Fal.ai |
| **Montage automatique** | Composition vidéo avec synchronisation audio/image | Fal.ai |

### 🎬 Studio de création

- **Timeline avancée** : Visualisation waveform, édition drag-and-drop, grille temporelle
- **Gestion multi-projets** : Création, sauvegarde et reprise de projets
- **Sélection d'images** : Choix parmi 4 variantes générées par scène
- **Durée ajustable** : Configuration de la durée par scène (défaut : 8s)
- **Styles visuels** : Arcane, Digital Noir, Nano Banana anime, etc.

### 👤 Gestion utilisateur

- **Authentification sécurisée** : Email/mot de passe via Supabase Auth
- **Tableau de bord** : Vue d'ensemble de tous vos projets
- **Profils utilisateur** : Gestion compte et paramètres
- **Rôles** : Système user/admin avec Row-Level Security

### 💎 Tarification

| Plan | Prix/mois | Vidéos | Fonctionnalités |
|------|-----------|--------|-----------------|
| Starter | 69€ | 10 | Génération IA basique, support email |
| Pro | 129€ | 25 | Templates avancés, collaboration temps réel, export 4K |
| Business | 169€ | 50 | Accès API, support dédié, SLA |

---

## Architecture

### Schéma global

```
Frontend (React/TypeScript/Vite)
         ↓
Supabase (Auth + Database + Storage + Edge Functions)
         ↓
Services externes :
  - OpenAI (scripts)
  - Cartesia AI (voix)
  - Fal.ai (images + vidéo)
```

### Base de données

**Tables principales :**

- `profiles` - Profils utilisateurs
- `video_projects` - Projets vidéo (script, images, statut, URLs)
- `user_roles` - Gestion des rôles (user/admin)
- `animations` - Données d'animation par scène

**Buckets de stockage :**

- `generated-images` - Images générées par l'IA
- `animation_videos` - Clips vidéo finaux

### Edge Functions

5 fonctions Deno serverless déployées sur Supabase :

| Fonction | Rôle | API |
|----------|------|-----|
| `generate-script` | Génère le scénario complet | OpenAI GPT-4 |
| `generate-prompts` | Traduit les scènes en prompts visuels | OpenAI |
| `generate-image` | Crée 4 variantes d'images par scène | Fal.ai |
| `generate-voice` | Synthèse vocale de la narration | Cartesia AI |
| `generate-video` | Composition vidéo finale FFmpeg | Fal.ai |

---

## Stack technique

### Frontend

- **React 18** - Bibliothèque UI
- **TypeScript** - Typage statique
- **Vite** - Build tool ultra-rapide
- **React Router** - Navigation SPA
- **TanStack Query** - Gestion d'état serveur et cache
- **shadcn-ui** - Composants UI avec Radix
- **Tailwind CSS** - Styling utility-first
- **Framer Motion** - Animations fluides
- **Lucide React** - Icônes

### Backend

- **Supabase** - BaaS (PostgreSQL + Auth + Storage + Functions)
- **Deno** - Runtime pour Edge Functions
- **PostgreSQL** - Base de données relationnelle
- **Row-Level Security (RLS)** - Sécurité granulaire

### IA & Médias

- **OpenAI** - GPT-4 pour génération de contenu
- **Cartesia AI** - TTS naturel (voix française)
- **Fal.ai** - Génération d'images et rendering vidéo
- **FFmpeg** - Composition vidéo côté serveur

### DevOps

- **Git** - Contrôle de version
- **ESLint** - Linting TypeScript/React
- **Vite Build** - Bundle optimisé pour production

---

## Installation

### Prérequis

- **Node.js** 18+ (recommandé via [nvm](https://github.com/nvm-sh/nvm))
- **npm** ou **yarn**
- **Compte Supabase** (gratuit sur [supabase.com](https://supabase.com))
- **Clés API** :
  - OpenAI API Key
  - Cartesia API Key
  - Fal.ai API Key

### Étapes d'installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/votre-username/ai-narrative-viz.git
cd ai-narrative-viz

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env.local

# 4. Lancer le serveur de développement
npm run dev
```

Le serveur démarre sur `http://localhost:5173`

---

## Configuration

### 1. Variables d'environnement frontend

Créez un fichier `.env.local` à la racine :

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=votre_cle_publique_supabase
```

### 2. Secrets Supabase

Configurez les secrets pour les Edge Functions :

```bash
# Se connecter à Supabase CLI
supabase login

# Lier votre projet
supabase link --project-ref votre-ref-projet

# Définir les secrets
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set CARTESIA_API_KEY=...
supabase secrets set FAL_KEY=...
```

### 3. Configuration Cartesia

La voix par défaut est configurée dans `generate-voice/index.ts` :

```typescript
const CARTESIA_VOICE_ID = "bd94e5a0-2b7a-4762-9b91-6eac6342f852"; // Voix française
```

### 4. Base de données Supabase

#### Créer les tables

Exécutez les migrations SQL depuis le dashboard Supabase ou via CLI :

```bash
supabase db push
```

**Schéma minimal requis :**

```sql
-- Table profiles
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table video_projects
CREATE TABLE video_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  script JSONB,
  status TEXT CHECK (status IN ('draft', 'generating', 'completed', 'failed')),
  audio_url TEXT,
  images_data JSONB,
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-Level Security
ALTER TABLE video_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON video_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON video_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON video_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON video_projects FOR DELETE
  USING (auth.uid() = user_id);
```

#### Créer les buckets de stockage

```sql
-- Bucket pour les images générées (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-images', 'generated-images', true);

-- Bucket pour les vidéos (privé)
INSERT INTO storage.buckets (id, name, public)
VALUES ('animation_videos', 'animation_videos', false);
```

---

## Structure du projet

```
ai-narrative-viz/
├── src/
│   ├── components/
│   │   ├── ui/              # Composants shadcn-ui (boutons, dialogs, etc.)
│   │   ├── auth/            # AuthModal pour login/signup
│   │   ├── layout/          # PageShell, navigation
│   │   ├── Aurora.tsx       # Fond animé WebGL
│   │   ├── VideoTimeline.tsx  # Timeline interactive (1500+ lignes)
│   │   └── LandingProcess.tsx # Animation processus sur landing
│   ├── pages/
│   │   ├── Index.tsx        # Landing page avec hero
│   │   ├── Auth.tsx         # Page d'authentification
│   │   ├── Dashboard.tsx    # Tableau de bord projets
│   │   ├── CreateVideo.tsx  # Studio de création (core)
│   │   ├── HowItWorks.tsx   # Explication du processus
│   │   ├── Pricing.tsx      # Plans tarifaires
│   │   ├── Account.tsx      # Profil utilisateur
│   │   └── NotFound.tsx     # Page 404
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts    # Client Supabase
│   │       └── types.ts     # Types auto-générés
│   ├── lib/
│   │   ├── auth.tsx         # Provider d'authentification
│   │   ├── auth-context.ts  # Context Auth
│   │   └── utils.ts         # Helpers (cn, etc.)
│   ├── hooks/
│   │   ├── use-auth.ts      # Hook d'authentification
│   │   └── use-toast.ts     # Notifications toast
│   ├── App.tsx              # Routes principales
│   └── main.tsx             # Point d'entrée React
├── supabase/
│   └── functions/
│       ├── generate-script/     # Génération scripts OpenAI
│       ├── generate-prompts/    # Prompts visuels
│       ├── generate-image/      # Images Fal.ai
│       ├── generate-voice/      # TTS Cartesia
│       └── generate-video/      # Rendering vidéo
├── public/                  # Assets statiques
├── package.json             # Dépendances npm
├── vite.config.ts          # Configuration Vite
├── tailwind.config.js      # Configuration Tailwind
└── tsconfig.json           # Configuration TypeScript
```

---

## Utilisation

### Créer votre première vidéo

1. **Inscription** : Créez un compte sur `/auth`
2. **Nouveau projet** : Cliquez sur "Créer un projet" dans le dashboard
3. **Brief** : Décrivez votre vidéo (ex: "Une vidéo sur l'intelligence artificielle")
4. **Style visuel** : Choisissez un style (Arcane, Noir numérique, etc.)
5. **Génération** :
   - Script généré automatiquement (16-18 scènes)
   - Voix-off synthétisée pour chaque scène
   - 4 variantes d'images par scène
6. **Timeline** : Ajustez les durées, sélectionnez les images préférées
7. **Export** : Générez la vidéo finale en 16:9, 9:16 ou 1:1

### Gestion des projets

```typescript
// Tous les projets sont automatiquement sauvegardés dans Supabase
// État du projet :
type ProjectStatus = 'draft' | 'generating' | 'completed' | 'failed';

// Accéder à vos projets depuis le dashboard :
const { data: projects } = useQuery({
  queryKey: ['video-projects'],
  queryFn: async () => {
    const { data } = await supabase
      .from('video_projects')
      .select('*')
      .order('created_at', { ascending: false });
    return data;
  }
});
```

### Timeline interactive

Le composant `VideoTimeline` offre :

- **Grille temporelle** : 80 pixels par seconde
- **Waveform audio** : Visualisation des formes d'onde
- **Drag & drop** : Repositionner les clips audio
- **Playhead scrubbing** : Navigation temporelle
- **Édition durée** : Ajuster chaque scène individuellement
- **Sélection d'images** : Choisir parmi 4 variantes IA

**Constantes clés :**

```typescript
const PIXELS_PER_SECOND = 80;
const DEFAULT_SCENE_DURATION = 8; // secondes
const MIN_CLIP_WIDTH = 96; // pixels
```

---

## API et intégrations

### OpenAI (Scripts & Prompts)

**Endpoint** : `generate-script`

```typescript
// Appel depuis le frontend
const { data } = await supabase.functions.invoke('generate-script', {
  body: {
    topic: "Intelligence artificielle",
    visualStyle: "Arcane"
  }
});

// Structure de réponse
interface ScriptResponse {
  title: string;
  music: string;
  scenes: Array<{
    scene_number: number;
    title: string;
    visual: string;
    narration: string;
    audio_description: string;
  }>;
}
```

### Cartesia AI (Text-to-Speech)

**Endpoint** : `generate-voice`

```typescript
const { data } = await supabase.functions.invoke('generate-voice', {
  body: { narration: "Texte à synthétiser" }
});

// Retourne un fichier WAV en base64
const audioBlob = base64ToBlob(data.audio, 'audio/wav');
```

**Configuration voix :**
- Voice ID : `bd94e5a0-2b7a-4762-9b91-6eac6342f852`
- Modèle : `sonic-english`
- Sample rate : 44100 Hz
- Format : PCM F32LE

### Fal.ai (Images & Vidéo)

**Endpoint image** : `generate-image`

```typescript
const { data } = await supabase.functions.invoke('generate-image', {
  body: {
    prompt: "Description visuelle détaillée",
    style: "Arcane",
    count: 4  // 4 variantes
  }
});

// Retourne 4 URLs d'images
interface ImageResponse {
  images: Array<{ url: string }>;
}
```

**Endpoint vidéo** : `generate-video`

```typescript
const { data } = await supabase.functions.invoke('generate-video', {
  body: {
    scenes: [
      {
        imageUrl: "https://...",
        audioUrl: "https://...",
        startTime: 0,
        duration: 8
      }
    ],
    resolution: "1080p",
    aspectRatio: "16:9"
  }
});
```

### Gestion des erreurs

```typescript
try {
  const { data, error } = await supabase.functions.invoke('generate-script', {
    body: { topic: "..." }
  });

  if (error) throw error;

  return data;
} catch (error) {
  // Extraction du message d'erreur de l'Edge Function
  const message = error?.context?.body?.error || "Erreur inconnue";

  toast({
    variant: "destructive",
    title: "Erreur de génération",
    description: message
  });
}
```

---

## Déploiement

### Frontend (Vite)

#### Vercel

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel

# Variables d'environnement sur Vercel dashboard :
# VITE_SUPABASE_URL=https://...
# VITE_SUPABASE_PUBLISHABLE_KEY=...
```

#### Netlify

```bash
# Build de production
npm run build

# Le dossier dist/ est prêt pour Netlify
# Ou utilisez le drag-and-drop sur app.netlify.com
```

**Configuration Netlify** (`netlify.toml`) :

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Backend (Supabase Edge Functions)

```bash
# Déployer toutes les fonctions
supabase functions deploy generate-script
supabase functions deploy generate-prompts
supabase functions deploy generate-image
supabase functions deploy generate-voice
supabase functions deploy generate-video

# Vérifier le statut
supabase functions list
```

### Base de données

```bash
# Appliquer les migrations en production
supabase db push --linked

# Générer les types TypeScript
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

---

## Scripts npm

```json
{
  "dev": "vite",                    // Serveur de développement
  "build": "vite build",            // Build de production
  "build:dev": "vite build --mode development", // Build dev
  "lint": "eslint .",               // Linter
  "preview": "vite preview"         // Prévisualiser le build
}
```

---

## Sécurité

### Row-Level Security (RLS)

Toutes les tables sensibles ont des politiques RLS activées :

- Les utilisateurs ne peuvent voir que leurs propres projets
- Les admins ont accès à tous les projets
- Les profils sont restreints par utilisateur

### Gestion des secrets

- ⚠️ **Ne jamais commit** les clés API dans le code
- Utiliser `supabase secrets set` pour les Edge Functions
- Variables d'environnement Vite avec préfixe `VITE_` pour le frontend
- Fichier `.env.local` ajouté dans `.gitignore`

### Authentification

- Tokens JWT automatiquement gérés par Supabase
- Refresh automatique des sessions
- Déconnexion automatique après expiration
- Support OAuth (Google, GitHub) prêt à activer

---

## Contribution

Les contributions sont les bienvenues ! Voici comment contribuer :

1. **Fork** le projet
2. **Créer** une branche : `git checkout -b feature/ma-fonctionnalite`
3. **Commit** : `git commit -m "feat: Ajout fonctionnalité X"`
4. **Push** : `git push origin feature/ma-fonctionnalite`
5. **Ouvrir** une Pull Request

### Conventions de commit

Suivez les [Conventional Commits](https://www.conventionalcommits.org/fr/) :

- `feat:` Nouvelle fonctionnalité
- `fix:` Correction de bug
- `docs:` Documentation
- `style:` Formatage
- `refactor:` Refactorisation
- `test:` Ajout de tests
- `chore:` Tâches de maintenance

---

## License

Ce projet est sous licence **MIT**.

---

## Support

- 📧 Email : support@videoai-studio.com
- 📝 Issues : [GitHub Issues](https://github.com/votre-username/ai-narrative-viz/issues)
- 📚 Documentation : [Docs Supabase](https://supabase.com/docs)

---

## Remerciements

- [Supabase](https://supabase.com) - Backend-as-a-Service
- [shadcn-ui](https://ui.shadcn.com) - Composants UI élégants
- [OpenAI](https://openai.com) - Intelligence artificielle
- [Cartesia AI](https://cartesia.ai) - Synthèse vocale
- [Fal.ai](https://fal.ai) - Génération d'images et vidéos

---

**Développé avec ❤️ en utilisant React, TypeScript, Supabase et l'IA**
