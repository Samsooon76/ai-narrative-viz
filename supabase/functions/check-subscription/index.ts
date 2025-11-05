import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Check user subscription and quota status
 * This function can be called by other Edge Functions to verify access
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid user token");
    }

    // Check user quota using the SQL function
    const { data: quotaCheck, error: quotaError } = await supabase.rpc(
      "check_user_quota",
      {
        p_user_id: user.id,
      }
    );

    if (quotaError) {
      console.error("Error checking quota:", quotaError);
      throw new Error("Failed to check user quota");
    }

    // quotaCheck is an array with one result
    const quota = quotaCheck?.[0];

    if (!quota) {
      return new Response(
        JSON.stringify({
          hasAccess: false,
          reason: "No subscription found",
          subscriptionStatus: "inactive",
          videosGenerated: 0,
          videosQuota: 0,
          planName: "none",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Get subscription details
    const { data: subscription } = await supabase.rpc(
      "get_user_subscription",
      {
        p_user_id: user.id,
      }
    );

    const subscriptionData = subscription?.[0];

    const response = {
      hasAccess: quota.has_quota,
      reason: quota.reason,
      subscriptionStatus: subscriptionData?.status || "inactive",
      videosGenerated: quota.videos_generated,
      videosQuota: quota.videos_quota,
      planName: quota.plan_name,
      planDisplayName: subscriptionData?.plan_display_name || quota.plan_name,
      currentPeriodEnd: subscriptionData?.current_period_end || null,
      cancelAtPeriodEnd: subscriptionData?.cancel_at_period_end || false,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error checking subscription:", error);

    return new Response(
      JSON.stringify({
        hasAccess: false,
        reason: error.message || "Failed to check subscription",
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
