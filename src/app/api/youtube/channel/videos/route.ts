import { getBrowser } from "../utils/browser";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");

  if (!channelId) {
    return Response.json({ success: false, error: "Channel ID is required" });
  }

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.goto(`https://www.youtube.com/channel/${channelId}/videos`);
    await page.waitForSelector(
      "ytd-grid-video-renderer, ytd-rich-item-renderer"
    );

    const latestVideos = await page.evaluate(() => {
      const videos = document.querySelectorAll(
        "ytd-grid-video-renderer, ytd-rich-item-renderer"
      );
      console.log(`📊 Found ${videos.length} videos`);
      const videoInfos = [];

      for (const video of videos) {
        const titleElement = video.querySelector(
          "#video-title, #title-wrapper"
        );
        const title = titleElement?.textContent?.trim();
        const url =
          titleElement?.getAttribute("href") ||
          video.querySelector("a#thumbnail")?.getAttribute("href");

        const id = url?.includes("v=")
          ? url.split("v=")[1]?.split("&")[0]
          : url?.split("/").pop();

        const isShort =
          title?.toLowerCase().includes("#short") ||
          title?.toLowerCase().includes("#shorts") ||
          video.querySelector('[overlay-style="SHORTS"]') !== null;

        // Get date from metadata-line's second span
        let dateText = "";
        const metadataLine = video.querySelector("#metadata-line");
        const spans = metadataLine?.querySelectorAll(
          "span.style-scope.ytd-grid-video-renderer"
        );
        if (spans && spans.length >= 2) {
          dateText = spans[1].textContent?.trim() || "";
          console.log(`🕒 Found date text for "${title}":`, dateText);
        }

        const publishedAt = parseYouTubeDate(dateText);
        console.log(`📅 Parsed date for "${title}":`, publishedAt);

        if (id && !isShort) {
          videoInfos.push({
            id,
            title,
            url: `https://www.youtube.com/watch?v=${id}`,
            publishedAt,
          });
        }
      }

      function parseYouTubeDate(dateText: string): string {
        const now = new Date();

        // Handle recent uploads (hours/minutes)
        if (
          !dateText ||
          dateText.includes("hour") ||
          dateText.includes("minute")
        ) {
          return now.toISOString();
        }

        // Extract number from date text
        const number = parseInt(dateText.match(/\d+/)?.[0] || "0");

        // Calculate days based on unit
        const days = dateText.includes("day")
          ? number
          : dateText.includes("week")
          ? number * 7
          : dateText.includes("month")
          ? number * 30
          : dateText.includes("year")
          ? number * 365
          : 0;

        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString();
      }

      return videoInfos;
    });

    return Response.json({
      success: true,
      videos: latestVideos,
    });
  } catch (error) {
    console.error("💥 Error fetching latest videos:", error);
    return Response.json({
      success: false,
      error: "Failed to fetch latest videos",
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
