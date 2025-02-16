import { Resend } from "resend";
import { supabaseServicePublic } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { incrementSubscriptionUsage } from "@/lib/supabase";
import { handleSubscriptionAlert } from "@/lib/supabase";

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
      // Process regular notifications
      await this.processEmailNotifications();

      // Process limit alerts
      await this.processLimitAlerts();
    } catch (error) {
      logger.error("💥 Email worker error:", {
        prefix: "Email Worker",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
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
          from: "Flow Fusion Notifier <info@huudle.io>",
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
      .from("limit_alert_notifications")
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

    logger.info(`📧 Processing ${alerts.length} limit alerts`, {
      prefix: "Email Worker",
      data: { batchSize: alerts.length },
    });

    for (const alert of alerts) {
      try {
        const toEmail = alert.profiles.email;
        if (!toEmail) {
          logger.warn("⚠️ No email found for profile", {
            prefix: "Email Worker",
            data: {
              profileId: alert.profile_id,
              alertId: alert.id,
              alertType: alert.alert_type,
            },
          });
          continue;
        }

        logger.info("📤 Sending limit alert email", {
          prefix: "Email Worker",
          data: {
            toEmail,
            profileId: alert.profile_id,
            currentUsage: alert.current_usage,
            monthlyLimit: alert.monthly_limit,
            usagePercentage: Math.round(
              (alert.current_usage / alert.monthly_limit) * 100
            ),
          },
        });

        const emailSubject =
          alert.alert_type === "approaching_limit"
            ? "Approaching Monthly Notification Limit"
            : "Monthly Notification Limit Reached";

        const emailContent =
          alert.alert_type === "approaching_limit"
            ? `
            <p>You're approaching your monthly notification limit (${alert.monthly_limit} notifications).</p>
            <p>Current usage: ${alert.current_usage}/${alert.monthly_limit}</p>
            <p>Consider upgrading your plan to ensure uninterrupted notifications.</p>
          `
            : `
            <p>You've reached your monthly notification limit (${alert.monthly_limit} notifications).</p>
            <p>Current usage: ${alert.current_usage}/${alert.monthly_limit}</p>
            <p>Your limit will reset at the beginning of next month.</p>
            <p>Consider upgrading your plan for more notifications.</p>
          `;

        await resend.emails.send({
          from: "Flow Fusion Notifier <info@huudle.io>",
          to: toEmail,
          subject: emailSubject,
          html: emailContent,
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
            data: {
              error: updateError,
              alertId: alert.id,
              profileId: alert.profile_id,
            },
          });
          continue;
        }

        logger.info("✅ Limit alert sent successfully", {
          prefix: "Email Worker",
          data: {
            toEmail,
            alertId: alert.id,
            profileId: alert.profile_id,
          },
        });
      } catch (error) {
        logger.error("❌ Failed to process limit alert", {
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
      // Process regular email notifications
      await this.processEmailNotifications();
      // Process limit alert notifications
      await this.processLimitAlertNotifications();
    } catch (error) {
      logger.error("❌ Error processing emails", {
        prefix: "EmailWorker",
        data: { error },
      });
    }
  }

  private async processLimitAlertNotifications() {
    const { data: notifications, error: fetchError } = await this.supabasePublic
      .from("notification_limit_alerts")
      .select("*, profiles(email)")
      .eq("status", "pending")
      .limit(10);

    if (fetchError) throw fetchError;
    if (!notifications?.length) return;

    for (const notification of notifications) {
      try {
        await resend.emails.send({
          from: "Flow Fusion Notifier <info@huudle.io>",
          to: notification.profiles.email,
          subject: `Notification Limit Alert - ${notification.alert_type}`,
          html: notification.email_content,
        });

        await this.supabasePublic
          .from("notification_limit_alerts")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", notification.id);

        logger.info("✅ Limit alert email sent", {
          prefix: "EmailWorker",
          data: { notificationId: notification.id },
        });
      } catch (error) {
        await this.supabasePublic
          .from("notification_limit_alerts")
          .update({
            status: "failed",
          })
          .eq("id", notification.id);

        logger.error("❌ Error sending limit alert email", {
          prefix: "EmailWorker",
          data: { error, notificationId: notification.id },
        });
      }
    }
  }
}
