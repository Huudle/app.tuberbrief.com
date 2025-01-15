import { env } from "@/env.mjs";

import axios from "axios";
import {
  addYouTubeChannel,
  createOrUpdateChannel,
  updateChannelProcessingStatus,
} from "@/lib/supabase";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export async function GET(channelId: string, profileId: string) {
  console.log("🎯 API Request  -", { channelId, profileId });

  if (!channelId || !profileId) {
    console.log("❌ Error: Missing required parameters");
    return Response.json({
      success: false,
      error: "ChannelId and ProfileId are required",
    });
  }

  try {
    const result = await createOrUpdateChannel(channelId);
    if (!result.success) return Response.json(result);

    // Start background processing
    processChannel(channelId, profileId).catch(console.error);
    return Response.json(result);
  } catch (error) {
    console.error("💥 Error:", error);
    return Response.json({
      success: false,
      error: "Failed to process channel",
    });
  }
}

async function processChannel(channelId: string, profileId: string) {
  const startTime = performance.now();
  console.log("🎬 Starting channel processing for:", channelId);

  try {
    // Get channel details
    const channelResponse = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
      params: {
        part: "snippet,statistics",
        id: channelId,
        key: env.YOUTUBE_API_KEY,
      },
    });

    const channelData = channelResponse.data.items[0];
    console.log(
      "📊 Channel data fetched:",
      performance.now() - startTime,
      "ms"
    );

    // Get latest video
    const videosResponse = await axios.get(`${YOUTUBE_API_BASE}/search`, {
      params: {
        part: "snippet",
        channelId: channelId,
        order: "date",
        maxResults: 1,
        type: "video",
        key: env.YOUTUBE_API_KEY,
      },
    });

    const latestVideo = videosResponse.data.items[0];
    console.log(
      "🎥 Latest video fetched:",
      performance.now() - startTime,
      "ms"
    );

    // Prepare channel data
    await addYouTubeChannel(profileId, {
      id: channelId,
      title: channelData.snippet.title,
      thumbnail: channelData.snippet.thumbnails.high.url,
      subscriberCount: parseInt(channelData.statistics.subscriberCount),
      lastVideoId: latestVideo?.id?.videoId || "",
      lastVideoDate:
        latestVideo?.snippet?.publishedAt || new Date().toISOString(),
      customUrl:
        channelData.snippet.customUrl ||
        `@${channelData.snippet.title.replace(/\s+/g, "")}`,
    });

    console.log("💾 Channel data saved:", performance.now() - startTime, "ms");
    await updateChannelProcessingStatus(channelId, "completed");

    const endTime = performance.now();
    console.log(
      "✅ Channel processing completed in:",
      endTime - startTime,
      "ms"
    );
  } catch (error) {
    const errorTime = performance.now();
    console.error("💥 Error processing channel:", error);
    console.log("❌ Failed after:", errorTime - startTime, "ms");

    await updateChannelProcessingStatus(
      channelId,
      "failed",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

export const config = {
  type: "experimental-background",
};
