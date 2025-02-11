import xml2js from "xml2js";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { logger } from "@/lib/logger";

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

  // For production deployment: Ubuntu 22.04.5 LTS (aarch64)
  // Installed by:
  // sudo apt install -y chromium-browser
  const executablePath = "/snap/bin/chromium";

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: executablePath,
    headless: chromium.headless,
  });
};

// Scraping works on development machines but not on production machines usually. For example, on Netlify, Vercel, etc.
// Even on our own servers, it doesn't work as expected.
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

    logger.info(`🔍 Navigating to: https://www.youtube.com/@${channelName}`, {
      prefix: "YouTube Scraper",
    });

    // Navigate to the channel page
    const response = await page.goto(
      `https://www.youtube.com/@${channelName}`,
      {
        waitUntil: "networkidle0",
        timeout: 30000,
      }
    );

    // Check if page was found
    if (response?.status() === 404) {
      throw new Error(`Channel not found: ${channelName}`);
    }

    // Wait for any of these selectors to appear
    try {
      await Promise.race([
        page.waitForSelector('meta[property="og:url"]', { timeout: 15000 }),
        page.waitForSelector('link[rel="canonical"]', { timeout: 15000 }),
        page.waitForSelector('meta[itemprop="channelId"]', { timeout: 15000 }),
      ]);
    } catch (error) {
      logger.info("⏳ Timeout waiting for selectors, checking URL...", {
        prefix: "YouTube Scraper",
      });
      // If selectors aren't found, try to get info from URL
      const currentUrl = page.url();
      if (currentUrl.includes("/channel/")) {
        const channelId = currentUrl.split("/channel/")[1].split("/")[0];
        const title = await page.title();
        return {
          success: true,
          data: {
            author: title || channelName,
            uri: currentUrl,
            title: title || channelName,
            thumbnail: null,
            viewCount: 0,
            lastVideoId: null,
            lastVideoDate: null,
            channelId,
          },
        };
      }
      throw error;
    }

    // Extract channel info with fallbacks
    const channelInfo = await page.evaluate(() => {
      const getMetaContent = (selector: string) =>
        document.querySelector(selector)?.getAttribute("content");

      const url =
        getMetaContent('meta[property="og:url"]') ||
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
        window.location.href;

      const title =
        getMetaContent('meta[property="og:title"]') ||
        getMetaContent('meta[name="title"]') ||
        document.title;

      const image =
        getMetaContent('meta[property="og:image"]') ||
        getMetaContent('meta[name="thumbnail"]');

      return { url, title, image };
    });

    if (!channelInfo.url) {
      throw new Error("Could not find channel URL");
    }

    // Extract channel ID from URL
    const channelId = channelInfo.url.includes("/channel/")
      ? channelInfo.url.split("/channel/")[1].split("/")[0]
      : channelInfo.url.split("/").pop();

    logger.info("✅ Successfully scraped channel info:", {
      prefix: "YouTube Scraper",
      data: channelInfo,
    });

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
    logger.error("💥 Scraping error:", {
      prefix: "YouTube Scraper",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    throw new Error(
      `Failed to scrape channel info: ${(error as Error).message}`
    );
  } finally {
    await browser.close();
  }
}

async function extractChannelIdFromHtml(channelName: string) {
  try {
    // Handle four formats:
    // 1. @username -> https://www.youtube.com/@username
    // 2. Channel ID -> https://www.youtube.com/channel/UCAi_uNeDWRXj8C8yw358gWw
    // 3. Custom URL -> https://www.youtube.com/c/GoogleDevelopers
    // 4. username -> https://www.youtube.com/username
    const isChannelId =
      channelName.startsWith("UC") && channelName.length === 24;
    const channelNameWithoutAt = channelName.replace("@", "");

    let url;
    if (isChannelId) {
      url = `https://www.youtube.com/channel/${channelName}`;
    } else if (channelName.startsWith("@")) {
      url = `https://www.youtube.com/@${channelNameWithoutAt}`;
    } else {
      // Try custom URL format first
      url = `https://www.youtube.com/c/${channelNameWithoutAt}`;
    }

    const response = await fetch(url);

    // If custom URL fails, try other formats as fallback
    if (response.status === 404 && !channelName.startsWith("@")) {
      logger.info("🔄 Custom URL not found, trying @username format...", {
        prefix: "YouTube Resolver",
      });
      url = `https://www.youtube.com/@${channelNameWithoutAt}`;
      const retryResponse = await fetch(url);

      // If @username fails, try plain username format
      if (retryResponse.status === 404) {
        logger.info("🔄 @username not found, trying plain username format...", {
          prefix: "YouTube Resolver",
        });
        url = `https://www.youtube.com/${channelNameWithoutAt}`;
        const finalResponse = await fetch(url);

        if (finalResponse.status === 404) {
          throw new Error(`Channel not found: ${channelName}`);
        }
        if (!finalResponse.ok) {
          throw new Error(
            `Failed to fetch channel page: ${finalResponse.status}`
          );
        }
        return await handleChannelPage(finalResponse, channelName);
      }

      if (!retryResponse.ok) {
        throw new Error(
          `Failed to fetch channel page: ${retryResponse.status}`
        );
      }
      return await handleChannelPage(retryResponse, channelName);
    }

    if (response.status === 404) {
      throw new Error(`Channel not found: ${channelName}`);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch channel page: ${response.status}`);
    }

    return await handleChannelPage(response, channelName);
  } catch (error) {
    logger.error("❌ Failed to extract channel info from HTML:", {
      prefix: "YouTube Resolver",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    throw error;
  }
}

// Helper function to handle channel page response
async function handleChannelPage(response: Response, channelName: string) {
  const html = await response.text();

  // First try to get channel ID from og:url
  const ogUrlMatch = html.match(/<meta property="og:url" content="([^"]+)"/);
  let channelId;

  if (ogUrlMatch && ogUrlMatch[1].includes("/channel/")) {
    channelId = ogUrlMatch[1].split("/channel/")[1].split("/")[0];
  } else {
    // Fallback to searching in the HTML
    const channelIdMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
    if (!channelIdMatch) {
      throw new Error("Channel ID not found in page HTML");
    }
    channelId = channelIdMatch[1];
  }

  // Use og:url as canonical URL if available
  const canonicalUrl =
    ogUrlMatch?.[1] || `https://www.youtube.com/channel/${channelId}`;

  // Extract title (try multiple patterns)
  let title = channelName;
  const titlePatterns = [
    /<meta name="title" content="([^"]+)"/,
    /<meta property="og:title" content="([^"]+)"/,
    /<title>([^<]+)<\/title>/,
  ];

  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match) {
      title = match[1].replace(" - YouTube", "");
      break;
    }
  }

  // Extract thumbnail (try multiple patterns)
  let thumbnail = null;
  const thumbnailPatterns = [
    /"avatar":\{"thumbnails":\[{"url":"([^"]+)"/,
    /<meta property="og:image" content="([^"]+)"/,
    /"thumbnails":\[\{"url":"([^"]+)","width":\d+,"height":\d+\}\]/,
  ];

  for (const pattern of thumbnailPatterns) {
    const match = html.match(pattern);
    if (match) {
      thumbnail = match[1];
      break;
    }
  }

  // Try to extract subscriber count and view count
  const subscriberMatch = html.match(
    /"subscriberCountText":\{"simpleText":"([^"]+)"|"metadataParts":\[\{"text":\{"content":"([^"]+subscribers)"/
  );

  const subscribers = subscriberMatch?.[1] || subscriberMatch?.[2];

  logger.info("📺 Channel info extracted from HTML:", {
    prefix: "YouTube Scraper",
    data: {
      channelId,
      title,
      url: canonicalUrl,
      thumbnail,
      subscribers,
      views: null,
      latestVideo: null,
      published: null,
    },
  });

  return {
    success: true,
    data: {
      author: title,
      uri: canonicalUrl,
      title,
      thumbnail,
      viewCount: null, // Could parse from viewCountMatch if needed
      lastVideoId: null,
      lastVideoDate: null,
      channelId,
    },
  };
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
      logger.info("🔄 XML feed not found, trying HTML extraction...", {
        prefix: "YouTube Feed",
      });
      try {
        return await extractChannelIdFromHtml(channelNameWithoutAt);
      } catch {
        logger.info("🔄 HTML extraction failed, falling back to scraping...", {
          prefix: "YouTube Feed",
        });
        return await scrapeChannelInfo(channelNameWithoutAt);
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.status}`);
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
    logger.info("🆔 Channel id is fetched from xml feed", {
      prefix: "YouTube Feed",
      data: { channelId: channelIdOnly },
    });
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
    logger.error("❌ XML feed failed with error:", {
      prefix: "YouTube Feed",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });

    // Try HTML extraction before puppeteer
    try {
      logger.info("🔄 Trying HTML extraction...", { prefix: "YouTube Feed" });
      return await extractChannelIdFromHtml(channelName);
    } catch {
      logger.info("🔄 HTML extraction failed, falling back to scraping...", {
        prefix: "YouTube Feed",
      });
      return await scrapeChannelInfo(channelName);
    }
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
    logger.error("💥 Error fetching channel info:", {
      prefix: "YouTube API",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    return Response.json({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch channel info",
    });
  }
}
