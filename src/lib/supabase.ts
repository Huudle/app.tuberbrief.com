import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail: string;
  subscriber_count: number;
  last_video_id: string;
  last_video_date: string;
}

export interface ChannelListItem {
  id: string;
  name: string;
  url: string;
  customUrl: string;
  subscriberCount: number;
  lastVideoDate: string;
  thumbnail: string;
  latestVideoId: string;
  avatar: string;
  createdAt: string;
}

export interface ChannelProcessingStatus {
  success: boolean;
  status: "pending" | "completed" | "failed";
  channelId?: string;
  message?: string;
  error?: string;
}

interface ChannelQueryResult {
  id: string;
  created_at: string;
  youtube_channel: {
    id: string;
    title: string;
    thumbnail: string;
    subscriber_count: number;
    last_video_id: string;
    last_video_date: string;
    custom_url: string;
  };
}

export async function checkIfChannelIsLinked(
  profileId: string,
  channelId: string
): Promise<boolean> {
  const { error: checkError } = await supabase
    .from("profile_youtube_channels")
    .select("*")
    .eq("profile_id", profileId)
    .eq("youtube_channel_id", channelId)
    .single();

  if (checkError?.code === "PGRST116") {
    return false;
  }

  if (checkError) {
    console.error(
      "❌ Error checking if channel is linked:",
      (checkError as Error).message
    );
    throw checkError;
  }

  return true;
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
  console.log("🚀 Starting addYouTubeChannel");
  console.log("📝 Profile ID:", profileId);
  console.log("📦 Channel Data:", channelData);

  try {
    // First, upsert the YouTube channel
    console.log("🔄 Upserting YouTube channel...");
    const { error: channelError } = await supabase
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
      console.error(
        "❌ Error upserting YouTube channel:",
        (channelError as Error).message
      );
      console.error("Details:", {
        code: channelError.code,
        message: channelError.message,
        details: channelError.details,
        hint: channelError.hint,
      });
      throw channelError;
    }
    console.log("✅ Channel upsert successful");

    if (!(await checkIfChannelIsLinked(profileId, channelData.id))) {
      console.log("🔗 Creating profile-channel association...");
      const { data: linkData, error: linkError } = await supabase
        .from("profile_youtube_channels")
        .insert({
          profile_id: profileId,
          youtube_channel_id: channelData.id,
        });

      if (linkError) {
        console.error("❌ Error linking profile to channel:", linkError);
        console.error("Details:", {
          code: linkError.code,
          message: linkError.message,
          details: linkError.details,
          hint: linkError.hint,
        });
        throw linkError;
      }
      console.log("✅ Profile-channel link successful:", linkData);
    }

    // Return the channel data
    console.log("📡 Fetching final channel data...");
    const { data: channel, error: fetchError } = await supabase
      .from("youtube_channels")
      .select("*")
      .eq("id", channelData.id)
      .single();

    if (fetchError) {
      console.error(
        "❌ Error fetching channel:",
        (fetchError as Error).message
      );
      console.error("Details:", {
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
      });
      throw fetchError;
    }

    if (!channel) {
      console.error("❌ No channel data found after upsert");
      throw new Error("Channel not found after upsert");
    }

    console.log("✅ Final channel data fetched:", channel);
    console.log("🎉 addYouTubeChannel completed successfully");

    return channel;
  } catch (error) {
    console.error("💥 Unexpected error in addYouTubeChannel:", error);
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    throw error;
  }
}

export async function getProfileChannels(
  profileId: string
): Promise<ChannelListItem[]> {
  try {
    const { data, error } = await supabase
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
      console.error("❌ Error fetching channels:", error);
      throw error;
    }

    if (!data) {
      console.log("ℹ️ No channels found");
      return [];
    }

    // First cast to unknown, then to our expected type
    const typedData = data as unknown as ChannelQueryResult[];

    return typedData.map((item) => ({
      id: item.id,
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
    console.error("💥 Error in getProfileChannels:", error);
    throw error;
  }
}

export async function deleteProfileChannel(
  profileId: string,
  channelId: string
) {
  console.log("🗑️ Deleting channel", { profileId, channelId });

  try {
    const { error } = await supabase
      .from("profile_youtube_channels")
      .delete()
      .eq("profile_id", profileId)
      .eq("id", channelId);

    if (error) {
      console.error("❌ Error deleting channel:", error);
      throw error;
    }

    console.log("✅ Channel deleted successfully");
  } catch (error) {
    console.error("💥 Error in deleteProfileChannel:", error);
    throw error;
  }
}

export async function createOrUpdateChannel(
  channelId: string
): Promise<ChannelProcessingStatus> {
  // Check if channel already exists
  const { data: existingChannel } = await supabase
    .from("youtube_channels")
    .select("*")
    .eq("id", channelId)
    .single();

  if (existingChannel) {
    // Update existing channel's processing status
    await supabase
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
  const { error: channelError } = await supabase
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
    console.log("💥 Error creating channel:", channelError);
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
  await supabase
    .from("youtube_channels")
    .update({
      processing_status: status,
      last_sync_at: new Date().toISOString(),
      sync_error: error || null,
    })
    .eq("id", channelId);
}
