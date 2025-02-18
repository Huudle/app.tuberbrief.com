import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { checkAndRecordAlert } from "@/lib/supabase";
import { AlertType } from "@/lib/types";

export async function queueLimitAlert(
  profileId: string,
  currentUsage: number,
  monthlyLimit: number,
  type: AlertType = "limit_reached"
) {
  logger.info("🔔 Starting limit alert queue process", {
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
    const emailContent = generateLimitAlertEmail(
      type,
      currentUsage,
      monthlyLimit
    );

    logger.info("📝 Queueing limit alert", {
      prefix: "Notifications",
      data: {
        profileId,
        type,
        contentLength: emailContent.length,
      },
    });

    const { error: insertError } = await supabaseAnon
      .from("notification_limit_alerts")
      .insert({
        profile_id: profileId,
        alert_type: type,
        email_content: emailContent,
        status: "pending",
      });

    if (insertError) {
      logger.error("❌ Failed to queue limit alert", {
        prefix: "Notifications",
        data: {
          error: insertError,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
          profileId,
          type,
        },
      });
      throw insertError;
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
    logger.error("❌ Error in queueLimitAlert", {
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

function generateLimitAlertEmail(
  type: AlertType,
  currentUsage: number,
  monthlyLimit: number
): string {
  switch (type) {
    case "limit_reached":
      return `
        <p>You have reached your monthly limit of ${monthlyLimit} notifications.</p>
        <p>Current usage: ${currentUsage}/${monthlyLimit}</p>
        <p>Please upgrade your plan to continue receiving notifications for all your channels.</p>
        <p>Thanks for using Flow Fusion!</p>
      `;
    case "approaching_limit":
      return `
        <p>You're approaching your monthly limit of ${monthlyLimit} notifications.</p>
        <p>Current usage: ${currentUsage}/${monthlyLimit}</p>
        <p>Consider upgrading your plan to ensure uninterrupted notifications.</p>
        <p>Thanks for using Flow Fusion!</p>
      `;
    default:
      return "";
  }
}
