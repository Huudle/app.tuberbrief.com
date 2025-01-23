import xml2js from "xml2js";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const getBrowser = async () => {
  // For development
  if (process.env.NODE_ENV === "development") {
    return puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath:
        process.platform === "win32"
          ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
          : process.platform === "darwin"
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : "/usr/bin/google-chrome",
    });
  }
  // For Netlify deployment
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: chromium.executablePath.toString(),
    headless: chromium.headless,
  });
};

async function scrapeChannelInfo(channelName: string) {
  const browser = await getBrowser();

  try {
    const page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    );

    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    console.log(`Navigating to: https://www.youtube.com/@${channelName}`);
    await page.goto(`https://www.youtube.com/@${channelName}`, {
      waitUntil: "networkidle0",
      timeout: 10000,
    });

    // Wait for channel info to load
    await page.waitForSelector('meta[property="og:url"]', { timeout: 5000 });

    // Extract channel info
    const channelInfo = await page.evaluate(() => {
      const urlMeta = document.querySelector('meta[property="og:url"]');
      const titleMeta = document.querySelector('meta[property="og:title"]');
      const imageMeta = document.querySelector('meta[property="og:image"]');

      return {
        url: urlMeta?.getAttribute("content"),
        title: titleMeta?.getAttribute("content"),
        image: imageMeta?.getAttribute("content"),
      };
    });

    if (!channelInfo.url) {
      throw new Error("Could not find channel URL");
    }

    const channelId = channelInfo.url.split("/").pop();

    console.log("Successfully scraped channel info:", channelInfo);

    return {
      success: true,
      data: {
        author: channelInfo.title || channelName,
        uri: channelInfo.url,
        title: channelInfo.title || channelName,
        thumbnail: channelInfo.image || null,
        viewCount: 0,
        lastVideoId: null,
        lastVideoDate: null,
        channelId,
      },
    };
  } catch (error) {
    console.error("Scraping error:", error);
    throw new Error(`Failed to scrape channel info: ${error.message}`);
  } finally {
    await browser.close();
  }
}

async function fetchChannelFeed(channelName: string) {
  try {
    // First try XML feed
    const channelNameWithoutAt = channelName.replace("@", "");
    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?user=${channelNameWithoutAt}`
    );

    // Return 404 if the channel is not found
    if (response.status === 404) {
      throw new Error(`Channel xml feed not found: ${channelName}`);
    }

    if (!response.ok) {
      console.log("XML feed failed, falling back to scraping");
      return await scrapeChannelInfo(channelNameWithoutAt);
    }

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
      latestEntry?.["media:group"]?.[0]?.["media:thumbnail"]?.[0]?.$?.url ||
      null;

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
    console.log(" Channel id is fetched from xml feed", channelIdOnly);
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
  } catch (error) {
    console.error("XML feed failed with error:", error);
    console.log("Falling back to scraping...");
    return await scrapeChannelInfo(channelName);
  }
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
    console.error("Error fetching channel info:", error);
    return Response.json({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch channel info",
    });
  }
}
