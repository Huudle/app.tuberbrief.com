import { env } from "@/env.mjs";

interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

interface Channel {
  kind: string;
  etag: string;
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl: string;
    publishedAt: string;
    thumbnails: { default: Thumbnail; medium: Thumbnail; high: Thumbnail };
    localized: { title: string; description: string };
  };
  statistics: {
    viewCount: string;
    subscriberCount: string;
    hiddenSubscriberCount: boolean;
    videoCount: string;
  };
}

export async function handleYouTubeAPI(request: Request) {
  const { searchParams } = new URL(request.url);
  const identifier = searchParams.get("identifier");

  if (!identifier) {
    console.log("❌ Error: Identifier is required");
    return Response.json({ success: false, error: "Identifier is required" });
  }

  // Clean up the identifier (handle both URL and channel name)
  console.log("🔍 Resolving channel ID for:", identifier);
  const channelId = await resolveChannelId(identifier);

  if (!channelId) {
    console.log("❌ Error: Channel not found for identifier:", identifier);
    return Response.json({ success: false, error: "Channel not found" });
  }
  console.log("✅ Channel ID resolved:", channelId);

  // Get channel details
  console.log("📡 Fetching channel details...");
  const channelResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${env.YOUTUBE_API_KEY}`
  );
  const channelData = await channelResponse.json();

  if (!channelData.items?.length) {
    console.log("❌ Error: No channel data found for ID:", channelId);
    return Response.json({ success: false, error: "Channel not found" });
  }
  console.log("✅ Channel details fetched");

  const channel: Channel = channelData.items[0];

  // Get latest video (excluding Shorts)
  console.log("📡 Fetching latest videos...");
  const videosResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=10&type=video&key=${env.YOUTUBE_API_KEY}`
  );
  const videosData = await videosResponse.json();

  console.log("📺 Found videos:", videosData.items?.length);

  // Get detailed video information to check duration
  const videoIds = videosData.items
    ?.map((item: any) => item.id.videoId)
    .join(",");
  const videoDetailsResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${env.YOUTUBE_API_KEY}`
  );
  const videoDetails = await videoDetailsResponse.json();

  console.log("🎬 Filtering out Shorts...");
  const latestVideo = videoDetails.items?.find((video: any) => {
    const duration = video.contentDetails.duration; // PT#M#S format
    const isShort = duration.match(/PT(\d+)M?/)
      ? parseInt(duration.match(/PT(\d+)M?/)[1]) < 1
      : true;

    console.log(`Video ${video.id}:`, {
      title: video.snippet.title,
      duration,
      isShort,
      isShortByTitle: video.snippet.title.toLowerCase().includes("#shorts"),
    });

    return !isShort && !video.snippet.title.toLowerCase().includes("#shorts");
  });

  console.log("✅ Latest non-Short video found:", latestVideo?.id);

  const response = {
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

  console.log("🎉 Success - Returning channel data:", response);
  return Response.json(response);
}

async function resolveChannelId(identifier: string): Promise<string | null> {
  try {
    console.log("🔍 Resolving channel ID - Input:", identifier);

    // Handle different URL formats
    if (identifier.includes("youtube.com") || identifier.includes("youtu.be")) {
      const url = new URL(identifier);
      console.log("📝 URL detected:", url.toString());

      // Handle @username format
      if (url.pathname.startsWith("/@")) {
        const username = url.pathname.slice(2);
        console.log("👤 Found @username format:", username);
        return await getChannelIdFromUsername(username);
      }

      // Handle /channel/ID format
      if (url.pathname.includes("/channel/")) {
        const channelId = url.pathname.split("/channel/")[1];
        console.log("🆔 Found channel ID format:", channelId);
        return channelId;
      }

      // Handle /c/customURL format
      if (url.pathname.startsWith("/c/")) {
        const customUrl = url.pathname.slice(3);
        console.log("🔗 Found custom URL format:", customUrl);
        return await getChannelIdFromCustomUrl(customUrl);
      }
    }

    // If not a URL, try as username
    console.log("👤 Trying as username:", identifier);
    return await getChannelIdFromUsername(identifier);
  } catch (error) {
    console.error("💥 Error resolving channel ID:", error);
    return null;
  }
}

async function getChannelIdFromUsername(
  username: string
): Promise<string | null> {
  try {
    console.log("📡 Fetching channel ID for username:", username);
    const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${username}&key=${env.YOUTUBE_API_KEY}`;
    console.log("🔗 API URL:", url);

    const response = await fetch(url);
    const data = await response.json();

    console.log("📦 YouTube API Response:", data);

    if (data.error) {
      console.error("❌ YouTube API Error:", data.error);
      return null;
    }

    if (!data.items?.length) {
      console.log("⚠️ No channel found for username:", username);
      // Try search as a fallback
      return await searchChannelByUsername(username);
    }

    console.log("✅ Channel ID found:", data.items[0].id);
    return data.items[0].id;
  } catch (error) {
    console.error("💥 Error getting channel ID from username:", error);
    return null;
  }
}

async function searchChannelByUsername(
  username: string
): Promise<string | null> {
  try {
    console.log("🔍 Trying search fallback for:", username);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${username}&type=channel&key=${env.YOUTUBE_API_KEY}`;
    console.log("🔗 Search API URL:", url);

    const response = await fetch(url);
    const data = await response.json();

    console.log("📦 Search API Response:", data);

    if (data.error) {
      console.error("❌ Search API Error:", data.error);
      return null;
    }

    if (!data.items?.length) {
      console.log("⚠️ No channel found in search for:", username);
      return null;
    }

    // Log all items before filtering
    console.log("🔍 Searching through items:", data.items.length);
    data.items.forEach((item: any, index: number) => {
      const normalizedUsername = username.toLowerCase().replace(/\s+/g, "");
      const normalizedTitle = item.snippet.title
        .toLowerCase()
        .replace(/\s+/g, "");
      const normalizedChannelTitle = item.snippet.channelTitle
        .toLowerCase()
        .replace(/\s+/g, "");

      console.log(`
Item ${index + 1}:
- Title: "${item.snippet.title}"
- Channel Title: "${item.snippet.channelTitle}"
- Looking for: "${username}"
- Normalized username: "${normalizedUsername}"
- Normalized title: "${normalizedTitle}"
- Normalized channel title: "${normalizedChannelTitle}"
- Title matches: ${normalizedUsername.includes(normalizedTitle)}
- Channel Title matches: ${normalizedUsername.includes(normalizedChannelTitle)}
      `);
    });

    const channel = data.items.find((item: any) => {
      const normalizedUsername = username.toLowerCase().replace(/\s+/g, "");
      const normalizedTitle = item.snippet.title
        .toLowerCase()
        .replace(/\s+/g, "");
      const normalizedChannelTitle = item.snippet.channelTitle
        .toLowerCase()
        .replace(/\s+/g, "");

      const titleMatch = normalizedUsername.includes(normalizedTitle);
      const channelTitleMatch = normalizedUsername.includes(
        normalizedChannelTitle
      );

      return titleMatch || channelTitleMatch;
    });

    if (!channel) {
      console.log("❌ No exact match found, using first result instead");
      return data.items[0]?.id.channelId || null;
    }

    console.log("✅ Channel ID found from search:", channel.id.channelId);
    return channel.id.channelId;
  } catch (error) {
    console.error("💥 Error searching for channel:", error);
    return null;
  }
}

async function getChannelIdFromCustomUrl(
  customUrl: string
): Promise<string | null> {
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
