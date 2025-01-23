import xml2js from "xml2js";

async function fetchChannelFeed(channelName: string) {
  /*
  Youtube Feeds:
  https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
  https://www.youtube.com/feeds/videos.xml?user=USER_NAME
  https://www.youtube.com/feeds/videos.xml?playlist_id=PLAYLIST_UPLOADS
*/

  // Remove @ sign from the channel name
  const channelNameWithoutAt = channelName.replace("@", "");

  const response = await fetch(
    `https://www.youtube.com/feeds/videos.xml?user=${channelNameWithoutAt}`
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

  // "https://www.youtube.com/channel/UCW5wxEjGHWNyatgZe-PU_tA"
  // This is uri and the id is the last part of the url which is UCW5wxEjGHWNyatgZe-PU_tA
  const channelIdOnly = uri.split("/").pop();
  console.log("📺 Channel id is fetched from xml feed:", channelIdOnly);

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
      channelId: channelIdOnly,
    },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channelName = searchParams.get("channelName");

  if (!channelName) {
    return Response.json({ success: false, error: "Channel name is required" });
  }

  try {
    const result = await fetchChannelFeed(channelName);
    return Response.json(result.data);
  } catch (error) {
    console.error("Error fetching channel feed:", error);
    return Response.json({
      success: false,
      error: "Failed to fetch channel feed",
    });
  }
}
