export async function getChannelInfo(identifier: string, profileId: string) {
  try {
    const response = await fetch(
      `/api/youtube/channel?identifier=${encodeURIComponent(
        identifier
      )}&profileId=${profileId}`
    );
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to fetch channel info");
    }

    return data;
  } catch (error) {
    console.error("Error fetching channel info:", error);
    throw error;
  }
}

export async function resolveChannelId(
  identifier: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `/api/youtube/channel/resolve-channel-id?identifier=${encodeURIComponent(
        identifier
      )}`
    );
    const data = await response.json();

    if (!data.success) {
      return null;
    }

    return data.channelId;
  } catch (error) {
    console.error("Error resolving channel ID:", error);
    return null;
  }
}

interface Channel {
  author: string;
  uri: string;
  title: string;
  thumbnail: string;
  viewCount: number;
  lastVideoId: string;
  lastVideoDate: string;
  channelId: string;
}

export async function fetchChannelFeed(
  channelId: string
): Promise<Channel> {
  try {
    const response = await fetch(
      `/api/youtube/channel/resolve-channel-id-feed?channelId=${encodeURIComponent(
        channelId
      )}`
    );
    const data = await response.json();
    console.log("🚀 ~ fetchChannelFeed ~ data:", data);

    if (!data) {
      throw new Error(data.error || "Failed to fetch channel feed");
    }

    return data;
  } catch (error) {
    console.error("Error fetching channel feed:", error);
    throw error;
  }
}
