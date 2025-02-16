import { supabaseServicePublic } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { checkAndHandleUsagePeriodReset } from "@/lib/supabase";

// Option 2: Make it configurable via env variable
const POLLING_INTERVAL =
  process.env.NODE_ENV === "production"
    ? parseInt(process.env.SUBSCRIPTION_CHECK_INTERVAL || "300000") // Default 5 minutes in prod
    : parseInt(process.env.SUBSCRIPTION_CHECK_INTERVAL || "300000"); // Also 5 minutes in dev

export class SubscriptionCheckWorker {
  public isRunning: boolean = false;
  private supabase = supabaseServicePublic;

  async start() {
    this.isRunning = true;
    logger.info("🔄 Starting subscription check worker", {
      prefix: "Subscription Check",
    });

    while (this.isRunning) {
      try {
        await this.processSubscriptionChecks();
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      } catch (error) {
        logger.error("💥 Subscription check worker error:", {
          prefix: "Subscription Check",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }
  }

  stop() {
    this.isRunning = false;
    logger.info("🛑 Stopping subscription check worker", {
      prefix: "Subscription Check",
    });
  }

  private async processSubscriptionChecks() {
    try {
      // Return if not in production
      if (process.env.NODE_ENV !== "production") {
        logger.info(
          "🚫 Subscription check not running in non-production environment",
          {
            prefix: "Subscription Check",
            data: { environment: process.env.NODE_ENV },
          }
        );
        return;
      }

      // Get only subscriptions approaching their end date (within next hour)
      const { data: subscriptions, error } = await this.supabase
        .from("subscriptions")
        .select("profile_id, end_date")
        .eq("status", "active")
        // Only check subs that are within 1 hour of their end date
        .lt("end_date", new Date(Date.now() + 3600000).toISOString())
        .gte("end_date", new Date().toISOString());

      if (error) throw error;

      logger.info("🔄 Processing subscription checks", {
        prefix: "Subscription Check",
        data: { count: subscriptions?.length ?? 0 },
      });

      // Check each subscription
      for (const subscription of subscriptions || []) {
        await checkAndHandleUsagePeriodReset(subscription.profile_id);
      }
    } catch (error) {
      logger.error("💥 Error processing subscription checks", {
        prefix: "Subscription Check",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }
  }
}
