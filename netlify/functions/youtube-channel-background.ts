import {
  addYouTubeChannel,
  createOrUpdateChannel,
  updateChannelProcessingStatus,
} from "@/lib/supabase";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { Context } from "@netlify/functions";

const getBrowser = async () => {
  return puppeteer.launch({
    args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
};

async function resolveChannelId(identifier: string): Promise<string | null> {
  try {
    console.log("🔍 Resolving channel ID - Input:", identifier);
    const result = await resolveYouTubeChannelUrl(identifier);

    if (!result.url) {
      console.error("❌ Could not resolve channel URL:", result.error);
      return null;
    }

    const channelUrl = result.url;
    console.log("✅ Resolved channel URL:", channelUrl);

    if (channelUrl.includes("/channel/")) {
      const channelId = channelUrl.split("/channel/")[1].split("/")[0];
      console.log("✅ Channel ID found:", channelId);
      return channelId;
    }

    if (channelUrl.includes("/@")) {
      console.log("🔄 Got handle URL, fetching canonical URL...");
      const browser = await getBrowser();

      const page = await browser.newPage();
      await page.goto(channelUrl);

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
    const cleanInput = input.trim();

    if (!cleanInput) {
      return { url: null, error: "Input is empty" };
    }

    const patterns = {
      fullUrl: /^(https?:\/\/)?(www\.)?youtube\.com\/@[\w-]+/,
      channelHandle: /^@[\w-]+$/,
      username: /^[\w-]+$/,
    };

    let testUrl: string;

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
    } else if (patterns.channelHandle.test(cleanInput)) {
      testUrl = `https://www.youtube.com/${cleanInput}`;
    } else if (patterns.username.test(cleanInput)) {
      testUrl = `https://www.youtube.com/@${cleanInput}`;
    } else {
      return { url: null, error: "Invalid input format" };
    }

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
    await page.setDefaultNavigationTimeout(10000);
    const response = await page.goto(testUrl);

    const finalUrl = page.url();
    if (
      finalUrl === "https://www.youtube.com/" ||
      finalUrl === "https://www.youtube.com"
    ) {
      console.log("❌ Invalid channel - redirected to homepage");
      return null;
    }

    if (!response?.ok()) {
      console.log("❌ Invalid channel - error response");
      return null;
    }

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

    const canonicalUrl = await page
      .$eval('link[rel="canonical"]', (el) => el.getAttribute("href"))
      .catch(() => null);

    if (canonicalUrl?.includes("/channel/")) {
      console.log("✅ Found canonical channel URL");
      return canonicalUrl;
    }

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

async function processChannel(channelId: string, profileId: string) {
  let browser;
  try {
    browser = await getBrowser();

    // Get channel details
    const page = await browser.newPage();
    await page.goto(`https://www.youtube.com/channel/${channelId}`);

    const channelData = await page.evaluate(() => {
      const title = document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content");
      const thumbnail = document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content");

      // Get subscriber count using XPath
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

      // Get custom URL
      let customUrl = null;
      const customUrlSpan = document.querySelector(
        '.yt-content-metadata-view-model-wiz__metadata-text span[style*="font-weight: 500"]'
      );

      const customUrlText = customUrlSpan?.textContent?.trim();
      if (customUrlText) {
        customUrl = customUrlText.startsWith("@")
          ? customUrlText
          : `@${customUrlText}`;
      }

      // Get latest video info
      const latestVideoId = document
        .querySelector(
          "ytd-grid-video-renderer a#thumbnail, ytd-rich-item-renderer a#thumbnail"
        )
        ?.getAttribute("href")
        ?.split("v=")[1]
        ?.split("&")[0];

      const latestVideoDate = new Date().toISOString(); // You might want to get the actual date

      return {
        title,
        thumbnail,
        subscriberCount,
        customUrl: customUrl ? customUrl.replace(/^@+/, "@") : null,
        latestVideoId,
        latestVideoDate,
      };
    });

    // Use the existing addYouTubeChannel function to update the data
    await addYouTubeChannel(profileId, {
      id: channelId,
      title: channelData.title || "",
      thumbnail: channelData.thumbnail || "",
      subscriberCount: channelData.subscriberCount || 0,
      lastVideoId: channelData.latestVideoId || "",
      lastVideoDate: channelData.latestVideoDate || new Date().toISOString(),
      customUrl: channelData.customUrl || "",
    });

    // Update processing status
    await updateChannelProcessingStatus(channelId, "completed");
  } catch (error) {
    console.error("💥 Error processing channel:", error);
    await updateChannelProcessingStatus(
      channelId,
      "failed",
      (error as Error).message
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

const handler = async (req: Request, context: Context) => {
  const { searchParams } = new URL(req.url);
  const identifier = searchParams.get("identifier");
  const profileId = searchParams.get("profileId");

  console.log("🎯 Background Function Request -", { identifier, profileId });

  if (!identifier) {
    console.log("❌ Error: Identifier is required");
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: "Identifier is required" }),
    };
  }

  if (!profileId) {
    console.log("❌ Error: ProfileId is required");
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: "ProfileId is required" }),
    };
  }

  try {
    const resolvedChannelId = await resolveChannelId(identifier);
    if (!resolvedChannelId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "Could not resolve channel ID",
        }),
      };
    }

    // Create or update channel record
    const result = await createOrUpdateChannel(resolvedChannelId, identifier);

    if (!result.success) {
      return {
        statusCode: 400,
        body: JSON.stringify(result),
      };
    }

    // Start background processing
    processChannel(resolvedChannelId, profileId).catch(console.error);

    // Return immediately with channel ID
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("💥 Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: "Failed to process channel",
      }),
    };
  }
};

export { handler };
