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

    return Response.json({
      success: true,
      channel: {
        id: channelId,
        title: channelData.title || "",
        thumbnail: channelData.thumbnail || "",
        subscriberCount: channelData.subscriberCount,
        customUrl: channelData.customUrl,
      },
    });
  } catch (error) {
    console.error("💥 Error fetching channel details:", error);
    return Response.json({
      success: false,
      error: "Failed to fetch channel details",
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
