import { NextResponse } from "next/server";
import { getPlainTextTranscript } from "@/lib/supadata";
import { generateVideoSummary } from "@/lib/ai-processor";
import { getStoredAIContent, storeAIContent } from "@/lib/supabase";
import {
  checkSubscriptionLimit,
  incrementSubscriptionUsage,
} from "@/lib/supabase";
import { logger } from "@/lib/logger";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// Helper function to extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("youtube.com")) {
      return urlObj.searchParams.get("v");
    } else if (urlObj.hostname.includes("youtu.be")) {
      return urlObj.pathname.slice(1);
    }
    return null;
  } catch {
    return null;
  }
}

// Helper function to fetch video metadata from YouTube API
async function fetchVideoMetadata(videoId: string) {
  try {
    const url = new URL(`${YOUTUBE_API_BASE}/videos`);
    url.searchParams.append("part", "snippet");
    url.searchParams.append("id", videoId);
    url.searchParams.append("key", process.env.YOUTUBE_API_KEY!);

    // Log the URL
    logger.info("🔍 Fetching video metadata", {
      prefix: "YouTube API",
      data: { url: url.toString() },
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.items?.[0]) {
      throw new Error("No video data found");
    }

    return data.items[0].snippet;
  } catch (error) {
    logger.error("❌ Error fetching video metadata", {
      prefix: "YouTube API",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    return null;
  }
}

export async function POST(request: Request) {
  const startTime = performance.now();

  try {
    // Get user session (already handled by middleware)
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");

    if (!profileId) {
      return NextResponse.json(
        { error: "Profile ID is required" },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: "YouTube URL is required" },
        { status: 400 }
      );
    }

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    // Check for cached content first
    const storedContent = await getStoredAIContent(videoId);
    let title = storedContent?.content?.title;
    let defaultLanguage = storedContent?.content?.defaultLanguage;

    // Only fetch from YouTube API if title is empty or undefined
    if (!title || !defaultLanguage) {
      logger.info("📝 Fetching video title from YouTube API", {
        prefix: "Summarize",
      });
      const videoMetadata = await fetchVideoMetadata(videoId);
      title = videoMetadata?.title;
      defaultLanguage = videoMetadata?.defaultLanguage;
    }

    if (storedContent) {
      logger.info("📦 Serving cached content", {
        prefix: "Summarize",
        data: { videoId, profileId },
      });

      return NextResponse.json({
        success: true,
        videoId,
        title: title || "YouTube Video",
        summary: storedContent.content,
        cached: true,
      });
    }

    // Only check subscription limits if we need to generate new content
    const { isAtLimit, currentUsage, monthlyLimit } =
      await checkSubscriptionLimit(profileId);

    if (isAtLimit) {
      return NextResponse.json(
        {
          error: "Monthly limit reached",
          currentUsage,
          monthlyLimit,
        },
        { status: 429 }
      );
    }

    // Get transcript
    logger.info("📝 Fetching transcript", {
      prefix: "Summarize",
      data: { videoId, profileId },
    });

    const transcript = await getPlainTextTranscript(videoId, defaultLanguage);
    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    // Generate summary
    logger.info("🤖 Generating summary", {
      prefix: "Summarize",
      data: { videoId, profileId },
    });

    const summary = await generateVideoSummary(
      {
        id: videoId,
        title: title || "YouTube Video",
        url: `https://youtube.com/watch?v=${videoId}`,
        date: new Date().toISOString(),
        firstSeen: new Date().toISOString(),
      },
      transcript,
      defaultLanguage
    );

    if (!summary) {
      return NextResponse.json(
        { error: "Failed to generate summary" },
        { status: 500 }
      );
    }

    // Store the AI content
    logger.info("💾 Storing AI content", {
      prefix: "Summarize",
      data: { videoId, profileId },
    });

    await storeAIContent(videoId, {
      content: {
        briefSummary: summary.briefSummary,
        keyPoints: summary.keyPoints,
        title: title || "YouTube Video",
        defaultLanguage: defaultLanguage || "en",
      },
      model: "gpt-4o-mini",
    });

    // Only increment usage for newly generated content
    logger.info("📊 Incrementing usage count", {
      prefix: "Summarize",
      data: { videoId, profileId },
    });

    await incrementSubscriptionUsage(profileId);

    const endTime = performance.now();
    logger.info("✅ Summary generated successfully", {
      prefix: "Summarize",
      data: {
        duration: `${(endTime - startTime).toFixed(2)}ms`,
        videoId,
        profileId,
      },
    });

    return NextResponse.json({
      success: true,
      videoId,
      title: title || "YouTube Video",
      summary,
      cached: false,
    });
  } catch (error) {
    const endTime = performance.now();
    logger.error("💥 Error generating summary", {
      prefix: "Summarize",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        duration: `${(endTime - startTime).toFixed(2)}ms`,
      },
    });

    return NextResponse.json(
      {
        error: "Failed to generate summary",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
