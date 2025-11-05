import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface QuotaCheckResult {
  hasAccess: boolean;
  reason: string;
  videosGenerated: number;
  videosQuota: number;
  planName: string;
}

/**
 * Check if user has an active subscription and available quota
 * @param userId - The user's UUID
 * @param supabase - Supabase client instance
 * @returns QuotaCheckResult
 */
export async function checkUserQuota(
  userId: string,
  supabase: SupabaseClient
): Promise<QuotaCheckResult> {
  try {
    // Call the SQL function to check user quota
    const { data: quotaCheck, error: quotaError } = await supabase.rpc(
      "check_user_quota",
      {
        p_user_id: userId,
      }
    );

    if (quotaError) {
      console.error("Error checking quota:", quotaError);
      throw new Error("Failed to check user quota");
    }

    // quotaCheck is an array with one result
    const quota = quotaCheck?.[0];

    if (!quota) {
      return {
        hasAccess: false,
        reason: "No subscription found",
        videosGenerated: 0,
        videosQuota: 0,
        planName: "none",
      };
    }

    return {
      hasAccess: quota.has_quota,
      reason: quota.reason,
      videosGenerated: quota.videos_generated,
      videosQuota: quota.videos_quota,
      planName: quota.plan_name,
    };
  } catch (error) {
    console.error("Error in checkUserQuota:", error);
    return {
      hasAccess: false,
      reason: error.message || "Error checking quota",
      videosGenerated: 0,
      videosQuota: 0,
      planName: "error",
    };
  }
}

/**
 * Increment the user's video generation count
 * Should be called after a video is successfully generated
 * @param userId - The user's UUID
 * @param supabase - Supabase client instance
 * @returns Success status and new count
 */
export async function incrementVideoCount(
  userId: string,
  supabase: SupabaseClient
): Promise<{ success: boolean; newCount: number; quota: number }> {
  try {
    const { data, error } = await supabase.rpc("increment_video_count", {
      p_user_id: userId,
    });

    if (error) {
      console.error("Error incrementing video count:", error);
      throw error;
    }

    const result = data?.[0];

    if (!result) {
      return { success: false, newCount: 0, quota: 0 };
    }

    return {
      success: result.success,
      newCount: result.new_count,
      quota: result.quota,
    };
  } catch (error) {
    console.error("Error in incrementVideoCount:", error);
    return { success: false, newCount: 0, quota: 0 };
  }
}

/**
 * Middleware function to check subscription before allowing generation
 * Returns a Response object if access is denied, null if access is granted
 * @param userId - The user's UUID
 * @param supabase - Supabase client instance
 * @param corsHeaders - CORS headers to include in response
 * @returns Response object if denied, null if allowed
 */
export async function checkSubscriptionMiddleware(
  userId: string,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  // Check user's quota
  const quotaResult = await checkUserQuota(userId, supabase);

  if (!quotaResult.hasAccess) {
    let errorMessage = quotaResult.reason;
    let statusCode = 403;

    // Customize error message based on reason
    if (quotaResult.reason === "No active subscription") {
      errorMessage =
        "Vous devez avoir un abonnement actif pour générer des vidéos. Veuillez souscrire à un plan.";
    } else if (quotaResult.reason === "Monthly quota exceeded") {
      errorMessage = `Vous avez atteint votre quota mensuel de ${quotaResult.videosQuota} vidéos. Upgradez votre plan pour continuer.`;
      statusCode = 429; // Too Many Requests
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
        reason: quotaResult.reason,
        videosGenerated: quotaResult.videosGenerated,
        videosQuota: quotaResult.videosQuota,
        planName: quotaResult.planName,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: statusCode,
      }
    );
  }

  // Access granted
  return null;
}

/**
 * Get user from authorization header
 * @param req - The request object
 * @param supabase - Supabase client instance
 * @returns User object and error
 */
export async function getUserFromAuth(
  req: Request,
  supabase: SupabaseClient
): Promise<{ user: any; error: string | null }> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return { user: null, error: "No authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return { user: null, error: "Invalid user token" };
  }

  return { user, error: null };
}

/**
 * Initialize Supabase client with service role
 * @returns Supabase client instance
 */
export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}
