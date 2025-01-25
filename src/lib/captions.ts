import { Video, YouTubeCaptionTrack } from "./types";
import { getStoredCaptions, storeCaptions } from "./supabase";
import { exec } from "child_process";
import { promisify } from "util";

interface CaptionData {
  transcript: string;
  language: string;
  duration: number;
}

const execAsync = promisify(exec);

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

    // Use curl instead of fetch
    const { stdout, stderr } = await execAsync(`curl -s '${video.url}' \
      -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
      -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' \
      -H 'Accept-Language: en-US,en;q=0.9' \
      -H 'Connection: keep-alive' \
      -H 'Upgrade-Insecure-Requests: 1' \
      -H 'Cache-Control: no-cache'`);

    if (stderr) {
      console.error("⚠️ Curl stderr:", stderr);
    }

    const htmlContent = stdout;

    // Log all the HTML content's meta tags
    console.log(
      "🔍 HTML content meta tags:",
      htmlContent.match(/<meta[^>]*>/g)
    );

    // Basic validation
    if (htmlContent.length < 1000) {
      console.warn("⚠️ HTML content suspiciously small:", {
        length: htmlContent.length,
        preview: htmlContent.substring(0, 200),
      });
      return null;
    }

    const captionTracksRegex = /"captionTracks":\[(.*?)\](?=,\s*")/;
    const match = htmlContent.match(captionTracksRegex);

    if (!match?.[1]) {
      console.log(
        "⚠️ No caption tracks found in HTML content. Preview:",
        htmlContent.substring(0, 500)
      );
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

    // Use curl for caption content too
    const { stdout: captionsContent, stderr: captionsError } = await execAsync(
      `curl -s '${decodedUrl}'`
    );

    if (captionsError) {
      console.error("⚠️ Curl stderr for captions:", captionsError);
    }

    if (!captionsContent) {
      throw new Error("Failed to fetch captions content");
    }

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
    console.error("💥 Caption fetcher error:", {
      error: error instanceof Error ? error.message : error,
      videoId: video.id,
      url: video.url,
    });
    return null;
  }
};

export async function fetchCaptions(
  videoId: string,
  title?: string
): Promise<string | null> {
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
      return null;
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
