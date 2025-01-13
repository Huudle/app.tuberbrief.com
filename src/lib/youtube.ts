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
