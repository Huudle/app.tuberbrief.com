import { supabaseServicePublic } from "@/lib/supabase";
import { managePubSubHubbub } from "@/lib/pubsub";
import { logger } from "@/lib/logger";

const POLLING_INTERVAL =
  process.env.NODE_ENV === "production" ? 3600000 : 60000; // 1 hour in prod, 1 minute in dev
const SUBSCRIPTION_RENEWAL_DAYS = 7; // Renew subscriptions older than 7 days

export class YouTubeSubscriptionWorker {
  public isRunning: boolean = false;
  private supabase = supabaseServicePublic;

  async start() {
    this.isRunning = true;
    logger.info("🔄 Starting subscription renewal worker", {
      prefix: "Subscription Worker",
    });

    while (this.isRunning) {
      try {
        await this.processSubscriptionRenewals();
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      } catch (error) {
        logger.error("💥 Subscription worker error:", {
          prefix: "Subscription Worker",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }
  }

  stop() {
    this.isRunning = false;
    logger.info("🛑 Stopping subscription renewal worker", {
      prefix: "Subscription Worker",
    });
  }

  private async processSubscriptionRenewals() {
    try {
      // Return if not in production
      if (process.env.NODE_ENV !== "production") {
        logger.info(
          "🚫 Subscription worker not running in non-production environment",
          {
            prefix: "Subscription Worker",
            data: { environment: process.env.NODE_ENV },
          }
        );
        return;
      }

      // Get channels that need renewal (subscribed more than 7 days ago or never subscribed)
      const renewalDate = new Date();
      renewalDate.setDate(renewalDate.getDate() - SUBSCRIPTION_RENEWAL_DAYS);

      const { data: channels, error } = await this.supabase
        .from("profiles_youtube_channels")
        .select("youtube_channel_id")
        .or(
          `subscribed_at.is.null,subscribed_at.lt.${renewalDate.toISOString()}`
        )
        .limit(10); // Process in batches

      if (error) throw error;
      if (!channels?.length) {
        logger.info("✨ No channels need renewal", {
          prefix: "Subscription Worker",
        });
        return;
      }

      logger.info(`🔄 Processing ${channels.length} channel renewals`, {
        prefix: "Subscription Worker",
        data: { batchSize: channels.length },
      });

      // Process each channel
      for (const channel of channels) {
        try {
          logger.info(
            `📡 Renewing subscription for channel: ${channel.youtube_channel_id}`,
            {
              prefix: "Subscription Worker",
              data: { channelId: channel.youtube_channel_id },
            }
          );

          // Attempt to subscribe
          const callbackUrl = await managePubSubHubbub(
            channel.youtube_channel_id
          );

          // Update subscription timestamp
          const { error: updateError } = await this.supabase
            .from("profiles_youtube_channels")
            .update({
              subscribed_at: new Date().toISOString(),
              callback_url: callbackUrl,
            })
            .eq("youtube_channel_id", channel.youtube_channel_id);

          if (updateError) {
            logger.error(
              `❌ Failed to update subscription timestamp for ${channel.youtube_channel_id}:`,
              {
                prefix: "Subscription Worker",
                data: {
                  channelId: channel.youtube_channel_id,
                  error: updateError.message,
                },
              }
            );
            continue;
          }

          logger.info(
            `✅ Successfully renewed subscription for ${channel.youtube_channel_id}`,
            {
              prefix: "Subscription Worker",
              data: {
                channelId: channel.youtube_channel_id,
                callbackUrl,
              },
            }
          );
        } catch (channelError) {
          logger.error(
            `❌ Failed to renew subscription for ${channel.youtube_channel_id}`,
            {
              prefix: "Subscription Worker",
              data: {
                channelId: channel.youtube_channel_id,
                error:
                  channelError instanceof Error
                    ? channelError.message
                    : "Unknown error",
              },
            }
          );
        }
      }
    } catch (error) {
      logger.error("💥 Subscription renewal error:", {
        prefix: "Subscription Worker",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }
  }
}
