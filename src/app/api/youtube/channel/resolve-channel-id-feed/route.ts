import xml2js from "xml2js";

async function fetchChannelFeed(channelId: string) {
  const response = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
  );
  const data = await response.text();

  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(data);

  // Get the first entry (latest video)
  const latestEntry = result.feed.entry?.[1];

  const author = result.feed.author[0].name[0];
  const uri = result.feed.author[0].uri[0];
  const title = result.feed.title[0];

  // Get thumbnail from media:group/media:thumbnail
  const thumbnail =
    latestEntry?.["media:group"]?.[0]?.["media:thumbnail"]?.[0]?.$?.url || null;

  // Get view count from media:group/media:community/media:statistics
  const viewCount =
    latestEntry?.["media:group"]?.[0]?.["media:community"]?.[0]?.[
      "media:statistics"
    ]?.[0]?.$?.views || "0";

  const lastVideoId = latestEntry?.["yt:videoId"]?.[0];
  const lastVideoDate = latestEntry?.published?.[0];

  return {
    success: true,
    data: {
      author,
      uri,
      title,
      thumbnail,
      viewCount: parseInt(viewCount, 10),
      lastVideoId,
      lastVideoDate,
      channelId,
    },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");

  if (!channelId) {
    return Response.json({ success: false, error: "Channel ID is required" });
  }

  try {
    const result = await fetchChannelFeed(channelId);
    console.log("🚀 ~ GET ~ result.data:", result.data);
    return Response.json(result.data);
  } catch (error) {
    console.error("Error fetching channel feed:", error);
    return Response.json({
      success: false,
      error: "Failed to fetch channel feed",
    });
  }
}
