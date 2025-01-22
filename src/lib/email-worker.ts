import { Resend } from "resend";
import { supabaseServicePublic } from "@/lib/supabase";

const POLLING_INTERVAL = 20000;
const resend = new Resend(process.env.RESEND_API_KEY);

export class EmailWorker {
  public isRunning: boolean = false;
  private supabasePublic = supabaseServicePublic;

  async start() {
    this.isRunning = true;
    console.log("🎬 Starting email worker");

    while (this.isRunning) {
      try {
        await this.processNextBatch();
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      } catch (error) {
        console.error("💥 Email worker error:", error);
      }
    }
  }

  stop() {
    this.isRunning = false;
    console.log("🛑 Stopping email worker");
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

      console.log(`📧 Processing ${notifications.length} email notifications`);

      // Process each notification
      for (const notification of notifications) {
        try {
          const toEmail = notification.profiles.email;
          if (!toEmail) {
            console.warn(
              `⚠️ No email found for profile ${notification.profile_id}`
            );
            continue;
          }

          // Send email
          console.log(
            `📤 Sending email to ${toEmail} for video ${notification.video_id}`
          );
          await resend.emails.send({
            from: "Flow Fusion Notifier <info@huudle.io>",
            to: toEmail,
            subject: `New Video: ${notification.video_captions.title}`,
            html: notification.email_content,
            text: notification.email_content.replace(/<[^>]*>/g, ""), // Provide plain text fallback
          });

          // Update notification status
          const { error: updateError } = await this.supabasePublic
            .from("email_notifications")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", notification.id);

          if (updateError) {
            console.error(
              `❌ Failed to update notification status:`,
              updateError
            );
            continue;
          }

          console.log(`✅ Email sent successfully to ${toEmail}`);
        } catch (error) {
          console.error(
            `❌ Failed to process notification ${notification.id}:`,
            error
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
      console.error("💥 Batch processing error:", error);
    }
  }
}
