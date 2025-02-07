import { Video } from "@/lib/types";
import { getStoredCaptions, storeCaptions } from "@/lib/supabase";
import { getTranscript } from "@/lib/supadata";
import { CaptionData } from "@/lib/types";
import { logger } from "@/lib/logger";

/*
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
    logger.error("💥 Error parsing captions XML", {
      prefix: "Captions",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    return "";
  }
};
*/

/*
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
*/

const fetchVideoCaption = async (video: Video): Promise<CaptionData | null> => {
  try {
    logger.info("🎬 Starting caption fetch for video", {
      prefix: "Captions",
      data: {
        id: video.id,
        url: video.url,
      },
    });

    const transcriptResponse = await getTranscript(video.id, { text: true });
    logger.debug("🔍 Transcript response", {
      prefix: "Captions",
      data: { transcriptResponse },
    });

    // Handle error response from transcript service
    if (transcriptResponse?.error) {
      logger.warn("⚠️ Error fetching transcript", {
        prefix: "Captions",
        data: { videoId: video.id, message: transcriptResponse.message },
      });
      return {
        transcript: "",
        language: "",
        duration: 0,
      };
    }

    if (!transcriptResponse) {
      logger.warn("⚠️ Invalid transcript response", {
        prefix: "Captions",
        data: { videoId: video.id },
      });
      return null;
    }

    const content = transcriptResponse?.content as string;
    const language = transcriptResponse.lang;

    return {
      transcript: content,
      language: language,
      duration: 0,
    };

    /*
    logger.debug("🔍 HTML content", {
      prefix: "Captions",
      data: { htmlContent },
    });

    // Log all the HTML content's meta tags
    logger.debug("🔍 HTML content meta tags", {
      prefix: "Captions",
      data: { metaTags: htmlContent.match(/<meta[^>]*>/g) },
    });

    // Basic validation
    if (htmlContent.length < 1000) {
      logger.warn("⚠️ HTML content suspiciously small", {
        prefix: "Captions",
        data: { length: htmlContent.length },
      });
      return null;
    }

    const captionTracksRegex = /"captionTracks":\[(.*?)\](?=,\s*")/;
    const match = htmlContent.match(captionTracksRegex);

    if (!match?.[1]) {
      logger.warn("⚠️ No caption tracks found", {
        prefix: "Captions",
        data: { videoId: video.id },
      });
      return null;
    }

    const captionTracks = JSON.parse(`[${match[1]}]`);
    logger.debug("📋 Found caption tracks", {
      prefix: "Captions",
      data: { 
        tracks: captionTracks.map((track: YouTubeCaptionTrack) => ({
          language: track.languageCode,
          isAuto: track.kind?.includes("asr"),
        }))
      },
    });

    const selectedTrack = findBestCaptionTrack(captionTracks);
    if (!selectedTrack?.baseUrl) {
      logger.warn("⚠️ No suitable caption track found", {
        prefix: "Captions",
        data: { videoId: video.id },
      });
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

    logger.info("✅ Successfully fetched captions", {
      prefix: "Captions",
      data: {
        language: selectedTrack.languageCode,
        length: transcript.length,
        isAuto: selectedTrack.kind?.includes("asr"),
      },
    });

    return {
      transcript,
      language: selectedTrack.languageCode || "en",
      duration: 0,
    };
    */
  } catch (error) {
    logger.error("💥 Caption fetcher error", {
      prefix: "Captions",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        videoId: video.id,
      },
    });
    return null;
  }
};

export async function fetchCaptions(
  videoId: string,
  title?: string
): Promise<CaptionData | null> {
  logger.info("🎥 Fetching captions for video", {
    prefix: "Captions",
    data: { videoId, title },
  });

  try {
    const storedCaptions = await getStoredCaptions(videoId);
    if (storedCaptions) {
      logger.info("📚 Using stored captions", {
        prefix: "Captions",
        data: { videoId },
      });
      return storedCaptions;
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
      duration: 0,
    });

    return captionData;
  } catch (error) {
    logger.error("❌ Error fetching captions", {
      prefix: "Captions",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        videoId,
        title,
      },
    });
    throw new Error(
      `Failed to fetch captions: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
