import {
  addYouTubeChannel,
  createOrUpdateChannel,
  updateChannelProcessingStatus,
} from "@/lib/supabase";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { parseRelativeTime } from "@/lib/utils";

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

export async function GET(channelId: string, profileId: string) {
  console.log("🎯 API Request  -", { channelId, profileId });

  if (!channelId) {
    console.log("❌ Error: ChannelId is required");
    return Response.json({ success: false, error: "ChannelId is required" });
  }

  if (!profileId) {
    console.log("❌ Error: ProfileId is required");
    return Response.json({ success: false, error: "ProfileId is required" });
  }

  try {
    // Create or update channel record
    const result = await createOrUpdateChannel(channelId);

    if (!result.success) {
      return Response.json(result);
    }

    // Start background processing
    processChannel(channelId, profileId).catch(console.error);

    // Return immediately with success
    return Response.json(result);
  } catch (error) {
    console.error("💥 Error:", error);
    return Response.json({
      success: false,
      error: "Failed to process channel",
    });
  }
}

async function processChannel(channelId: string, profileId: string) {
  const startTime = performance.now();
  let browser;
  console.log("🎬 Starting channel processing for:", channelId);

  try {
    browser = await getBrowser();
    console.log("🌐 Browser launched:", performance.now() - startTime, "ms");

    // Get channel details
    const page = await browser.newPage();
    await page.goto(`https://www.youtube.com/channel/${channelId}/videos`);
    console.log("📄 Page loaded:", performance.now() - startTime, "ms");

    const channelData = await page.evaluate(() => {
      const title = document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content");
      const thumbnail = document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content");

      // Get subscriber count using XPath first
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
        console.log("🚀 ~ channelData ~ subscriberText:", subscriberText);
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

      const latestVideoDateText =
        document
          .querySelector(
            // Try the CSS selector first
            "#metadata-line > span:nth-child(4), " +
              // Fallback to newer layout selector
              "#metadata-line span.style-scope.ytd-grid-video-renderer:nth-child(2)"
          )
          ?.textContent?.trim() || "";

      return {
        title,
        thumbnail,
        subscriberCount,
        customUrl: customUrl ? customUrl.replace(/^@+/, "@") : null,
        latestVideoId,
        latestVideoDateText,
      };
    });
    console.log("📊 Channel data extracted:", performance.now() - startTime, "ms");

    // Parse the relative time outside of page.evaluate()
    const lastVideoDate = channelData.latestVideoDateText
      ? parseRelativeTime(channelData.latestVideoDateText)
      : new Date().toISOString();

    // Use the existing addYouTubeChannel function to update the data
    await addYouTubeChannel(profileId, {
      id: channelId,
      title: channelData.title || "",
      thumbnail: channelData.thumbnail || "",
      subscriberCount: channelData.subscriberCount || 0,
      lastVideoId: channelData.latestVideoId || "",
      lastVideoDate,
      customUrl: channelData.customUrl || "",
    });
    console.log("💾 Channel data saved:", performance.now() - startTime, "ms");

    // Update processing status
    await updateChannelProcessingStatus(channelId, "completed");
    const endTime = performance.now();
    console.log("✅ Channel processing completed in:", endTime - startTime, "ms");

  } catch (error) {
    const errorTime = performance.now();
    console.error("💥 Error processing channel:", error);
    console.log("❌ Failed after:", errorTime - startTime, "ms");
    await updateChannelProcessingStatus(
      channelId,
      "failed",
      (error as Error).message
    );
  } finally {
    if (browser) {
      await browser.close();
      console.log("🏁 Browser closed:", performance.now() - startTime, "ms");
    }
  }
}

export const config = {
  type: "experimental-background",
};
