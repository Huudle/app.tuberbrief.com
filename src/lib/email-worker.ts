import { Resend } from "resend";
import { supabaseServicePublic } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { incrementSubscriptionUsage } from "@/lib/supabase";

const POLLING_INTERVAL = 20000;
const resend = new Resend(process.env.RESEND_API_KEY);

export class EmailWorker {
  public isRunning: boolean = false;
  private supabasePublic = supabaseServicePublic;

  async start() {
    this.isRunning = true;
    logger.info("🎬 Starting email worker", { prefix: "Email Worker" });

    while (this.isRunning) {
      try {
        await this.processNextBatch();
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      } catch (error) {
        logger.error("💥 Email worker error:", {
          prefix: "Email Worker",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }
  }

  stop() {
    this.isRunning = false;
    logger.info("🛑 Stopping email worker", { prefix: "Email Worker" });
  }

  private async processNextBatch() {
    try {
      // Fetch pending notifications
      const { data: notifications, error: fetchError } =
        await this.supabasePublic
          .from("email_notifications")
          .select("*, profiles(email), video_captions(title)")
          .eq("status", "pending")
          .limit(10); // Process in batches of 10

      if (fetchError) throw fetchError;
      if (!notifications?.length) return;

      logger.info(`📧 Processing ${notifications.length} email notifications`, {
        prefix: "Email Worker",
        data: { batchSize: notifications.length },
      });

      // Process each notification
      for (const notification of notifications) {
        try {
          const toEmail = notification.profiles.email;
          if (!toEmail) {
            logger.warn(
              `⚠️ No email found for profile ${notification.profile_id}`,
              {
                prefix: "Email Worker",
                data: { profileId: notification.profile_id },
              }
            );
            continue;
          }

          // Send email
          logger.info(
            `📤 Sending email to ${toEmail} for video ${notification.video_id}`,
            {
              prefix: "Email Worker",
              data: {
                toEmail,
                videoId: notification.video_id,
                title: notification.video_captions.title,
              },
            }
          );

          await resend.emails.send({
            from: "Flow Fusion Notifier <info@huudle.io>",
            to: toEmail,
            subject: `New Video: ${notification.video_captions.title}`,
            html: notification.email_content,
            text: notification.email_content.replace(/<[^>]*>/g, ""), // Provide plain text fallback
          });

          // Update usage count
          await incrementSubscriptionUsage(notification.profile_id);

          // Update notification status
          const { error: updateError } = await this.supabasePublic
            .from("email_notifications")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", notification.id);

          if (updateError) {
            logger.error(`❌ Failed to update notification status:`, {
              prefix: "Email Worker",
              data: {
                error: updateError.message,
                notificationId: notification.id,
              },
            });
            continue;
          }

          logger.info(`✅ Email sent successfully to ${toEmail}`, {
            prefix: "Email Worker",
            data: { toEmail, notificationId: notification.id },
          });
        } catch (error) {
          logger.error(
            `❌ Failed to process notification ${notification.id}:`,
            {
              prefix: "Email Worker",
              data: {
                error: error instanceof Error ? error.message : "Unknown error",
                notificationId: notification.id,
              },
            }
          );

          // Update to failed status
          await this.supabasePublic
            .from("email_notifications")
            .update({
              status: "failed",
            })
            .eq("id", notification.id);
        }
      }
    } catch (error) {
      logger.error("💥 Batch processing error:", {
        prefix: "Email Worker",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }
}
