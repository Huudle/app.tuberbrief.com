import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {
  YouTubeChannel,
  ChannelListItem,
  ChannelProcessingStatus,
  ChannelQueryResult,
  VideoAIContent,
  CaptionData,
  EligibleProfile,
  Subscription,
  PlanName,
  AlertType,
} from "./types";
import { queueLimitAlert } from "@/lib/notifications";

// Create a single shared instance for browser context
const createSharedClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
};

// Single shared instance for browser context
export const supabaseAnon = createSharedClient();

// Service client for PGMQ
export const supabaseServicePGMQPublic = (url: string, key: string) => {
  if (!url || !key) {
    throw new Error("URL or key is empty");
  }
  return createClient(url, key, {
    db: {
      schema: "pgmq_public",
    },
  });
};

// Remove duplicate client
// export const supabaseServicePublic = createClient(...)

// Use the shared instance instead
export const supabaseServicePublic = supabaseAnon;

export async function checkIfChannelIsLinked(
  profileId: string,
  channelId: string
): Promise<boolean> {
  const { error: checkError } = await supabaseAnon
    .from("profiles_youtube_channels")
    .select("*")
    .eq("profile_id", profileId)
    .eq("youtube_channel_id", channelId)
    .single();

  if (checkError?.code === "PGRST116") {
    return false;
  }

  if (checkError) {
    logger.error("🔗 Error checking if channel is linked", {
      prefix: "Supabase",
      data: {
        error: checkError.message,
        profileId,
        channelId,
      },
    });
    throw checkError;
  }

  return true;
}

export async function updateChannelSubscription(
  profileId: string,
  channelId: string,
  callbackUrl: string
) {
  await supabaseAnon
    .from("profiles_youtube_channels")
    .update({ callback_url: callbackUrl })
    .eq("profile_id", profileId)
    .eq("youtube_channel_id", channelId);
}

export async function addYouTubeChannel(
  profileId: string,
  channelData: {
    id: string;
    title: string;
    thumbnail: string;
    subscriberCount: number;
    lastVideoId: string;
    lastVideoDate: string;
    customUrl: string;
  }
): Promise<YouTubeChannel> {
  logger.info("🎥 Starting addYouTubeChannel", {
    prefix: "Supabase",
    data: { profileId, channelId: channelData.id },
  });

  try {
    // First, upsert the YouTube channel
    logger.debug("📝 Upserting YouTube channel", {
      prefix: "Supabase",
      data: { channelData },
    });

    const { error: channelError } = await supabaseAnon
      .from("youtube_channels")
      .upsert({
        id: channelData.id,
        title: channelData.title,
        thumbnail: channelData.thumbnail,
        subscriber_count: channelData.subscriberCount,
        last_video_id: channelData.lastVideoId,
        last_video_date: channelData.lastVideoDate,
        custom_url: channelData.customUrl,
      });

    if (channelError) {
      logger.error("❌ Error upserting YouTube channel", {
        prefix: "Supabase",
        data: {
          error: channelError.message,
          code: channelError.code,
          details: channelError.details,
          hint: channelError.hint,
        },
      });
      throw channelError;
    }
    logger.debug("✅ Channel upsert successful", { prefix: "Supabase" });

    if (!(await checkIfChannelIsLinked(profileId, channelData.id))) {
      logger.debug("🔗 Creating profile-channel association", {
        prefix: "Supabase",
      });
      const { data: linkData, error: linkError } = await supabaseAnon
        .from("profiles_youtube_channels")
        .insert({
          profile_id: profileId,
          youtube_channel_id: channelData.id,
        });

      if (linkError) {
        logger.error("❌ Error linking profile to channel", {
          prefix: "Supabase",
          data: {
            error: linkError.message,
            code: linkError.code,
            details: linkError.details,
            hint: linkError.hint,
          },
        });
        throw linkError;
      }
      logger.debug("✅ Profile-channel link successful", {
        prefix: "Supabase",
        data: { linkData },
      });
    }

    // Return the channel data
    logger.debug("🔍 Fetching final channel data", { prefix: "Supabase" });
    const { data: channel, error: fetchError } = await supabaseAnon
      .from("youtube_channels")
      .select("*")
      .eq("id", channelData.id)
      .single();

    if (fetchError) {
      logger.error("❌ Error fetching channel", {
        prefix: "Supabase",
        data: {
          error: fetchError.message,
          code: fetchError.code,
          details: fetchError.details,
          hint: fetchError.hint,
        },
      });
      throw fetchError;
    }

    if (!channel) {
      logger.error("❌ No channel data found after upsert", {
        prefix: "Supabase",
        data: { channelId: channelData.id },
      });
      throw new Error("Channel not found after upsert");
    }

    logger.info("✅ addYouTubeChannel completed successfully", {
      prefix: "Supabase",
      data: { channel },
    });

    return channel;
  } catch (error) {
    logger.error("❌ Unexpected error in addYouTubeChannel", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        name: error instanceof Error ? error.name : undefined,
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    throw error;
  }
}

export async function getProfileChannels(
  profileId: string
): Promise<ChannelListItem[]> {
  try {
    const { data, error } = await supabaseAnon
      .from("profiles_youtube_channels")
      .select(
        `
        id,
        created_at,
        youtube_channel:youtube_channels!youtube_channel_id(
          id,
          title,
          thumbnail,
          subscriber_count,
          last_video_id,
          last_video_date,
          custom_url
        )
      `
      )
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("❌ Error fetching channels", {
        prefix: "Supabase",
        data: { error: error.message, profileId },
      });
      throw error;
    }

    if (!data) {
      logger.info("ℹ️ No channels found", {
        prefix: "Supabase",
        data: { profileId },
      });
      return [];
    }

    const typedData = data as unknown as ChannelQueryResult[];
    return typedData.map((item) => ({
      id: item.id,
      channelId: item.youtube_channel.id,
      name: item.youtube_channel.title,
      url: item.youtube_channel.id,
      subscriberCount: item.youtube_channel.subscriber_count,
      lastVideoDate: item.youtube_channel.last_video_date,
      thumbnail: item.youtube_channel.thumbnail,
      latestVideoId: item.youtube_channel.last_video_id,
      avatar: item.youtube_channel.thumbnail,
      createdAt: item.created_at,
      customUrl: item.youtube_channel.custom_url,
    }));
  } catch (error) {
    logger.error("❌ Error in getProfileChannels", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
      },
    });
    throw error;
  }
}

export async function deleteProfileChannel(
  profileId: string,
  channelId: string
) {
  logger.info("🗑️ Deleting channel", {
    prefix: "Supabase",
    data: { profileId, channelId },
  });

  try {
    const { error } = await supabaseAnon
      .from("profiles_youtube_channels")
      .delete()
      .eq("profile_id", profileId)
      .eq("id", channelId);

    if (error) {
      logger.error("❌ Error deleting channel", {
        prefix: "Supabase",
        data: { error: error.message, profileId, channelId },
      });
      throw error;
    }

    logger.info("✅ Channel deleted successfully", {
      prefix: "Supabase",
      data: { profileId, channelId },
    });
  } catch (error) {
    logger.error("❌ Error in deleteProfileChannel", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
        channelId,
      },
    });
    throw error;
  }
}

export async function createOrUpdateChannel(
  channelId: string
): Promise<ChannelProcessingStatus> {
  // Check if channel already exists
  const { data: existingChannel } = await supabaseAnon
    .from("youtube_channels")
    .select("*")
    .eq("id", channelId)
    .single();

  if (existingChannel) {
    // Update existing channel's processing status
    await supabaseAnon
      .from("youtube_channels")
      .update({
        processing_status: "pending",
        last_sync_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", channelId);

    return {
      success: true,
      status: "pending",
      channelId,
      message: "Channel update started",
    };
  }

  // Create initial channel record
  const { error: channelError } = await supabaseAnon
    .from("youtube_channels")
    .insert([
      {
        id: channelId,
        identifier: null,
        processing_status: "pending",
        last_sync_at: new Date().toISOString(),
        sync_error: null,
      },
    ])
    .select()
    .single();

  if (channelError) {
    logger.error("❌ Error creating channel", {
      prefix: "Supabase",
      data: { error: channelError.message, channelId },
    });
    return {
      success: false,
      status: "failed",
      error: "Failed to create channel",
    };
  }

  return {
    success: true,
    status: "pending",
    channelId,
    message: "Channel processing started",
  };
}

export async function updateChannelProcessingStatus(
  channelId: string,
  status: "completed" | "failed",
  error?: string
) {
  await supabaseAnon
    .from("youtube_channels")
    .update({
      processing_status: status,
      last_sync_at: new Date().toISOString(),
      sync_error: error || null,
    })
    .eq("id", channelId);
}

export async function removeYouTubeChannel(
  profileId: string,
  channelId: string
) {
  const { error } = await supabaseAnon
    .from("youtube_channels")
    .delete()
    .match({ profile_id: profileId, channel_id: channelId });

  if (error) {
    logger.error("❌ Failed to remove channel", {
      prefix: "Supabase",
      data: { error: error.message, profileId, channelId },
    });
    throw error;
  }
}

export async function getStoredCaptions(
  videoId: string
): Promise<CaptionData | null> {
  const { data, error } = await supabaseAnon
    .from("video_captions")
    .select("transcript, language, title")
    .eq("video_id", videoId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    transcript: data.transcript,
    language: data.language,
    title: data.title,
    duration: 0,
  };
}

export async function storeCaptions(
  videoId: string,
  captions: CaptionData
): Promise<void> {
  const { error } = await supabaseAnon.from("video_captions").upsert({
    video_id: videoId,
    transcript: captions.transcript,
    language: captions.language,
    title: captions.title,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    logger.error("❌ Failed to store captions", {
      prefix: "Supabase",
      data: { error: error.message, videoId },
    });
    throw error;
  }
}

export async function getStoredAIContent(
  videoId: string
): Promise<VideoAIContent | null> {
  try {
    const { data, error } = await supabaseAnon
      .from("video_ai_data")
      .select("*")
      .eq("video_id", videoId)
      .single();

    if (error || !data) return null;
    return data;
  } catch (error) {
    logger.error("❌ Error fetching AI content", {
      prefix: "Supabase",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    return null;
  }
}

export async function storeAIContent(
  videoId: string,
  aiContent: VideoAIContent
): Promise<void> {
  try {
    const { error } = await supabaseAnon.from("video_ai_data").upsert({
      video_id: videoId,
      content: aiContent.content,
      model: aiContent.model,
    });

    if (error) {
      logger.error("❌ Failed to store AI content", {
        prefix: "Supabase",
        data: { error: error.message, videoId },
      });
      throw error;
    }
  } catch (error) {
    logger.error("💥 Error storing AI content", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        videoId,
      },
    });
    throw error;
  }
}

interface CurrentSubscription {
  id: string;
  usage_count: number;
  plans: {
    monthly_email_limit: number;
  };
}

export async function incrementSubscriptionUsage(
  profileId: string
): Promise<string> {
  try {
    // Check for period reset first
    await checkAndHandleUsagePeriodReset(profileId);

    // Get current subscription
    const { data: currentSub, error: fetchError } = await supabaseAnon
      .from("subscriptions")
      .select(
        `
        id,
        usage_count,
        plans (
          monthly_email_limit
        )
      `
      )
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single<CurrentSubscription>();

    logger.info("🔍 Current subscription", {
      prefix: "Supabase",
      data: { currentSub },
    });

    if (fetchError && fetchError.code !== "PGRST116") {
      logger.error("❌ Error fetching current subscription", {
        prefix: "Supabase",
        data: { error: fetchError, profileId },
      });
      throw fetchError;
    }

    if (!currentSub) {
      logger.error("❌ No active subscription found", {
        prefix: "Supabase",
        data: { profileId },
      });
      throw new Error("No active subscription found");
    }

    const currentCount = currentSub.usage_count ?? 0;
    const newCount = currentCount + 1;
    const monthlyLimit = currentSub.plans.monthly_email_limit;

    // Check if this increment will hit the limit exactly
    const willHitLimit =
      currentCount < monthlyLimit && newCount >= monthlyLimit;

    // Update usage count
    const { error: updateError } = await supabaseAnon
      .from("subscriptions")
      .update({ usage_count: newCount })
      .eq("id", currentSub.id);

    if (updateError) throw updateError;

    // Log the usage
    const { error: logError } = await supabaseAnon
      .from("subscription_usage_logs")
      .insert({
        profile_id: profileId,
        usage_count: newCount,
        monthly_limit: monthlyLimit,
        recorded_at: new Date().toISOString(),
      });

    if (logError) throw logError;

    // Only queue alert when first hitting the limit
    if (willHitLimit) {
      await queueLimitAlert(profileId, newCount, monthlyLimit);
    }

    logger.info("✅ Usage count incremented successfully", {
      prefix: "Supabase",
      data: { profileId, newCount },
    });

    return "Usage count incremented successfully";
  } catch (error) {
    logger.error("💥 Failed to increment usage count", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
      },
    });
    throw error;
  }
}

export async function checkAndRecordAlert(
  profileId: string,
  type: AlertType
): Promise<boolean> {
  try {
    const now = new Date();

    // Check if alert already sent in current subscription period
    const { data: subscription } = await supabaseAnon
      .from("subscriptions")
      .select("start_date, end_date")
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single();

    if (!subscription) {
      logger.warn("⚠️ No active subscription found for alert check", {
        prefix: "Supabase",
        data: { profileId, type },
      });
      return false;
    }

    // Check if alert already sent in current period
    const { data: existingAlert } = await supabaseAnon
      .from("notification_alert_logs")
      .select("sent_at")
      .eq("profile_id", profileId)
      .eq("alert_type", type)
      .gte("sent_at", subscription.start_date)
      .lte("sent_at", subscription.end_date ?? now.toISOString())
      .single();

    if (existingAlert) {
      logger.info("⏭️ Alert already sent in current period", {
        prefix: "Supabase",
        data: { profileId, type, sentAt: existingAlert.sent_at },
      });
      return false;
    }

    // Record new alert
    const { error: insertError } = await supabaseAnon
      .from("notification_alert_logs")
      .insert({
        profile_id: profileId,
        alert_type: type,
        sent_at: now.toISOString(),
      });

    if (insertError) {
      logger.error("❌ Failed to record alert", {
        prefix: "Supabase",
        data: { error: insertError, profileId, type },
      });
      return false;
    }

    logger.info("✅ Alert recorded successfully", {
      prefix: "Supabase",
      data: { profileId, type },
    });

    return true;
  } catch (error) {
    logger.error("💥 Error checking/recording alert", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        profileId,
        type,
      },
    });
    return false;
  }
}

export interface SubscriptionWithRelations {
  id: string;
  usage_count: number;
  plans: {
    monthly_email_limit: number;
  };
  profiles: {
    email: string;
  };
}

export async function checkSubscriptionLimit(profileId: string): Promise<{
  isAtLimit: boolean;
  currentUsage?: number;
  monthlyLimit?: number;
}> {
  try {
    // Check for reset before checking limit
    await checkAndHandleUsagePeriodReset(profileId);

    const { data: subscription, error } = await supabaseAnon
      .from("subscriptions")
      .select(
        `
        id,
        usage_count,
        plans!inner (
          monthly_email_limit
        ),
        profiles!inner (
          email
        )
      `
      )
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single<SubscriptionWithRelations>();

    if (error || !subscription) {
      logger.error("❌ Error checking subscription limit", {
        prefix: "Supabase",
        data: { error, profileId },
      });
      return { isAtLimit: false };
    }

    const currentUsage = subscription.usage_count ?? 0;
    const monthlyLimit = subscription.plans.monthly_email_limit;

    return {
      isAtLimit: currentUsage >= monthlyLimit,
      currentUsage,
      monthlyLimit,
    };
  } catch (error) {
    logger.error("💥 Error in checkSubscriptionLimit", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
      },
    });
    return { isAtLimit: false };
  }
}

export async function handleSubscriptionAlert(profileId: string) {
  const limitStatus = await checkSubscriptionLimit(profileId);

  if (limitStatus.isAtLimit) {
    await queueLimitAlert(
      profileId,
      limitStatus.currentUsage!,
      limitStatus.monthlyLimit!
    );
  }
}

export async function checkAndAlertIneligibleProfiles(channelId: string) {
  try {
    // Get all subscribers for this channel
    const { data: allSubscribers } = await supabaseAnon
      .from("profiles_youtube_channels")
      .select("profile_id")
      .eq("youtube_channel_id", channelId);

    // Get eligible subscribers
    const { data: eligibleProfiles } = (await supabaseAnon.rpc(
      "get_eligible_notification_profiles",
      {
        channel_id_param: channelId,
      }
    )) as unknown as { data: EligibleProfile[] | null };

    if (!allSubscribers) {
      return;
    }

    // Create set of eligible profile IDs for faster lookup
    const eligibleProfileIds = new Set(
      eligibleProfiles?.map((profile) => profile.profile_id) || []
    );

    // Check and alert ineligible profiles
    for (const subscriber of allSubscribers) {
      if (!eligibleProfileIds.has(subscriber.profile_id)) {
        await handleSubscriptionAlert(subscriber.profile_id);
      }
    }
  } catch (error) {
    logger.error("❌ Error checking ineligible profiles", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        channelId,
      },
    });
  }
}

export async function checkAndHandleUsagePeriodReset(profileId: string) {
  try {
    logger.info("🔄 Checking subscription period reset", {
      prefix: "Supabase",
      data: { profileId },
    });

    const { data: subscription, error } = await supabaseAnon
      .from("subscriptions")
      .select(
        `
        id,
        usage_count,
        start_date,
        end_date,
        status,
        plans!inner (
          monthly_email_limit
        )
      `
      )
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single<Subscription>();

    if (error) {
      logger.error("❌ Error fetching subscription for reset check", {
        prefix: "Supabase",
        data: { error, profileId },
      });
      return;
    }

    if (!subscription) {
      logger.warn("⚠️ No active subscription found for reset check", {
        prefix: "Supabase",
        data: { profileId },
      });
      return;
    }

    const now = new Date();
    const endDate = subscription.end_date
      ? new Date(subscription.end_date)
      : null;

    logger.info("📅 Checking subscription dates", {
      prefix: "Supabase",
      data: {
        profileId,
        currentUsage: subscription.usage_count,
        startDate: subscription.start_date,
        endDate: subscription.end_date,
        currentDate: now.toISOString(),
        monthlyLimit: subscription.plans.monthly_email_limit,
      },
    });

    // If subscription is active and we're past the end date, reset usage
    if (endDate && now > endDate) {
      const newStartDate = new Date();
      const newEndDate = new Date();
      newEndDate.setMonth(newEndDate.getMonth() + 1);

      logger.info("🔄 Resetting usage and updating period", {
        prefix: "Supabase",
        data: {
          profileId,
          previousEndDate: endDate.toISOString(),
          newStartDate: newStartDate.toISOString(),
          newEndDate: newEndDate.toISOString(),
          daysOverdue: Math.floor(
            (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24)
          ),
        },
      });

      const { error: updateError } = await supabaseAnon
        .from("subscriptions")
        .update({
          usage_count: 0,
          start_date: newStartDate.toISOString(),
          end_date: newEndDate.toISOString(),
        })
        .eq("id", subscription.id);

      if (updateError) {
        logger.error("❌ Error resetting usage and updating period", {
          prefix: "Supabase",
          data: {
            error: updateError,
            profileId,
            subscriptionId: subscription.id,
          },
        });
        return;
      }

      logger.info("✅ Usage reset and period updated successfully", {
        prefix: "Supabase",
        data: {
          profileId,
          previousUsage: subscription.usage_count,
          newUsage: 0,
          previousStartDate: subscription.start_date,
          previousEndDate: subscription.end_date,
          newStartDate: newStartDate.toISOString(),
          newEndDate: newEndDate.toISOString(),
        },
      });
    } else {
      logger.info("⏭️ No reset needed - subscription within date range", {
        prefix: "Supabase",
        data: {
          profileId,
          currentUsage: subscription.usage_count,
          daysUntilReset: endDate
            ? Math.floor(
                (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              )
            : "no end date",
        },
      });
    }
  } catch (error) {
    logger.error("💥 Error checking usage reset", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        profileId,
      },
    });
  }
}

interface SubscriptionWithUsage {
  usage_count: number;
  start_date: string;
  end_date: string | null;
  plans: {
    monthly_email_limit: number;
  };
}

export async function getSubscriptionUsage(profileId: string): Promise<{
  currentUsage: number;
  monthlyLimit: number;
} | null> {
  try {
    const { data: subscription, error } = await supabaseAnon
      .from("subscriptions")
      .select(
        `
        usage_count,
        plans!inner (
          monthly_email_limit
        )
      `
      )
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single<SubscriptionWithUsage>();

    if (error || !subscription) {
      return null;
    }

    return {
      currentUsage: subscription.usage_count ?? 0,
      monthlyLimit: subscription.plans.monthly_email_limit,
    };
  } catch (error) {
    logger.error("❌ Error fetching subscription usage", {
      prefix: "Supabase",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
      },
    });
    return null;
  }
}

export async function createSubscription(
  profileId: string,
  planId: string
): Promise<Subscription | null> {
  try {
    logger.info("🔑 Creating/updating subscription", {
      prefix: "Supabase",
      data: { profileId, planId },
    });

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const { data: subscription, error } = await supabaseAnon
      .from("subscriptions")
      .upsert(
        {
          profile_id: profileId,
          plan_id: planId,
          status: "active",
          usage_count: 0,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
        },
        {
          onConflict: "profile_id",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (error) throw error;

    logger.info("✅ Subscription created/updated successfully", {
      prefix: "Supabase",
      data: { profileId, planId },
    });

    return subscription;
  } catch (error) {
    logger.error("❌ Error creating/updating subscription", {
      prefix: "Supabase",
      data: { error, profileId, planId },
    });
    return null;
  }
}

export async function renewSubscription(
  subscriptionId: string
): Promise<boolean> {
  try {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const { error } = await supabaseAnon
      .from("subscriptions")
      .update({
        status: "active",
        usage_count: 0,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      })
      .eq("id", subscriptionId);

    if (error) throw error;
    return true;
  } catch (error) {
    logger.error("❌ Error renewing subscription", {
      prefix: "Supabase",
      data: { error, subscriptionId },
    });
    return false;
  }
}

export async function getFreePlanId(): Promise<string> {
  try {
    const { data, error } = await supabaseAnon
      .from("plans")
      .select("id")
      .eq("plan_name", PlanName.Free)
      .single();

    if (error) throw error;
    return data?.id ?? "";
  } catch (error) {
    logger.error("❌ Error getting free plan id", {
      prefix: "Supabase",
      data: { error },
    });
    return "";
  }
}
