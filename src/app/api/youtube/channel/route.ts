import {
  addYouTubeChannel,
  createOrUpdateChannel,
  updateChannelProcessingStatus,
} from "@/lib/supabase";
import { logger } from "@/lib/logger";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// Fetch with retry logic
async function fetchWithRetry(
  url: string,
  options: RequestInit & { retry?: number; retryDelay?: number } = {}
) {
  const { retry = 3, retryDelay = 1000, ...fetchOptions } = options;
  let lastError: Error | null = null;

  for (let i = 0; i < retry; i++) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          ...fetchOptions.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`🔄 Retry attempt ${i + 1} of ${retry}`, {
        prefix: "YouTube API",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      if (i < retry - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * (i + 1))
        );
      }
    }
  }

  throw lastError;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const profileId = searchParams.get("profileId");

    if (!channelId) {
      logger.error("❌ ChannelId is required", { prefix: "YouTube API" });
      return Response.json({ success: false, error: "ChannelId is required" });
    }

    if (!profileId) {
      logger.error("❌ ProfileId is required", { prefix: "YouTube API" });
      return Response.json({ success: false, error: "ProfileId is required" });
    }

    try {
      const result = await createOrUpdateChannel(channelId);
      if (!result.success) return Response.json(result);

      // Start background processing
      processChannel(channelId, profileId).catch((error) => {
        logger.error("💥 Background processing error", {
          prefix: "YouTube API",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      });
      return Response.json({
        success: true,
        message: "Channel processing started",
      });
    } catch (error) {
      logger.error("💥 Error getting background data", {
        prefix: "YouTube API",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      return Response.json({
        success: false,
        error: "Failed to process channel",
      });
    }
  } catch (error) {
    logger.error("💥 Critical error", {
      prefix: "YouTube API",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    return Response.json({
      success: false,
      error: "Failed to fetch channel info",
    });
  }
}

async function processChannel(channelId: string, profileId: string) {
  const startTime = performance.now();
  logger.info("🚀 Starting channel processing", {
    prefix: "YouTube API",
    data: { channelId, profileId },
  });

  try {
    // Get channel details
    logger.info("🔍 Fetching channel details from YouTube API", {
      prefix: "YouTube API",
    });
    const channelUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
    channelUrl.searchParams.append("part", "snippet,statistics");
    channelUrl.searchParams.append("id", channelId);
    channelUrl.searchParams.append("key", process.env.YOUTUBE_API_KEY!);

    const channelResponse = await fetchWithRetry(channelUrl.toString());
    logger.debug("📦 Channel data received", {
      prefix: "YouTube API",
      data: channelResponse,
    });

    const channelData = channelResponse.items[0];
    if (!channelData) {
      throw new Error("No channel data found");
    }

    logger.info("📊 Channel data extracted", {
      prefix: "YouTube API",
      data: {
        title: channelData.snippet.title,
        subscribers: channelData.statistics.subscriberCount,
        customUrl: channelData.snippet.customUrl,
      },
    });
    logger.debug("⏱️ Channel data fetch duration", {
      prefix: "YouTube API",
      data: { duration: `${performance.now() - startTime}ms` },
    });

    // Get latest video
    logger.info("🎥 Fetching latest video data", { prefix: "YouTube API" });
    const videosUrl = new URL(`${YOUTUBE_API_BASE}/search`);
    videosUrl.searchParams.append("part", "snippet");
    videosUrl.searchParams.append("channelId", channelId);
    videosUrl.searchParams.append("order", "date");
    videosUrl.searchParams.append("maxResults", "1");
    videosUrl.searchParams.append("type", "video");
    videosUrl.searchParams.append("key", process.env.YOUTUBE_API_KEY!);

    const videosResponse = await fetchWithRetry(videosUrl.toString());
    logger.debug("📦 Videos data received", {
      prefix: "YouTube API",
      data: videosResponse,
    });

    const latestVideo = videosResponse.items[0];
    if (latestVideo) {
      logger.info("📺 Latest video details", {
        prefix: "YouTube API",
        data: {
          videoId: latestVideo.id?.videoId,
          title: latestVideo.snippet?.title,
          publishedAt: latestVideo.snippet?.publishedAt,
        },
      });
    } else {
      logger.warn("⚠️ No videos found for channel", {
        prefix: "YouTube API",
        data: { channelId },
      });
    }
    logger.debug("⏱️ Video data fetch duration", {
      prefix: "YouTube API",
      data: { duration: `${performance.now() - startTime}ms` },
    });

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
    logger.info("📝 Prepared data for saving", {
      prefix: "YouTube API",
      data: channelDataToSave,
    });

    // Save to database
    logger.info("💾 Saving channel data to database", {
      prefix: "YouTube API",
    });
    await addYouTubeChannel(profileId, channelDataToSave);
    logger.info("✅ Channel data saved successfully", {
      prefix: "YouTube API",
    });
    logger.debug("⏱️ Database operation duration", {
      prefix: "YouTube API",
      data: { duration: `${performance.now() - startTime}ms` },
    });

    // Update status
    logger.info("🔄 Updating processing status", { prefix: "YouTube API" });
    await updateChannelProcessingStatus(channelId, "completed");
    logger.info("✅ Status updated to completed", { prefix: "YouTube API" });

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    logger.info("🎉 Channel processing completed successfully", {
      prefix: "YouTube API",
      data: { totalDuration: `${totalTime}ms` },
    });
  } catch (error) {
    const errorTime = performance.now();
    logger.error("💥 Error processing channel", {
      prefix: "YouTube API",
      data: {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timeToError: `${errorTime - startTime}ms`,
      },
    });

    await updateChannelProcessingStatus(
      channelId,
      "failed",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
