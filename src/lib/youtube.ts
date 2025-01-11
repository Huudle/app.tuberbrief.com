
interface YouTubeChannelInfo {
  id: string;
  title: string;
  thumbnail: string;
  subscriberCount: number;
  lastVideoId?: string;
  lastVideoDate?: string;
  customUrl?: string;
}

export async function getChannelInfo(
  identifier: string
): Promise<YouTubeChannelInfo | null> {
  try {
    // Make the API call from the client side
    const response = await fetch(
      `/api/youtube/channel?identifier=${identifier}`
    );
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    return data.channel;
  } catch (error) {
    console.error("Error fetching YouTube channel info:", error);
    return null;
  }
}
