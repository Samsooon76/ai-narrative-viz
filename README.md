# VideoAI - Créez des vidéos avec l'IA

Application web permettant de générer automatiquement des scripts, voix et visuels pour créer des vidéos professionnelles grâce à l'intelligence artificielle.

## Technologies utilisées

Ce projet utilise :

- **Vite** - Build tool et serveur de développement
- **TypeScript** - Langage de programmation
- **React** - Bibliothèque UI
- **shadcn-ui** - Composants UI
- **Tailwind CSS** - Framework CSS
- **Supabase** - Backend et base de données
- **OpenAI GPT** - Génération de scripts et prompts d'images

## Installation et développement

### Prérequis

- Node.js (recommandé via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- npm ou yarn

### Installation

```sh
# Installer les dépendances
npm install

# Démarrer le serveur de développement
npm run dev
```

## Configuration

### Secrets Supabase

Assurez-vous que les secrets suivants sont configurés dans Supabase :

```sh
supabase secrets set OPENAI_API_KEY=votre_cle_api_openai
```

## Déploiement

Les fonctions Edge Supabase se déploient avec :

```sh
supabase functions deploy generate-script
supabase functions deploy generate-image
supabase functions deploy generate-video
```
