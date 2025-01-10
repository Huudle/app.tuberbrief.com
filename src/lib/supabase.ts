import { createClient } from "@supabase/supabase-js";
import { env } from "@/env.mjs";
import { getDefaultAvatar } from "@/lib/utils";
import { UserPlan } from "@/lib/constants";

export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export interface Profile {
  id: string;
  updated_at?: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  plan: UserPlan;
}

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
  subscriberCount: number;
  lastVideoDate: string;
  thumbnail: string;
  latestVideoId: string;
  avatar: string;
  createdAt: string;
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
  };
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
  }
): Promise<YouTubeChannel> {
  console.log("🚀 Starting addYouTubeChannel");
  console.log("📝 Profile ID:", profileId);
  console.log("📦 Channel Data:", channelData);

  try {
    // Check if the channel is already linked to this profile
    console.log("🔍 Checking for existing channel link...");
    const { data: existingLink, error: checkError } = await supabase
      .from("profile_youtube_channels")
      .select("*")
      .eq("profile_id", profileId)
      .eq("youtube_channel_id", channelData.id)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 is "not found" error
      console.error("❌ Error checking for existing channel:", checkError);
      throw checkError;
    }

    if (existingLink) {
      console.log("⚠️ Channel already exists for this profile");
      const error = new Error(
        `You've already added the channel "${channelData.title}"`
      );
      error.name = "DuplicateChannelError";
      throw error;
    }

    // First, upsert the YouTube channel
    console.log("🔄 Upserting YouTube channel...");
    const { data: upsertData, error: channelError } = await supabase
      .from("youtube_channels")
      .upsert({
        id: channelData.id,
        title: channelData.title,
        thumbnail: channelData.thumbnail,
        subscriber_count: channelData.subscriberCount,
        last_video_id: channelData.lastVideoId,
        last_video_date: channelData.lastVideoDate,
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
    console.log("✅ Channel upsert successful:", upsertData);

    // Then, create the profile-channel association
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

    // Return the channel data
    console.log("📡 Fetching final channel data...");
    const { data: channel, error: fetchError } = await supabase
      .from("youtube_channels")
      .select("*")
      .eq("id", channelData.id)
      .single();

    if (fetchError) {
      console.error("❌ Error fetching channel:", fetchError);
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

export async function getCurrentUserAndProfile(): Promise<{
  id: string;
  email: string;
  profile: Profile | null;
} | null> {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session) return null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (!profile?.avatar_url) {
      profile.avatar_url = getDefaultAvatar({
        email: session.user.email!,
      });
    }

    return {
      id: session.user.id,
      email: session.user.email!,
      profile: profileError ? null : profile,
    };
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

export async function getUserPlan(
  userId: string
): Promise<"free" | "basic" | "pro"> {
  const { data, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  if (error || !data) return "free";
  return data.plan as "free" | "basic" | "pro";
}

export async function getProfileChannels(
  profileId: string
): Promise<ChannelListItem[]> {
  console.log("📡 Fetching channels for profile:", profileId);

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
          last_video_date
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

    console.log("✅ Fetched channels:", data);

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
