import { useState, useEffect } from "react";
import {
  getSubscriptionUsage,
  checkAndHandleUsagePeriodReset,
} from "@/lib/supabase";
import { logger } from "@/lib/logger";

export function useSubscriptionUsage(profileId: string | undefined) {
  const [usage, setUsage] = useState<{
    currentUsage: number;
    monthlyLimit: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      if (!profileId) {
        logger.info("⏭️ Skipping usage fetch - no profile ID", {
          prefix: "Subscription Usage",
        });
        setIsLoading(false);
        return;
      }

      logger.info("🔄 Fetching subscription usage", {
        prefix: "Subscription Usage",
        data: { profileId },
      });

      try {
        // Check for reset before getting usage
        await checkAndHandleUsagePeriodReset(profileId);
        const data = await getSubscriptionUsage(profileId);

        if (!data) {
          logger.warn("⚠️ No subscription usage data found", {
            prefix: "Subscription Usage",
            data: { profileId },
          });
          setUsage(null);
          return;
        }

        logger.info("✅ Subscription usage fetched", {
          prefix: "Subscription Usage",
          data: {
            profileId,
            currentUsage: data.currentUsage,
            monthlyLimit: data.monthlyLimit,
            usagePercentage: Math.round(
              (data.currentUsage / data.monthlyLimit) * 100
            ),
          },
        });

        setUsage(data);
      } catch (error) {
        logger.error("❌ Error fetching subscription usage", {
          prefix: "Subscription Usage",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            profileId,
          },
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchUsage();
  }, [profileId]);

  return { usage, isLoading };
}
