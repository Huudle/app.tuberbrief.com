import { Resend } from "resend";
import { supabaseServicePublic } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { incrementSubscriptionUsage } from "@/lib/supabase";
import { handleSubscriptionAlert } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);

export class EmailWorker {
  public isRunning: boolean = false;
  private supabasePublic = supabaseServicePublic;
  private isProcessing = false;
  private readonly POLLING_INTERVAL = 5000; // 5 seconds

  async start() {
    logger.info("🚀 Starting email worker", {
      prefix: "Email Worker",
    });

    while (true) {
      if (!this.isProcessing) {
        try {
          this.isProcessing = true;
          await this.processEmails();
        } catch (error) {
          logger.error("❌ Error in email worker loop", {
            prefix: "Email Worker",
            data: { error },
          });
        } finally {
          this.isProcessing = false;
        }
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.POLLING_INTERVAL)
      );
    }
  }

  stop() {
    this.isRunning = false;
    logger.info("🛑 Stopping email worker", { prefix: "Email Worker" });
  }

  private async processEmailNotifications() {
    // Fetch pending notifications
    const { data: notifications, error: fetchError } = await this.supabasePublic
      .from("notification_emails")
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
          from: "TuberBrief Notifier <info@tuberbrief.com>",
          to: toEmail,
          subject: `New Video: ${notification.video_captions.title}`,
          html: notification.email_content,
          text: notification.email_content.replace(/<[^>]*>/g, ""), // Provide plain text fallback
        });

        // Update usage count
        await incrementSubscriptionUsage(notification.profile_id);

        // Check if limit reached and send alert if needed
        await handleSubscriptionAlert(notification.profile_id);

        // Update notification status
        const { error: updateError } = await this.supabasePublic
          .from("notification_emails")
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
        logger.error(`❌ Failed to process notification ${notification.id}:`, {
          prefix: "Email Worker",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
            notificationId: notification.id,
          },
        });

        // Update to failed status
        await this.supabasePublic
          .from("notification_emails")
          .update({
            status: "failed",
          })
          .eq("id", notification.id);
      }
    }
  }

  private async processLimitAlerts() {
    logger.info("🔄 Starting limit alert processing", {
      prefix: "Email Worker",
    });

    const { data: alerts, error: fetchError } = await this.supabasePublic
      .from("notification_limit_alerts")
      .select("*, profiles(email)")
      .eq("status", "pending")
      .limit(10);

    if (fetchError) {
      logger.error("❌ Failed to fetch limit alerts", {
        prefix: "Email Worker",
        data: { error: fetchError },
      });
      throw fetchError;
    }

    if (!alerts?.length) {
      logger.info("✨ No pending limit alerts to process", {
        prefix: "Email Worker",
      });
      return;
    }

    for (const alert of alerts) {
      try {
        const toEmail = alert.profiles.email;
        if (!toEmail) {
          logger.warn("⚠️ No email found for profile", {
            prefix: "Email Worker",
            data: { profileId: alert.profile_id },
          });
          continue;
        }

        // Send email
        const emailSubject =
          alert.alert_type === "limit_reached"
            ? "Monthly Notification Limit Reached"
            : "Approaching Monthly Notification Limit";

        await resend.emails.send({
          from: "TuberBrief Notifier <info@tuberbrief.com>",
          to: toEmail,
          subject: emailSubject,
          html: alert.email_content,
        });

        // Update alert status
        const { error: updateError } = await this.supabasePublic
          .from("notification_limit_alerts")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", alert.id);

        if (updateError) {
          logger.error("❌ Failed to update alert status", {
            prefix: "Email Worker",
            data: { error: updateError, alertId: alert.id },
          });
        }

        logger.info("✅ Alert processed successfully", {
          prefix: "Email Worker",
          data: {
            alertId: alert.id,
            profileId: alert.profile_id,
            type: alert.alert_type,
            toEmail,
          },
        });
      } catch (error) {
        logger.error("❌ Failed to process alert", {
          prefix: "Email Worker",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            alertId: alert.id,
            profileId: alert.profile_id,
          },
        });

        await this.supabasePublic
          .from("notification_limit_alerts")
          .update({ status: "failed" })
          .eq("id", alert.id);
      }
    }
  }

  async processEmails() {
    try {
      logger.info("🔄 Starting email processing cycle", {
        prefix: "Email Worker",
      });

      // Process regular email notifications
      await this.processEmailNotifications();
      // Process limit alert notifications
      await this.processLimitAlerts();

      logger.info("✅ Completed email processing cycle", {
        prefix: "Email Worker",
      });
    } catch (error) {
      logger.error("❌ Error processing emails", {
        prefix: "EmailWorker",
        data: { error },
      });
    }
  }
}
