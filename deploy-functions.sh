#!/bin/bash

# ============================================================================
# Script de déploiement des Edge Functions Supabase
# ============================================================================
# Ce script déploie toutes les Edge Functions nécessaires pour Stripe
#
# Prérequis :
# - Supabase CLI installée (npm install -g supabase)
# - Projet lié (supabase link --project-ref your-ref)
# - Authentifié (supabase login)
# ============================================================================

set -e  # Arrêter en cas d'erreur

echo "🚀 Déploiement des Edge Functions Supabase..."
echo ""

# Couleurs pour les logs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Fonction pour déployer une Edge Function
deploy_function() {
    local func_name=$1
    echo -e "${BLUE}📦 Déploiement de ${func_name}...${NC}"

    if supabase functions deploy "$func_name"; then
        echo -e "${GREEN}✅ ${func_name} déployée avec succès${NC}"
        echo ""
    else
        echo -e "${RED}❌ Erreur lors du déploiement de ${func_name}${NC}"
        echo ""
        return 1
    fi
}

# Vérifier que Supabase CLI est installée
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI n'est pas installée${NC}"
    echo "Installez-la avec : npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI détectée"
echo ""

# Vérifier que le projet est lié
if [ ! -f ".supabase/config.toml" ]; then
    echo -e "${RED}❌ Projet non lié${NC}"
    echo "Liez votre projet avec : supabase link --project-ref your-ref"
    exit 1
fi

echo "✅ Projet lié détecté"
echo ""

# Déployer les nouvelles Edge Functions Stripe
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Déploiement des fonctions Stripe"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

deploy_function "stripe-checkout"
deploy_function "stripe-webhook"
deploy_function "stripe-portal"
deploy_function "check-subscription"

# Déployer les fonctions de génération modifiées (avec middleware)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Mise à jour des fonctions de génération"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

deploy_function "generate-script"
deploy_function "generate-image"
deploy_function "generate-voice"
deploy_function "generate-video"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Déploiement terminé avec succès !${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Afficher les prochaines étapes
echo "📋 Prochaines étapes :"
echo ""
echo "1. Configurer les secrets Supabase :"
echo "   supabase secrets set STRIPE_SECRET_KEY=sk_test_..."
echo "   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_..."
echo "   supabase secrets set OPENAI_API_KEY=sk-..."
echo "   supabase secrets set CARTESIA_API_KEY=..."
echo "   supabase secrets set FAL_KEY=..."
echo ""
echo "2. Configurer le webhook Stripe :"
echo "   URL: https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook"
echo ""
echo "3. Appliquer les migrations de base de données :"
echo "   supabase db push"
echo ""
echo "4. Tester l'intégration avec les cartes de test Stripe"
echo ""
