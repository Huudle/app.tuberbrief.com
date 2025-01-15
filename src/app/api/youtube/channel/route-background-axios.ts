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
  console.log("⚙️ Parameters:", { channelId, profileId });

  try {
    // Get channel details
    console.log("📡 Fetching channel details from YouTube API...");
    const channelResponse = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
      params: {
        part: "snippet,statistics",
        id: channelId,
        key: env.YOUTUBE_API_KEY,
      },
    });
    console.log("📊 Channel API response status:", channelResponse.status);
    console.log(
      "📊 Channel data:",
      JSON.stringify(channelResponse.data, null, 2)
    );

    const channelData = channelResponse.data.items[0];
    if (!channelData) {
      throw new Error("No channel data found");
    }
    console.log("📊 Extracted channel data:", {
      title: channelData.snippet.title,
      subscribers: channelData.statistics.subscriberCount,
      customUrl: channelData.snippet.customUrl,
    });
    console.log(
      "⏱️ Channel data fetched:",
      performance.now() - startTime,
      "ms"
    );

    // Get latest video
    console.log("📡 Fetching latest video data...");
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
    console.log("🎥 Videos API response status:", videosResponse.status);
    console.log(
      "🎥 Videos data:",
      JSON.stringify(videosResponse.data, null, 2)
    );

    const latestVideo = videosResponse.data.items[0];
    if (latestVideo) {
      console.log("🎥 Latest video details:", {
        videoId: latestVideo.id?.videoId,
        title: latestVideo.snippet?.title,
        publishedAt: latestVideo.snippet?.publishedAt,
      });
    } else {
      console.log("⚠️ No videos found for channel");
    }
    console.log("⏱️ Video data fetched:", performance.now() - startTime, "ms");

    // Prepare channel data
    const channelDataToSave = {
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
    };
    console.log("📦 Prepared data for saving:", channelDataToSave);

    // Save to database
    console.log("💾 Saving channel data to database...");
    await addYouTubeChannel(profileId, channelDataToSave);
    console.log("💾 Channel data saved successfully");
    console.log(
      "⏱️ Database operation completed:",
      performance.now() - startTime,
      "ms"
    );

    // Update status
    console.log("📝 Updating processing status...");
    await updateChannelProcessingStatus(channelId, "completed");
    console.log("✅ Status updated to completed");

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    console.log("🏁 Channel processing completed successfully");
    console.log("⏱️ Total processing time:", totalTime, "ms");
    console.log("📊 Performance breakdown:", {
      totalTimeMs: totalTime,
      timeStamps: {
        channelDataFetch: performance.now() - startTime,
        videoDataFetch: performance.now() - startTime,
        databaseOperation: performance.now() - startTime,
      },
    });
  } catch (error) {
    const errorTime = performance.now();
    console.error("💥 Error processing channel");
    console.error("❌ Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timeToError: errorTime - startTime,
    });

    if (axios.isAxiosError(error)) {
      console.error("🌐 API Error Details:", {
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers,
      });
    }

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
