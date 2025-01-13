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
    args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(
      "/var/task/node_modules/@sparticuz/chromium/bin"
    ),
    headless: true,
  });
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const identifier = searchParams.get("identifier");

  console.log("🎯 API Request - identifier:", identifier);

  if (!identifier) {
    console.log("❌ Error: Identifier is required");
    return Response.json({ success: false, error: "Identifier is required" });
  }

  let browser;
  try {
    console.log("🌐 Launching browser...");
    browser = await getBrowser();
    console.log("✅ Browser launched successfully");

    // Clean up the identifier (handle both URL and channel name)
    console.log("🔍 Resolving channel ID for:", identifier);
    const channelId = await resolveChannelId(identifier);

    if (!channelId) {
      console.log("❌ Error: Channel not found for identifier:", identifier);
      return Response.json({ success: false, error: "Channel not found" });
    }
    console.log("✅ Channel ID resolved:", channelId);

    // Get channel details using Puppeteer
    console.log("🤖 Fetching channel details...");
    const page = await browser.newPage();
    await page.goto(`https://www.youtube.com/channel/${channelId}`);

    // Get channel details
    const channelData = await page.evaluate(() => {
      const title = document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content");
      const description = document
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content");
      const thumbnail = document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content");

      // Try XPath first for subscriber count
      let subscriberCount = 0;
      const subscriberXPath = document.evaluate(
        "/html/body/ytd-app/div[1]/ytd-page-manager/ytd-browse/div[3]/ytd-tabbed-page-header/tp-yt-app-header-layout/div/tp-yt-app-header/div[2]/div/div[2]/yt-page-header-renderer/yt-page-header-view-model/div/div[1]/div/yt-content-metadata-view-model/div[2]/span[1]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;

      const subscriberText = subscriberXPath?.textContent?.trim();
      if (subscriberText) {
        console.log("🚀 ~ channelData ~ subscriberText:", subscriberText)
        const match = subscriberText.match(/[\d,.]+[KMB]?/);
        if (match) {
          const numStr = match[0];
          if (numStr.includes("K")) {
            subscriberCount = parseFloat(numStr.replace("K", "")) * 1000;
          } else if (numStr.includes("M")) {
            subscriberCount = parseFloat(numStr.replace("M", "")) * 1000000;
          } else if (numStr.includes("B")) {
            subscriberCount = parseFloat(numStr.replace("B", "")) * 1000000000;
          } else {
            subscriberCount = parseInt(numStr.replace(/[^0-9]/g, ""));
          }
        }
      }

      // Fallback to previous selectors if XPath didn't work
      if (subscriberCount === 0) {
        const subscriberSelectors = [
          "yt-formatted-string#subscriber-count",
          "#subscriber-count",
          "#subscribers",
          "ytd-channel-subtitle-renderer yt-formatted-string",
        ];

        for (const selector of subscriberSelectors) {
          const element = document.querySelector(selector);
          const text = element?.textContent?.trim();
          if (text) {
            const match = text.match(/[\d,.]+[KMB]?/);
            if (match) {
              const numStr = match[0];
              // Convert K, M, B to actual numbers
              if (numStr.includes("K")) {
                subscriberCount = parseFloat(numStr.replace("K", "")) * 1000;
              } else if (numStr.includes("M")) {
                subscriberCount = parseFloat(numStr.replace("M", "")) * 1000000;
              } else if (numStr.includes("B")) {
                subscriberCount =
                  parseFloat(numStr.replace("B", "")) * 1000000000;
              } else {
                subscriberCount = parseInt(numStr.replace(/[^0-9]/g, ""));
              }
              break;
            }
          }
        }
      }

      // Try to get customUrl from the new structure first
      let customUrl = null;
      const customUrlSpan = document.querySelector(
        '.yt-content-metadata-view-model-wiz__metadata-text span[style*="font-weight: 500"]'
      );

      const customUrlText = customUrlSpan?.textContent?.trim();
      if (customUrlText) {
        customUrl = customUrlText.startsWith("@")
          ? customUrlText
          : `@${customUrlText}`;
        console.log("📎 Found custom URL:", customUrl);
      }

      // Fallback to previous selectors if new structure didn't work
      if (!customUrl) {
        const urlSelectors = [
          'link[rel="canonical"]',
          'meta[property="og:url"]',
          "#channel-handle",
          "#text-container yt-formatted-string#text",
        ];

        for (const selector of urlSelectors) {
          const element = document.querySelector(selector);
          let value = "";

          if (selector.includes("link") || selector.includes("meta")) {
            value =
              element?.getAttribute("href") ||
              element?.getAttribute("content") ||
              "";
          } else {
            value = element?.textContent?.trim() || "";
          }

          if (value) {
            if (value.includes("/@")) {
              customUrl = value.split("/@")[1].split("/")[0];
              break;
            } else if (value.startsWith("@")) {
              customUrl = value;
              break;
            }
          }
        }
      }

      console.log("📌 Final Custom URL:", customUrl);
      console.log("📌 Final Subscriber Count:", subscriberCount);

      return {
        title,
        description,
        thumbnail,
        subscriberCount,
        customUrl: customUrl ? customUrl.replace(/^@+/, "@") : null,
      };
    });

    // Add debug logging
    console.log("🔍 Channel Data:", channelData);

    // Get latest videos with updated selectors
    await page.goto(`https://www.youtube.com/channel/${channelId}/videos`);
    await page.waitForSelector(
      "ytd-grid-video-renderer, ytd-rich-item-renderer"
    );

    // Add debug logging
    console.log("🎥 Fetching latest videos...");

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

    // Get the latest non-Short video
    const latestVideo = latestVideos[0];

    const response = {
      success: true,
      channel: {
        id: channelId,
        title: channelData.title || "",
        thumbnail: channelData.thumbnail || "",
        subscriberCount: channelData.subscriberCount,
        lastVideoId: latestVideo?.id,
        lastVideoDate: latestVideo?.publishedAt,
        customUrl: channelData.customUrl,
      },
    };

    console.log("🎉 Success - Returning channel data:", response);
    return Response.json(response);
  } catch (error) {
    console.error("💥 Error fetching YouTube channel info:", error);
    return Response.json({
      success: false,
      error: "Failed to fetch channel info",
    });
  } finally {
    if (browser) {
      await browser.close();
      console.log("🔒 Browser closed");
    }
  }
}

async function resolveChannelId(identifier: string): Promise<string | null> {
  try {
    console.log("🔍 Resolving channel ID - Input:", identifier);

    // Use our new URL resolver
    const result = await resolveYouTubeChannelUrl(identifier);

    if (!result.url) {
      console.error("❌ Could not resolve channel URL:", result.error);
      return null;
    }

    // Extract channel ID from the resolved URL
    const channelUrl = result.url;
    console.log("✅ Resolved channel URL:", channelUrl);

    // If we have a canonical URL with channel ID, extract it
    if (channelUrl.includes("/channel/")) {
      const channelId = channelUrl.split("/channel/")[1].split("/")[0];
      console.log("✅ Channel ID found:", channelId);
      return channelId;
    }

    // If we only have a handle URL, we need to get the canonical URL
    if (channelUrl.includes("/@")) {
      console.log("🔄 Got handle URL, fetching canonical URL...");
      const browser = await getBrowser();

      const page = await browser.newPage();
      await page.goto(channelUrl);

      // Get the canonical URL which should contain the channel ID
      const canonicalUrl = await page
        .$eval('link[rel="canonical"]', (el) => el.getAttribute("href"))
        .catch(() => null);

      await browser.close();

      if (canonicalUrl?.includes("/channel/")) {
        const channelId = canonicalUrl.split("/channel/")[1].split("/")[0];
        console.log("✅ Channel ID found:", channelId);
        return channelId;
      }
    }

    console.log("❌ Could not extract channel ID");
    return null;
  } catch (error) {
    console.error("💥 Error resolving channel ID:", error);
    return null;
  }
}

async function resolveYouTubeChannelUrl(
  input: string
): Promise<{ url: string | null; error?: string }> {
  try {
    console.log("🔍 Resolving YouTube channel input:", input);

    // Clean the input
    const cleanInput = input.trim();

    // Handle empty input
    if (!cleanInput) {
      return { url: null, error: "Input is empty" };
    }

    // Different patterns to check
    const patterns = {
      fullUrl: /^(https?:\/\/)?(www\.)?youtube\.com\/@[\w-]+/,
      channelHandle: /^@[\w-]+$/,
      username: /^[\w-]+$/, // Basic username pattern
    };

    let testUrl: string;

    // 1. Handle full URLs
    if (patterns.fullUrl.test(cleanInput)) {
      try {
        const url = new URL(
          cleanInput.startsWith("http") ? cleanInput : `https://${cleanInput}`
        );
        testUrl = url.toString();
      } catch (error) {
        console.error("Error parsing URL:", error);
        return { url: null, error: "Invalid URL format" };
      }
    }
    // 2. Handle @username format
    else if (patterns.channelHandle.test(cleanInput)) {
      testUrl = `https://www.youtube.com/${cleanInput}`;
    }
    // 3. Handle regular username
    else if (patterns.username.test(cleanInput)) {
      testUrl = `https://www.youtube.com/@${cleanInput}`;
    } else {
      return { url: null, error: "Invalid input format" };
    }

    // Validate and get the canonical URL
    const validatedUrl = await validateAndGetChannelUrl(testUrl);
    return validatedUrl
      ? { url: validatedUrl }
      : { url: null, error: "Channel not found" };
  } catch (error) {
    console.error("Error resolving YouTube channel:", error);
    return { url: null, error: "Failed to resolve channel" };
  }
}

async function validateAndGetChannelUrl(
  testUrl: string
): Promise<string | null> {
  let browser;
  try {
    console.log("🤖 Validating channel URL:", testUrl);
    browser = await getBrowser();

    const page = await browser.newPage();

    // Set a reasonable timeout
    await page.setDefaultNavigationTimeout(10000);

    // Navigate to the test URL
    const response = await page.goto(testUrl);

    // Check if page was redirected to homepage (invalid channel)
    const finalUrl = page.url();
    if (
      finalUrl === "https://www.youtube.com/" ||
      finalUrl === "https://www.youtube.com"
    ) {
      console.log("❌ Invalid channel - redirected to homepage");
      return null;
    }

    // Check if we got a 404 or other error
    if (!response?.ok()) {
      console.log("❌ Invalid channel - error response");
      return null;
    }

    // Wait for channel-specific elements
    try {
      await Promise.race([
        page.waitForSelector("#channel-header", { timeout: 5000 }),
        page.waitForSelector("#channel-name", { timeout: 5000 }),
        page.waitForSelector('meta[property="og:url"]', { timeout: 5000 }),
      ]);
    } catch {
      console.log("❌ Channel elements not found");
      return null;
    }

    // Get the canonical URL if available
    const canonicalUrl = await page
      .$eval('link[rel="canonical"]', (el) => el.getAttribute("href"))
      .catch(() => null);

    if (canonicalUrl?.includes("/channel/")) {
      console.log("✅ Found canonical channel URL");
      return canonicalUrl;
    }

    // If no canonical URL, but page loaded successfully, return the final URL
    if (finalUrl.includes("/channel/") || finalUrl.includes("/@")) {
      console.log("✅ Using final URL");
      return finalUrl;
    }

    console.log("❌ No valid channel URL found");
    return null;
  } catch (error) {
    console.error("💥 Error validating channel URL:", error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// This enables the function to run in the background for up to 15 minutes
export const config = {
  type: "experimental-background",
};
