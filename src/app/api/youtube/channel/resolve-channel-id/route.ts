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
      fullUrl:
        /^(https?:\/\/)?(www\.)?youtube\.com\/(@[\w-]+|c\/[\w-]+|channel\/[\w-]+|[\w-]+)/,
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const identifier = searchParams.get("identifier");

  if (!identifier) {
    return Response.json({ success: false, error: "Identifier is required" });
  }

  try {
    const channelId = await resolveChannelId(identifier);

    if (!channelId) {
      return Response.json({
        success: false,
        error: "Could not resolve channel ID",
      });
    }

    return Response.json({
      success: true,
      channelId,
    });
  } catch (error) {
    console.error("Error resolving channel ID:", error);
    return Response.json({
      success: false,
      error: "Failed to resolve channel ID",
    });
  }
}



