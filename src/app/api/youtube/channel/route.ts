/* eslint-disable @typescript-eslint/no-explicit-any */
import { env } from "@/env.mjs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const identifier = searchParams.get("identifier");

    console.log("🎯 API Request - identifier:", identifier);

    if (!identifier) {
      console.log("❌ Error: Identifier is required");
      return Response.json({ success: false, error: "Identifier is required" });
    }

    try {
      // Try YouTube API first (if enabled)
      if (false) { // TODO: Enable when needed
        console.log("📡 Attempting YouTube API method...");
        const apiData = await handleYouTubeAPI(identifier || "");
        if (apiData.success) {
          console.log("✅ YouTube API method successful");
          return Response.json(apiData);
        }
      }

      // Fallback to Puppeteer method using separate endpoints
      console.log("🤖 Using Puppeteer fallback method...");
      
      // 1. Resolve Channel ID
      console.log("1️⃣ Resolving channel ID...");
      const resolveResponse = await fetch(
        `${request.url.split('?')[0]}/resolve?identifier=${encodeURIComponent(identifier)}`
      );
      const resolveData = await resolveResponse.json();

      if (!resolveData.success) {
        console.log("❌ Failed to resolve channel ID");
        return Response.json(resolveData);
      }

      const channelId = resolveData.channelId;
      console.log("✅ Channel ID resolved:", channelId);

      // 2. Get Channel Details
      console.log("2️⃣ Fetching channel details...");
      const detailsResponse = await fetch(
        `${request.url.split('?')[0]}/details?channelId=${channelId}`
      );
      const detailsData = await detailsResponse.json();

      if (!detailsData.success) {
        console.log("❌ Failed to fetch channel details");
        return Response.json(detailsData);
      }

      // 3. Get Latest Videos
      console.log("3️⃣ Fetching latest videos...");
      const videosResponse = await fetch(
        `${request.url.split('?')[0]}/videos?channelId=${channelId}`
      );
      const videosData = await videosResponse.json();

      // Combine the results
      const response = {
        success: true,
        channel: {
          ...detailsData.channel,
          lastVideoId: videosData.success ? videosData.videos[0]?.id : null,
          lastVideoDate: videosData.success ? videosData.videos[0]?.publishedAt : null,
        },
      };

      console.log("🎉 Success - Returning combined data");
      return Response.json(response);

    } catch (error) {
      console.error("💥 Error in primary handler:", error);
      return Response.json({
        success: false,
        error: "Failed to fetch channel info",
      });
    }
  } catch (error) {
    console.error("💥 Critical error:", error);
    return Response.json({
      success: false,
      error: "Failed to fetch channel info",
    });
  }
}

// Keep the YouTube API method for future use
async function handleYouTubeAPI(identifier: string) {
  // ... (keep existing YouTube API implementation)
  const channelId = await resolveChannelId(identifier);

  if (!channelId) {
    return { success: false, error: "Channel not found" };
  }

  const channelResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${env.YOUTUBE_API_KEY}`
  );
  const channelData = await channelResponse.json();

  if (!channelData.items?.length) {
    return { success: false, error: "Channel not found" };
  }

  const channel = channelData.items[0];
  
  // Get latest videos
  const videosResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=1&type=video&key=${env.YOUTUBE_API_KEY}`
  );
  const videosData = await videosResponse.json();

  return {
    success: true,
    channel: {
      id: channel.id,
      title: channel.snippet.title,
      thumbnail: channel.snippet.thumbnails.default.url,
      subscriberCount: parseInt(channel.statistics.subscriberCount),
      lastVideoId: videosData.items?.[0]?.id.videoId,
      lastVideoDate: videosData.items?.[0]?.snippet.publishedAt,
    },
  };
}

// Helper function for YouTube API method
async function resolveChannelId(identifier: string): Promise<string | null> {
  try {
    if (identifier.includes("youtube.com") || identifier.includes("youtu.be")) {
      const url = new URL(identifier);
      
      if (url.pathname.startsWith("/@")) {
        const username = url.pathname.slice(2);
        return await getChannelIdFromUsername(username);
      }

      if (url.pathname.includes("/channel/")) {
        return url.pathname.split("/channel/")[1];
      }

      if (url.pathname.startsWith("/c/")) {
        const customUrl = url.pathname.slice(3);
        return await getChannelIdFromCustomUrl(customUrl);
      }
    }

    return await getChannelIdFromUsername(identifier);
  } catch (error) {
    console.error("Error resolving channel ID:", error);
    return null;
  }
}

// Keep these helper functions for the YouTube API method
async function getChannelIdFromUsername(username: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${username}&key=${env.YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    return data.items?.[0]?.id || await searchChannelByUsername(username);
  } catch (error) {
    console.error("Error getting channel ID from username:", error);
    return null;
  }
}

async function searchChannelByUsername(username: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${username}&type=channel&key=${env.YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    return data.items?.[0]?.id.channelId || null;
  } catch (error) {
    console.error("Error searching for channel:", error);
    return null;
  }
}

async function getChannelIdFromCustomUrl(customUrl: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&q=${customUrl}&type=channel&key=${env.YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    return data.items?.[0]?.id.channelId || null;
  } catch (error) {
    console.error("Error getting channel ID from custom URL:", error);
    return null;
  }
}
