import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { checkAndRecordAlert } from "@/lib/supabase";
import { AlertType } from "@/lib/types";

export async function queueLimitAlert(
  profileId: string,
  currentUsage: number,
  monthlyLimit: number,
  type: "limit_reached" | "approaching_limit" = "limit_reached"
) {
  logger.info("🔔 Attempting to queue limit alert", {
    prefix: "Notifications",
    data: {
      profileId,
      currentUsage,
      monthlyLimit,
      type,
      usagePercentage: Math.round((currentUsage / monthlyLimit) * 100),
    },
  });

  const shouldSendAlert = await checkAndRecordAlert(profileId, type);

  if (!shouldSendAlert) {
    logger.info("⏭️ Skipping alert - already sent recently", {
      prefix: "Notifications",
      data: { profileId, type },
    });
    return;
  }

  try {
    const { error: insertError } = await supabaseAnon
      .from("limit_alert_notifications")
      .insert({
        profile_id: profileId,
        alert_type: type,
        current_usage: currentUsage,
        monthly_limit: monthlyLimit,
        status: "pending",
      });

    if (insertError) {
      logger.error("❌ Failed to queue limit alert", {
        prefix: "Notifications",
        data: {
          error: insertError,
          profileId,
          currentUsage,
          monthlyLimit,
          type,
        },
      });
      return;
    }

    logger.info("✅ Limit alert queued successfully", {
      prefix: "Notifications",
      data: {
        profileId,
        currentUsage,
        monthlyLimit,
        type,
      },
    });
  } catch (error) {
    logger.error("❌ Error queueing limit alert", {
      prefix: "Notifications",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        profileId,
        currentUsage,
        monthlyLimit,
        type,
      },
    });
  }
}

export async function createLimitAlertNotification(
  profileId: string,
  type: AlertType,
  currentUsage: number,
  monthlyLimit: number
) {
  try {
    const { data: profile } = await supabaseAnon
      .from("profiles")
      .select("email")
      .eq("id", profileId)
      .single();

    if (!profile?.email) {
      throw new Error("Profile email not found");
    }

    const emailContent = generateLimitAlertEmail(
      type,
      currentUsage,
      monthlyLimit,
      profile.email
    );

    const { error: insertError } = await supabaseAnon
      .from("limit_alert_notifications")
      .insert({
        profile_id: profileId,
        alert_type: type,
        current_usage: currentUsage,
        monthly_limit: monthlyLimit,
        email_content: emailContent,
        status: "pending",
      });

    if (insertError) throw insertError;

    logger.info("✅ Limit alert notification created", {
      prefix: "Notifications",
      data: { profileId, type },
    });
  } catch (error) {
    logger.error("❌ Error creating limit alert notification", {
      prefix: "Notifications",
      data: { error, profileId, type },
    });
  }
}

function generateLimitAlertEmail(
  type: AlertType,
  currentUsage: number,
  monthlyLimit: number,
  email: string
): string {
  switch (type) {
    case "limit_reached":
      return `
        <p>Hi ${email},</p>
        <p>You have reached your monthly limit of ${monthlyLimit} notifications.</p>
        <p>Current usage: ${currentUsage}/${monthlyLimit}</p>
        <p>Please upgrade your plan to continue receiving notifications for all your channels.</p>
        <p>Thanks for using Flow Fusion!</p>
      `;
    case "approaching_limit":
      return `
        <p>Hi ${email},</p>
        <p>You're approaching your monthly limit of ${monthlyLimit} notifications.</p>
        <p>Current usage: ${currentUsage}/${monthlyLimit}</p>
        <p>Consider upgrading your plan to ensure uninterrupted notifications for all your channels.</p>
        <p>Thanks for using Flow Fusion!</p>
      `;
    default:
      return "";
  }
}
