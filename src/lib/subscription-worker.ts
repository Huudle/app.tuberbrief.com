import { supabaseServicePublic } from "@/lib/supabase";
import { managePubSubHubbub } from "@/lib/pubsub";

const POLLING_INTERVAL =
  process.env.NODE_ENV === "production" ? 3600000 : 60000; // 1 hour in prod, 1 minute in dev
const SUBSCRIPTION_RENEWAL_DAYS = 7; // Renew subscriptions older than 7 days

export class SubscriptionWorker {
  public isRunning: boolean = false;
  private supabase = supabaseServicePublic;

  async start() {
    this.isRunning = true;
    console.log("🔄 Starting subscription renewal worker");

    while (this.isRunning) {
      try {
        await this.processSubscriptionRenewals();
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      } catch (error) {
        console.error("💥 Subscription worker error:", error);
      }
    }
  }

  stop() {
    this.isRunning = false;
    console.log("🛑 Stopping subscription renewal worker");
  }

  private async processSubscriptionRenewals() {
    try {
      // Get channels that need renewal (subscribed more than 7 days ago or never subscribed)
      const renewalDate = new Date();
      renewalDate.setDate(renewalDate.getDate() - SUBSCRIPTION_RENEWAL_DAYS);

      const { data: channels, error } = await this.supabase
        .from("profile_youtube_channels")
        .select("youtube_channel_id")
        .or(
          `subscribed_at.is.null,subscribed_at.lt.${renewalDate.toISOString()}`
        )
        .limit(10); // Process in batches

      if (error) throw error;
      if (!channels?.length) {
        console.log("✨ No channels need renewal");
        return;
      }

      console.log(`🔄 Processing ${channels.length} channel renewals`);

      // Process each channel
      for (const channel of channels) {
        try {
          console.log(
            `📡 Renewing subscription for channel: ${channel.youtube_channel_id}`
          );

          // Attempt to subscribe
          await managePubSubHubbub(channel.youtube_channel_id);

          // Update subscription timestamp
          const { error: updateError } = await this.supabase
            .from("profile_youtube_channels")
            .update({
              subscribed_at: new Date().toISOString(),
            })
            .eq("youtube_channel_id", channel.youtube_channel_id);

          if (updateError) {
            console.error(
              `❌ Failed to update subscription timestamp for ${channel.youtube_channel_id}:`,
              updateError
            );
            continue;
          }

          console.log(
            `✅ Successfully renewed subscription for ${channel.youtube_channel_id}`
          );
        } catch (channelError) {
          console.error(
            `❌ Failed to renew subscription for ${channel.youtube_channel_id}`
          );
          console.error(
            `❌ Error processing channel ${channel.youtube_channel_id}:`,
            channelError
          );
        }
      }
    } catch (error) {
      console.error("💥 Subscription renewal error:", error);
    }
  }
}
