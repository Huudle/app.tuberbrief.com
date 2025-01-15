import { GET as getFallbackData } from "./route-fallback";
import { GET as getBackgroundData } from "./route-background-axios";
import { handleYouTubeAPI } from "./youtube-api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const profileId = searchParams.get("profileId");


    if (!channelId) {
      console.log("❌ Error: ChannelId is required");
      return Response.json({ success: false, error: "ChannelId is required" });
    }

    if (!profileId) {
      console.log("❌ Error: ProfileId is required");
      return Response.json({ success: false, error: "ProfileId is required" });
    }

    try {
      // Try YouTube API first
      // TODO: Uncomment this when we successfully run Puppeteer on Netlify
      if (false) {
        console.log("📡 Attempting YouTube API method first...");
        const apiResponse = await handleYouTubeAPI(request);
        const apiData = await apiResponse.json();

        if (apiData.success) {
          console.log("✅ YouTube API method successful");
          return Response.json(apiData);
        }
      }

      // Use background processing by default
      console.log("🔄 Using background processing method...");
      return getBackgroundData(channelId, profileId);
    } catch (error) {
      console.error("💥 Error in primary handler:", error);
      // Fall back to synchronous processing if background fails
      console.log("⚠️ Falling back to synchronous method...");
      return getFallbackData(request);
    }
  } catch (error) {
    console.error("💥 Critical error:", error);
    return Response.json({
      success: false,
      error: "Failed to fetch channel info",
    });
  }
}
