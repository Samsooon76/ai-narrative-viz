-- ============================================================================
-- STRIPE INTEGRATION - Subscription Management & Payment Processing
-- ============================================================================
-- This migration adds all tables and functions needed for Stripe integration
-- including subscription plans, user subscriptions, usage tracking, and payments

-- ============================================================================
-- 1. SUBSCRIPTION PLANS TABLE
-- ============================================================================
-- Stores the available subscription plans (Starter, Pro, Business)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, -- 'starter', 'pro', 'business', 'free'
  display_name text NOT NULL, -- 'Starter', 'Pro', 'Business', 'Free'
  description text,
  price_monthly numeric(10, 2) NOT NULL, -- Prix en euros (69.00, 129.00, 169.00, 0.00)
  stripe_price_id text, -- Prix ID de Stripe (price_xxxxx)
  stripe_product_id text, -- Product ID de Stripe (prod_xxxxx)
  video_quota integer NOT NULL, -- Nombre de vidéos par mois (10, 25, 50, 3)
  features jsonb DEFAULT '[]'::jsonb, -- Liste des fonctionnalités
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Tous peuvent voir les plans (pour la page pricing)
CREATE POLICY "Anyone can view active subscription plans"
  ON public.subscription_plans FOR SELECT
  USING (is_active = true);

-- Seulement les admins peuvent modifier les plans
CREATE POLICY "Only admins can manage subscription plans"
  ON public.subscription_plans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- 2. MODIFY PROFILES TABLE - Add Stripe fields
-- ============================================================================
-- Add Stripe-related columns to existing profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive'
    CHECK (subscription_status IN ('active', 'inactive', 'canceled', 'past_due', 'trialing')),
  ADD COLUMN IF NOT EXISTS current_plan_id uuid REFERENCES public.subscription_plans(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON public.profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);

-- ============================================================================
-- 3. SUBSCRIPTIONS TABLE
-- ============================================================================
-- Stores active and historical subscriptions for users
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) NOT NULL,
  stripe_subscription_id text UNIQUE NOT NULL, -- sub_xxxxx
  stripe_customer_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'trialing', 'unpaid')),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at_period_end boolean DEFAULT false,
  canceled_at timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only system (via Edge Functions) can manage subscriptions
CREATE POLICY "Service role can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 4. USAGE TRACKING TABLE
-- ============================================================================
-- Tracks video generation usage per user per billing period
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) NOT NULL,
  billing_period_start timestamptz NOT NULL,
  billing_period_end timestamptz NOT NULL,
  videos_generated integer DEFAULT 0 NOT NULL,
  videos_quota integer NOT NULL, -- Quota for this period
  last_video_generated_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, billing_period_start)
);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON public.usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_billing_period ON public.usage_tracking(billing_period_start, billing_period_end);

-- Users can view their own usage
CREATE POLICY "Users can view own usage"
  ON public.usage_tracking FOR SELECT
  USING (auth.uid() = user_id);

-- System can manage usage
CREATE POLICY "Service role can manage usage"
  ON public.usage_tracking FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 5. PAYMENT HISTORY TABLE
-- ============================================================================
-- Stores payment and invoice history
CREATE TABLE IF NOT EXISTS public.payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id text UNIQUE NOT NULL, -- in_xxxxx
  stripe_payment_intent_id text, -- pi_xxxxx
  amount numeric(10, 2) NOT NULL, -- Montant en euros
  currency text DEFAULT 'eur' NOT NULL,
  status text NOT NULL CHECK (status IN ('paid', 'open', 'void', 'uncollectible', 'draft')),
  invoice_pdf text, -- URL du PDF de facture Stripe
  invoice_url text, -- URL de la page de facture Stripe
  paid_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON public.payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_invoice_id ON public.payment_history(stripe_invoice_id);

-- Users can view their own payment history
CREATE POLICY "Users can view own payment history"
  ON public.payment_history FOR SELECT
  USING (auth.uid() = user_id);

-- System can manage payment history
CREATE POLICY "Service role can manage payment history"
  ON public.payment_history FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 6. FUNCTIONS - Usage & Quota Management
-- ============================================================================

-- Function: Check if user has remaining quota
CREATE OR REPLACE FUNCTION public.check_user_quota(p_user_id uuid)
RETURNS TABLE(
  has_quota boolean,
  videos_generated integer,
  videos_quota integer,
  plan_name text,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_usage record;
  v_current_plan record;
  v_subscription_status text;
BEGIN
  -- Get user's subscription status
  SELECT subscription_status INTO v_subscription_status
  FROM public.profiles
  WHERE id = p_user_id;

  -- Check if user has an active subscription
  IF v_subscription_status IS NULL OR v_subscription_status != 'active' THEN
    RETURN QUERY SELECT false, 0, 0, 'none'::text, 'No active subscription'::text;
    RETURN;
  END IF;

  -- Get current usage for the user
  SELECT * INTO v_current_usage
  FROM public.usage_tracking
  WHERE user_id = p_user_id
    AND billing_period_start <= now()
    AND billing_period_end >= now()
  ORDER BY billing_period_start DESC
  LIMIT 1;

  -- If no usage record found, create one
  IF v_current_usage IS NULL THEN
    -- Get user's current plan
    SELECT sp.* INTO v_current_plan
    FROM public.subscription_plans sp
    JOIN public.profiles p ON p.current_plan_id = sp.id
    WHERE p.id = p_user_id;

    IF v_current_plan IS NULL THEN
      RETURN QUERY SELECT false, 0, 0, 'none'::text, 'No plan found'::text;
      RETURN;
    END IF;

    -- Create new usage record for current billing period
    INSERT INTO public.usage_tracking (
      user_id,
      plan_id,
      billing_period_start,
      billing_period_end,
      videos_generated,
      videos_quota
    )
    SELECT
      p_user_id,
      v_current_plan.id,
      date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month' - interval '1 second',
      0,
      v_current_plan.video_quota
    RETURNING * INTO v_current_usage;
  END IF;

  -- Check if quota is available
  IF v_current_usage.videos_generated < v_current_usage.videos_quota THEN
    RETURN QUERY SELECT
      true,
      v_current_usage.videos_generated,
      v_current_usage.videos_quota,
      (SELECT name FROM public.subscription_plans WHERE id = v_current_usage.plan_id),
      'Quota available'::text;
  ELSE
    RETURN QUERY SELECT
      false,
      v_current_usage.videos_generated,
      v_current_usage.videos_quota,
      (SELECT name FROM public.subscription_plans WHERE id = v_current_usage.plan_id),
      'Monthly quota exceeded'::text;
  END IF;
END;
$$;

-- Function: Increment video count after successful generation
CREATE OR REPLACE FUNCTION public.increment_video_count(p_user_id uuid)
RETURNS TABLE(
  success boolean,
  new_count integer,
  quota integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_usage record;
BEGIN
  -- Update the current usage record
  UPDATE public.usage_tracking
  SET
    videos_generated = videos_generated + 1,
    last_video_generated_at = now(),
    updated_at = now()
  WHERE user_id = p_user_id
    AND billing_period_start <= now()
    AND billing_period_end >= now()
  RETURNING * INTO v_updated_usage;

  -- Check if update was successful
  IF v_updated_usage IS NULL THEN
    RETURN QUERY SELECT false, 0, 0;
  ELSE
    RETURN QUERY SELECT true, v_updated_usage.videos_generated, v_updated_usage.videos_quota;
  END IF;
END;
$$;

-- Function: Check if user has an active subscription
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = p_user_id
      AND status IN ('active', 'trialing')
      AND current_period_end > now()
  )
$$;

-- Function: Get user's current subscription details
CREATE OR REPLACE FUNCTION public.get_user_subscription(p_user_id uuid)
RETURNS TABLE(
  subscription_id uuid,
  plan_name text,
  plan_display_name text,
  status text,
  videos_generated integer,
  videos_quota integer,
  current_period_end timestamptz,
  cancel_at_period_end boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    sp.name,
    sp.display_name,
    s.status,
    COALESCE(ut.videos_generated, 0)::integer,
    COALESCE(ut.videos_quota, 0)::integer,
    s.current_period_end,
    s.cancel_at_period_end
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON s.plan_id = sp.id
  LEFT JOIN public.usage_tracking ut ON ut.user_id = s.user_id
    AND ut.billing_period_start <= now()
    AND ut.billing_period_end >= now()
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- 7. TRIGGERS - Auto-update timestamps
-- ============================================================================

-- Trigger for subscription_plans
CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for subscriptions
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for usage_tracking
CREATE TRIGGER usage_tracking_updated_at
  BEFORE UPDATE ON public.usage_tracking
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 8. INSERT DEFAULT SUBSCRIPTION PLANS
-- ============================================================================
-- Insert the 4 default plans (Free, Starter, Pro, Business)

INSERT INTO public.subscription_plans (name, display_name, description, price_monthly, video_quota, features, is_active)
VALUES
  (
    'free',
    'Free',
    'Plan gratuit pour découvrir VideoAI Studio',
    0.00,
    3,
    '["3 vidéos d''essai", "Génération de scripts IA", "Exports en qualité standard", "Support communautaire"]'::jsonb,
    true
  ),
  (
    'starter',
    'Starter',
    'Idéal pour les créateurs qui commencent et veulent explorer les possibilités du studio',
    69.00,
    10,
    '["10 vidéos/mois", "Génération de scripts IA", "Voix Cartesia TTS", "Exports vidéo haute qualité", "Bibliothèque de templates", "Support par email"]'::jsonb,
    true
  ),
  (
    'pro',
    'Pro',
    'Pour les créateurs et petites équipes qui produisent régulièrement des contenus',
    129.00,
    25,
    '["25 vidéos/mois", "Tous les templates", "Voix IA premium", "Collaboration en temps réel", "Exports 4K illimités", "Support prioritaire", "Analytics avancées"]'::jsonb,
    true
  ),
  (
    'business',
    'Business',
    'Pour les agences, studios et équipes en production intensive',
    169.00,
    50,
    '["50 vidéos/mois", "Onboarding personnalisé", "Intégrations API", "Brand kit étendu", "SLA et support dédié", "Formation des équipes", "Factures mensuelles"]'::jsonb,
    true
  )
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 9. MIGRATION SCRIPT - Assign Free plan to existing users
-- ============================================================================
-- Assign the Free plan to all existing users who don't have a subscription

DO $$
DECLARE
  v_free_plan_id uuid;
BEGIN
  -- Get the Free plan ID
  SELECT id INTO v_free_plan_id
  FROM public.subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  -- Update all existing profiles without a plan to use the Free plan
  UPDATE public.profiles
  SET
    current_plan_id = v_free_plan_id,
    subscription_status = 'active'
  WHERE current_plan_id IS NULL;

  -- Create usage tracking for existing users with Free plan
  INSERT INTO public.usage_tracking (
    user_id,
    plan_id,
    billing_period_start,
    billing_period_end,
    videos_generated,
    videos_quota
  )
  SELECT
    p.id,
    v_free_plan_id,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month' - interval '1 second',
    0,
    3
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.usage_tracking ut
    WHERE ut.user_id = p.id
  );
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- To complete Stripe integration:
-- 1. Set environment variables in Supabase:
--    - STRIPE_SECRET_KEY
--    - STRIPE_PUBLISHABLE_KEY
--    - STRIPE_WEBHOOK_SECRET
--
-- 2. Update stripe_price_id and stripe_product_id in subscription_plans table
--    after creating products in Stripe Dashboard
--
-- 3. Deploy Edge Functions:
--    - stripe-checkout
--    - stripe-webhook
--    - stripe-portal
--    - check-subscription
--
-- 4. Configure Stripe webhook endpoint:
--    https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook
-- ============================================================================
