# 🚀 Guide de déploiement - Intégration Stripe

Ce guide vous accompagne étape par étape dans le déploiement complet de l'intégration Stripe pour VideoAI Studio.

---

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir :

- ✅ Un compte Supabase (gratuit sur [supabase.com](https://supabase.com))
- ✅ Un compte Stripe (gratuit sur [stripe.com](https://stripe.com))
- ✅ Node.js et npm installés
- ✅ Supabase CLI installée : `npm install -g supabase`
- ✅ Git et le code du projet à jour

---

## 🗄️ Étape 1 : Configuration de la base de données

### 1.1 Se connecter à Supabase CLI

```bash
# Se connecter à Supabase
supabase login

# Lier votre projet
cd /home/user/ai-narrative-viz
supabase link --project-ref your-project-ref
```

**💡 Trouver votre project-ref :**
- Allez dans Supabase Dashboard
- Sélectionnez votre projet
- Settings → General → Reference ID

### 1.2 Appliquer les migrations

```bash
# Appliquer toutes les migrations (y compris Stripe)
supabase db push
```

Cette commande va créer :
- 4 nouvelles tables (subscription_plans, subscriptions, usage_tracking, payment_history)
- Ajouter les colonnes Stripe dans la table profiles
- Créer 5 fonctions SQL helpers
- Configurer les politiques RLS
- Insérer les 4 plans par défaut (Free, Starter, Pro, Business)

**⚠️ Vérification :**
```sql
-- Dans Supabase Dashboard > SQL Editor
SELECT * FROM subscription_plans ORDER BY price_monthly;
```

Vous devriez voir 4 plans : Free (0€), Starter (69€), Pro (129€), Business (169€).

---

## 💳 Étape 2 : Configuration Stripe

### 2.1 Créer les produits Stripe

1. Allez dans **Stripe Dashboard** → **Products**
2. Cliquez sur **Add product**
3. Créez 3 produits (pas besoin de créer "Free") :

**Produit 1 : Starter**
- Nom : `VideoAI Starter`
- Description : `10 vidéos/mois avec IA`
- Prix : `69.00 EUR` (récurrent, mensuel)
- Notez le **Price ID** (commence par `price_`)
- Notez le **Product ID** (commence par `prod_`)

**Produit 2 : Pro**
- Nom : `VideoAI Pro`
- Description : `25 vidéos/mois avec IA premium`
- Prix : `129.00 EUR` (récurrent, mensuel)
- Notez le **Price ID** et **Product ID**

**Produit 3 : Business**
- Nom : `VideoAI Business`
- Description : `50 vidéos/mois avec support dédié`
- Prix : `169.00 EUR` (récurrent, mensuel)
- Notez le **Price ID** et **Product ID**

### 2.2 Mettre à jour la base de données avec les IDs Stripe

```sql
-- Dans Supabase Dashboard > SQL Editor
-- Remplacez les valeurs par vos vrais IDs Stripe

UPDATE subscription_plans
SET
  stripe_price_id = 'price_xxxxxxxxxxxxx',
  stripe_product_id = 'prod_xxxxxxxxxxxxx'
WHERE name = 'starter';

UPDATE subscription_plans
SET
  stripe_price_id = 'price_xxxxxxxxxxxxx',
  stripe_product_id = 'prod_xxxxxxxxxxxxx'
WHERE name = 'pro';

UPDATE subscription_plans
SET
  stripe_price_id = 'price_xxxxxxxxxxxxx',
  stripe_product_id = 'prod_xxxxxxxxxxxxx'
WHERE name = 'business';
```

**⚠️ Vérification :**
```sql
SELECT name, stripe_price_id, stripe_product_id
FROM subscription_plans
WHERE stripe_price_id IS NOT NULL;
```

---

## 🔐 Étape 3 : Configuration des secrets

### 3.1 Récupérer les clés API

**Stripe :**
- Dashboard → Developers → API keys
- Copier la **Secret key** (commence par `sk_test_` en mode test)

**OpenAI :**
- [platform.openai.com](https://platform.openai.com/api-keys)

**Cartesia AI :**
- [cartesia.ai](https://cartesia.ai/)

**Fal.ai :**
- [fal.ai/dashboard](https://fal.ai/dashboard)

### 3.2 Configurer les secrets Supabase

```bash
# Secrets pour les Edge Functions
supabase secrets set STRIPE_SECRET_KEY="sk_test_xxxxxxxxxxxxx"
supabase secrets set OPENAI_API_KEY="sk-xxxxxxxxxxxxx"
supabase secrets set CARTESIA_API_KEY="xxxxxxxxxxxxx"
supabase secrets set FAL_KEY="xxxxxxxxxxxxx"

# Note : STRIPE_WEBHOOK_SECRET sera configuré après la création du webhook
```

**⚠️ Vérification :**
```bash
supabase secrets list
```

---

## ⚡ Étape 4 : Déploiement des Edge Functions

### 4.1 Utiliser le script automatique

```bash
# Rendre le script exécutable (si ce n'est pas déjà fait)
chmod +x deploy-functions.sh

# Exécuter le déploiement
./deploy-functions.sh
```

### 4.2 Ou déployer manuellement

```bash
# Nouvelles fonctions Stripe
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
supabase functions deploy check-subscription

# Fonctions de génération mises à jour (avec middleware)
supabase functions deploy generate-script
supabase functions deploy generate-image
supabase functions deploy generate-voice
supabase functions deploy generate-video
```

**⚠️ Vérification :**
```bash
supabase functions list
```

Vous devriez voir 8 fonctions déployées.

---

## 🔔 Étape 5 : Configuration du webhook Stripe

### 5.1 Créer le webhook endpoint

1. Allez dans **Stripe Dashboard** → **Developers** → **Webhooks**
2. Cliquez sur **Add endpoint**
3. **Endpoint URL** :
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
   ```
   *(Remplacez `YOUR_PROJECT_REF` par votre vrai project ref)*

4. **Events to send** : Sélectionnez les événements suivants :
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.payment_succeeded`
   - ✅ `invoice.payment_failed`

5. Cliquez sur **Add endpoint**

### 5.2 Récupérer le webhook secret

1. Après création, cliquez sur le webhook que vous venez de créer
2. Section **Signing secret** → Cliquez sur **Reveal**
3. Copiez la valeur (commence par `whsec_`)

### 5.3 Configurer le secret webhook

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxx"
```

**⚠️ Important :** Le webhook ne fonctionnera pas sans ce secret !

---

## 🌐 Étape 6 : Configuration Frontend

### 6.1 Créer le fichier .env.local

```bash
# À la racine du projet
cp .env.example .env.local
```

### 6.2 Remplir les variables

Éditez `.env.local` avec vos vraies valeurs :

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhb...

# Stripe (Frontend)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
```

**💡 Où trouver ces valeurs :**
- Supabase : Dashboard → Settings → API
- Stripe : Dashboard → Developers → API keys (Publishable key)

---

## 🧪 Étape 7 : Tests

### 7.1 Démarrer l'application

```bash
npm install  # Si pas déjà fait
npm run dev
```

### 7.2 Tester le flux complet

1. **Inscription/Connexion**
   - Allez sur `/auth`
   - Créez un compte ou connectez-vous
   - Vérifiez que vous êtes redirigé vers `/dashboard`
   - Vous devriez voir "Plan Free" avec "3 vidéos"

2. **Page Pricing**
   - Allez sur `/pricing`
   - Vérifiez que les 3 plans s'affichent
   - Cliquez sur "Commencer" (Starter)
   - Vous devriez être redirigé vers `/checkout/starter`

3. **Page Checkout**
   - Vérifiez les détails du plan
   - Prix, fonctionnalités, récapitulatif
   - Cliquez sur "Passer au paiement"
   - Vous devriez être redirigé vers Stripe

4. **Paiement Stripe (mode test)**
   - Utilisez la carte de test : `4242 4242 4242 4242`
   - Date : n'importe quelle date future (ex: 12/25)
   - CVC : n'importe quels 3 chiffres (ex: 123)
   - Email : votre email de test
   - Complétez le paiement

5. **Retour Dashboard**
   - Vous devriez être redirigé vers `/dashboard?success=true`
   - Toast de succès affiché
   - Le widget SubscriptionStatus affiche votre nouveau plan
   - Quota mis à jour (ex: 0/10 vidéos pour Starter)

6. **CreateVideo**
   - Allez sur `/create`
   - Vérifiez le badge quota en haut : "0/10 vidéos ce mois"
   - Badge vert = quota OK

7. **Génération de vidéo**
   - Créez un projet
   - Générez un script
   - Le middleware vérifie automatiquement le quota
   - Après génération complète, le compteur s'incrémente
   - Retournez sur Dashboard : "1/10 vidéos"

8. **Portail client Stripe**
   - Sur Dashboard, cliquez "Gérer mon abonnement"
   - Vous êtes redirigé vers le portail Stripe
   - Vous pouvez voir vos factures, changer de plan, annuler

### 7.3 Tester le dépassement de quota

Pour tester rapidement :

```sql
-- Dans Supabase SQL Editor
-- Simuler un utilisateur qui a atteint son quota
UPDATE usage_tracking
SET videos_generated = 10
WHERE user_id = 'YOUR_USER_ID';
```

- Retournez sur `/create`
- Badge rouge : "10/10 vidéos ce mois"
- Tentez de générer → Erreur 429 "Quota mensuel atteint"
- Modal QuotaLimitModal devrait s'afficher

---

## 🐛 Dépannage

### Problème : Webhook ne fonctionne pas

**Solutions :**
1. Vérifier que `STRIPE_WEBHOOK_SECRET` est configuré
2. Vérifier l'URL du webhook dans Stripe Dashboard
3. Tester le webhook avec Stripe CLI :
   ```bash
   stripe listen --forward-to https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook
   ```

### Problème : Erreur 401 lors de la génération

**Solutions :**
1. Vérifier que l'utilisateur est bien connecté
2. Vérifier les tokens dans le localStorage
3. Vérifier les logs Supabase : Dashboard → Edge Functions → Logs

### Problème : Quota ne s'incrémente pas

**Solutions :**
1. Vérifier que `generate-video` a bien été redéployée
2. Vérifier les logs de la fonction
3. Vérifier que la vidéo est bien générée complètement (pas d'erreur)

### Problème : Price IDs invalides

**Solutions :**
1. Vérifier que les Price IDs dans `subscription_plans` correspondent à Stripe
2. Les IDs doivent commencer par `price_`
3. Mode test vs live : bien utiliser `price_test_` en développement

---

## 📊 Monitoring

### Vérifier les logs Edge Functions

```bash
# Logs en temps réel
supabase functions logs stripe-webhook --follow
supabase functions logs check-subscription --follow
```

### Vérifier l'état des abonnements

```sql
-- Dans Supabase SQL Editor
SELECT
  p.email,
  sp.display_name as plan,
  s.status,
  ut.videos_generated,
  ut.videos_quota,
  s.current_period_end
FROM profiles p
LEFT JOIN subscriptions s ON s.user_id = p.id
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
LEFT JOIN usage_tracking ut ON ut.user_id = p.id
WHERE p.email = 'votre-email@example.com';
```

---

## ✅ Checklist finale

Avant de passer en production :

- [ ] Migrations appliquées et vérifiées
- [ ] 3 produits créés dans Stripe avec les bons prix
- [ ] Price IDs mis à jour dans `subscription_plans`
- [ ] Tous les secrets configurés (5 au total)
- [ ] 8 Edge Functions déployées
- [ ] Webhook Stripe configuré avec le bon secret
- [ ] `.env.local` configuré avec les bonnes clés
- [ ] Tests de bout en bout réussis
- [ ] Paiement test réussi avec carte 4242...
- [ ] Quota s'incrémente après génération
- [ ] SubscriptionStatus affiche correctement
- [ ] QuotaLimitModal fonctionne quand limite atteinte
- [ ] Portail Stripe accessible depuis Dashboard

---

## 🎯 Passage en production

Une fois les tests validés en mode test :

1. **Créer les produits en mode live** dans Stripe Dashboard
2. **Mettre à jour** `subscription_plans` avec les nouveaux Price IDs live
3. **Reconfigurer les secrets** avec les clés live :
   ```bash
   supabase secrets set STRIPE_SECRET_KEY="sk_live_xxxxx"
   supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_live_xxxxx"
   ```
4. **Créer un nouveau webhook** en mode live
5. **Mettre à jour** `.env.local` (ou variables d'environnement de production) :
   ```env
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
   ```
6. **Déployer** le frontend en production
7. **Tester** avec une vraie carte pour vérifier

---

## 📚 Ressources

- [Documentation Stripe](https://stripe.com/docs)
- [Documentation Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Cartes de test Stripe](https://stripe.com/docs/testing)
- [Webhooks Stripe](https://stripe.com/docs/webhooks)

---

**Bon déploiement ! 🚀**

En cas de problème, consultez les logs Supabase et Stripe pour identifier l'erreur.
