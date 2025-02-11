import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {
  YouTubeChannel,
  ChannelListItem,
  ChannelProcessingStatus,
  ChannelQueryResult,
  VideoAIContent,
  CaptionData,
} from "./types";

export const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  }
);

export const supabaseServicePGMQPublic = (url: string, key: string) => {
  // Check if url or key is empty
  if (!url || !key) {
    throw new Error("URL or key is empty");
  }
  return createClient(url, key, {
    db: {
      schema: "pgmq_public",
    },
  });
};

export const supabaseServicePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  }
);

export async function checkIfChannelIsLinked(
  profileId: string,
  channelId: string
): Promise<boolean> {
  const { error: checkError } = await supabaseAnon
    .from("profile_youtube_channels")
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
    .from("profile_youtube_channels")
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
        .from("profile_youtube_channels")
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
      .from("profile_youtube_channels")
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
      .from("profile_youtube_channels")
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
  const { data, error } = await supabaseServicePublic
    .from("video_ai_content")
    .select("*")
    .eq("video_id", videoId)
    .single();

  if (error || !data) return null;
  return data;
}

export async function storeAIContent(
  videoId: string,
  aiContent: VideoAIContent
): Promise<void> {
  const { error } = await supabaseServicePublic
    .from("video_ai_content")
    .upsert({
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
}

// Add new function to increment usage count
export async function incrementSubscriptionUsage(profileId: string) {
  logger.info("📊 Incrementing subscription usage", {
    prefix: "Supabase",
    data: { profileId },
  });

  try {
    // Get current subscription
    const { data: currentSub, error: fetchError } = await supabaseAnon
      .from("subscriptions")
      .select("id, usage_count, plan_id")
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single();

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

    // Update usage count only
    const { error: updateError } = await supabaseAnon
      .from("subscriptions")
      .update({
        usage_count: (currentSub.usage_count ?? 0) + 1,
      })
      .eq("id", currentSub.id);

    if (updateError) {
      logger.error("❌ Error updating usage count", {
        prefix: "Supabase",
        data: { error: updateError, profileId },
      });
      throw updateError;
    }

    logger.info("✅ Usage count incremented successfully", {
      prefix: "Supabase",
      data: { profileId, newCount: (currentSub.usage_count ?? 0) + 1 },
    });
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
