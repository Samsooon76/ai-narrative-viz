import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

serve(async (req) => {
  try {
    // Initialize Stripe
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeSecretKey || !webhookSecret) {
      throw new Error("Missing Stripe configuration");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify webhook signature
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("No signature provided");
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider()
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(
        JSON.stringify({ error: "Webhook signature verification failed" }),
        { status: 400 }
      );
    }

    console.log(`Received event: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session, supabase);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription, supabase);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription, supabase);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice, supabase);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice, supabase);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});

// Handle checkout session completed
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabase: any
) {
  const userId = session.metadata?.supabase_user_id;
  const planId = session.metadata?.plan_id;

  if (!userId || !planId) {
    console.error("Missing user_id or plan_id in session metadata");
    return;
  }

  console.log(
    `Checkout completed for user ${userId}, subscription: ${session.subscription}`
  );

  // The subscription will be handled by the subscription.created event
  // Just update the customer ID if needed
  if (session.customer) {
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: session.customer as string })
      .eq("id", userId);
  }
}

// Handle subscription created or updated
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: any
) {
  const userId = subscription.metadata?.supabase_user_id;
  const planId = subscription.metadata?.plan_id;

  if (!userId || !planId) {
    console.error("Missing user_id or plan_id in subscription metadata");
    return;
  }

  console.log(`Updating subscription for user ${userId}`);

  // Upsert subscription record
  const { error: subscriptionError } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan_id: planId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        status: subscription.status,
        current_period_start: new Date(
          subscription.current_period_start * 1000
        ).toISOString(),
        current_period_end: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
        trial_start: subscription.trial_start
          ? new Date(subscription.trial_start * 1000).toISOString()
          : null,
        trial_end: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
      },
      {
        onConflict: "stripe_subscription_id",
      }
    );

  if (subscriptionError) {
    console.error("Error upserting subscription:", subscriptionError);
    throw subscriptionError;
  }

  // Update user profile
  const subscriptionStatus =
    subscription.status === "active" || subscription.status === "trialing"
      ? "active"
      : subscription.status === "past_due"
      ? "past_due"
      : "inactive";

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      subscription_status: subscriptionStatus,
      current_plan_id: planId,
      stripe_customer_id: subscription.customer as string,
    })
    .eq("id", userId);

  if (profileError) {
    console.error("Error updating profile:", profileError);
    throw profileError;
  }

  // Get plan details for quota
  const { data: plan, error: planError } = await supabase
    .from("subscription_plans")
    .select("video_quota")
    .eq("id", planId)
    .single();

  if (planError || !plan) {
    console.error("Error fetching plan:", planError);
    return;
  }

  // Create or update usage tracking for current billing period
  const periodStart = new Date(subscription.current_period_start * 1000);
  const periodEnd = new Date(subscription.current_period_end * 1000);

  const { error: usageError } = await supabase.from("usage_tracking").upsert(
    {
      user_id: userId,
      plan_id: planId,
      billing_period_start: periodStart.toISOString(),
      billing_period_end: periodEnd.toISOString(),
      videos_generated: 0, // Reset on new period
      videos_quota: plan.video_quota,
    },
    {
      onConflict: "user_id,billing_period_start",
      ignoreDuplicates: false,
    }
  );

  if (usageError) {
    console.error("Error updating usage tracking:", usageError);
  }

  console.log(`Successfully updated subscription for user ${userId}`);
}

// Handle subscription deleted (cancellation)
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: any
) {
  const userId = subscription.metadata?.supabase_user_id;

  if (!userId) {
    console.error("Missing user_id in subscription metadata");
    return;
  }

  console.log(`Subscription deleted for user ${userId}`);

  // Update subscription record
  await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  // Get Free plan
  const { data: freePlan } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("name", "free")
    .single();

  // Update user profile to Free plan
  await supabase
    .from("profiles")
    .update({
      subscription_status: "inactive",
      current_plan_id: freePlan?.id || null,
    })
    .eq("id", userId);

  // Create usage tracking for Free plan
  if (freePlan) {
    await supabase.from("usage_tracking").insert({
      user_id: userId,
      plan_id: freePlan.id,
      billing_period_start: new Date().toISOString(),
      billing_period_end: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      videos_generated: 0,
      videos_quota: 3, // Free plan quota
    });
  }

  console.log(`User ${userId} downgraded to Free plan`);
}

// Handle successful payment
async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  supabase: any
) {
  if (!invoice.subscription) {
    return; // Not a subscription invoice
  }

  // Get subscription to find user_id
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("user_id, id")
    .eq("stripe_subscription_id", invoice.subscription)
    .single();

  if (!subscription) {
    console.error("Subscription not found for invoice");
    return;
  }

  console.log(`Payment succeeded for user ${subscription.user_id}`);

  // Record payment in payment_history
  await supabase.from("payment_history").insert({
    user_id: subscription.user_id,
    subscription_id: subscription.id,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: invoice.payment_intent as string,
    amount: invoice.amount_paid / 100, // Convert cents to euros
    currency: invoice.currency,
    status: "paid",
    invoice_pdf: invoice.invoice_pdf,
    invoice_url: invoice.hosted_invoice_url,
    paid_at: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : new Date().toISOString(),
  });

  console.log(`Payment recorded for user ${subscription.user_id}`);
}

// Handle failed payment
async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: any
) {
  if (!invoice.subscription) {
    return;
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", invoice.subscription)
    .single();

  if (!subscription) {
    return;
  }

  console.log(`Payment failed for user ${subscription.user_id}`);

  // Update profile to past_due status
  await supabase
    .from("profiles")
    .update({ subscription_status: "past_due" })
    .eq("id", subscription.user_id);
}
