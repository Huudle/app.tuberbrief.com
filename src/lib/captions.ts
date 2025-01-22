import { Video, YouTubeCaptionTrack } from "./types";
import { getStoredCaptions, storeCaptions } from "./supabase";

interface CaptionData {
  transcript: string;
  language: string;
  duration: number;
}

const parseXMLCaptions = (xmlContent: string): string => {
  try {
    const captionLines = xmlContent.match(/<text[^>]*>(.*?)<\/text>/g) || [];
    const plainText = captionLines
      .map((line) => {
        const textContent = line.replace(/<[^>]*>/g, "");
        return textContent
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return plainText;
  } catch (error) {
    console.error("[Caption Fetcher] Error parsing captions XML:", error);
    return "";
  }
};

const findBestCaptionTrack = (
  tracks: YouTubeCaptionTrack[],
  defaultLanguage = "en"
) => {
  return (
    // 1. Manual in default language
    tracks.find(
      (track) =>
        track.languageCode === defaultLanguage && !track.kind?.includes("asr")
    ) ||
    // 2. Auto in default language
    tracks.find((track) => track.languageCode === defaultLanguage) ||
    // 3. Manual English (if not already English)
    (defaultLanguage !== "en" &&
      tracks.find(
        (track) => track.languageCode === "en" && !track.kind?.includes("asr")
      )) ||
    // 4. Auto English (if not already English)
    (defaultLanguage !== "en" &&
      tracks.find((track) => track.languageCode === "en")) ||
    // 5. Any manual captions
    tracks.find((track) => !track.kind?.includes("asr")) ||
    // 6. First available track
    tracks[0]
  );
};

const fetchVideoCaption = async (video: Video): Promise<CaptionData | null> => {
  try {
    console.log("🎬 Starting caption fetch for video:", {
      id: video.id,
      url: video.url,
    });

    const response = await fetch(video.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-CH-UA": `"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"`,
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": "macOS",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video page: ${response.status}`);
    }

    const htmlContent = await response.text();

    // Basic validation
    if (htmlContent.length < 1000) {
      console.warn("⚠️ HTML content suspiciously small");
      return null;
    }

    const captionTracksRegex = /"captionTracks":\[(.*?)\](?=,\s*")/;
    const match = htmlContent.match(captionTracksRegex);

    if (!match?.[1]) {
      console.log("⚠️ No caption tracks found");
      return null;
    }

    const captionTracks = JSON.parse(`[${match[1]}]`);
    console.log("📋 Found caption tracks:", captionTracks);
    console.log(
      "📋 Found caption tracks:",
      captionTracks.map((track: YouTubeCaptionTrack) => ({
        language: track.languageCode,
        isAuto: track.kind?.includes("asr"),
      }))
    );

    const selectedTrack = findBestCaptionTrack(captionTracks);
    if (!selectedTrack?.baseUrl) {
      console.log("⚠️ No suitable caption track found");
      return null;
    }

    const decodedUrl = selectedTrack.baseUrl
      .replace(/\\u0026/g, "&")
      .replace(/\\/g, "");

    const captionsResponse = await fetch(decodedUrl);
    if (!captionsResponse.ok) {
      throw new Error(`Failed to fetch captions: ${captionsResponse.status}`);
    }

    const captionsContent = await captionsResponse.text();
    const transcript = parseXMLCaptions(captionsContent);

    console.log("✅ Successfully fetched captions:", {
      language: selectedTrack.languageCode,
      length: transcript.length,
      isAuto: selectedTrack.kind?.includes("asr"),
    });

    return {
      transcript,
      language: selectedTrack.languageCode || "en",
      duration: 0,
    };
  } catch (error) {
    console.error("💥 Caption fetcher error:", (error as Error).message);
    return null;
  }
};

export async function fetchCaptions(
  videoId: string,
  title?: string
): Promise<string> {
  console.log("🎥 Fetching captions for video:", videoId);

  try {
    const storedCaptions = await getStoredCaptions(videoId);
    if (storedCaptions) {
      console.log("📚 Using stored captions for:", videoId);
      return storedCaptions.transcript;
    }

    const video = {
      id: videoId,
      title: title || "Video",
      url: `https://www.youtube.com/watch?v=${videoId}`,
    } as Video;

    const captionData = await fetchVideoCaption(video);
    if (!captionData) {
      return "No captions available for this video.";
    }

    await storeCaptions(videoId, {
      transcript: captionData.transcript,
      language: captionData.language,
      title: title,
    });

    return captionData.transcript;
  } catch (error) {
    console.error("❌ Error fetching captions:", error);
    throw new Error(
      `Failed to fetch captions: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
