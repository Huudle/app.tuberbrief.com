import { Browser } from "puppeteer-core";
import { getBrowser } from "../utils/browser";

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
    browser = await getBrowser();
    const channelId = await resolveChannelId(identifier, browser);

    if (!channelId) {
      return Response.json({ success: false, error: "Channel not found" });
    }

    return Response.json({
      success: true,
      channelId,
    });
  } catch (error) {
    console.error("💥 Error resolving channel ID:", error);
    return Response.json({
      success: false,
      error: "Failed to resolve channel ID",
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Move resolveChannelId, resolveYouTubeChannelUrl, and validateAndGetChannelUrl functions here
// (keeping their implementations the same)

async function resolveChannelId(identifier: string, browser: Browser): Promise<string | null> {
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
