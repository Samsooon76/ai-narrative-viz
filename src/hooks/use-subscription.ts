import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

export interface SubscriptionData {
  hasAccess: boolean;
  reason: string;
  subscriptionStatus: string;
  videosGenerated: number;
  videosQuota: number;
  planName: string;
  planDisplayName: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Hook to fetch and manage user subscription status and quota
 * @returns Subscription data, loading state, and error
 */
export function useSubscription() {
  const { user } = useAuth();

  const {
    data: subscription,
    isLoading,
    error,
    refetch,
  } = useQuery<SubscriptionData>({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase.functions.invoke(
        "check-subscription",
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        }
      );

      if (error) {
        console.error("Error checking subscription:", error);
        throw error;
      }

      return data as SubscriptionData;
    },
    enabled: !!user,
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  /**
   * Calculate percentage of quota used
   */
  const quotaPercentage = subscription
    ? Math.round((subscription.videosGenerated / subscription.videosQuota) * 100)
    : 0;

  /**
   * Check if user is close to quota limit (>= 80%)
   */
  const isNearLimit = quotaPercentage >= 80;

  /**
   * Check if user has reached quota limit
   */
  const isAtLimit = subscription ? subscription.videosGenerated >= subscription.videosQuota : false;

  /**
   * Check if user has an active subscription (not free plan)
   */
  const hasActiveSubscription = subscription?.subscriptionStatus === "active" && subscription?.planName !== "free";

  /**
   * Check if subscription is in a warning state (past_due, canceled)
   */
  const isSubscriptionWarning = subscription?.subscriptionStatus === "past_due" || subscription?.cancelAtPeriodEnd;

  return {
    subscription,
    isLoading,
    error,
    refetch,
    // Computed values
    quotaPercentage,
    isNearLimit,
    isAtLimit,
    hasActiveSubscription,
    isSubscriptionWarning,
    // Helper functions
    canGenerateVideo: subscription?.hasAccess ?? false,
    remainingVideos: subscription
      ? Math.max(0, subscription.videosQuota - subscription.videosGenerated)
      : 0,
  };
}
