import { NextResponse } from "next/server";
import { getPlainTextTranscript } from "@/lib/supadata";
import { generateVideoSummary } from "@/lib/ai-processor";
import { getStoredAIContent, storeAIContent } from "@/lib/supabase";
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

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.items?.[0]) {
      throw new Error("No video data found");
    }

    return data.items[0].snippet.title;
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
  logger.info("🎬 Starting video summarization request", {
    prefix: "Summarize",
  });

  try {
    // Parse request body
    const body = await request.json();
    const { url, language = "en" } = body;

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

    logger.info("🔍 Processing video", {
      prefix: "Summarize",
      data: { videoId, language },
    });

    // Check if we already have AI content stored
    const storedContent = await getStoredAIContent(videoId);
    let title = storedContent?.content?.title;

    // Only fetch from YouTube API if title is empty or undefined
    if (!title) {
      logger.info("📝 Fetching video title from YouTube API", {
        prefix: "Summarize",
      });
      title = await fetchVideoMetadata(videoId);
    }

    if (storedContent) {
      logger.info("📦 Found stored AI content", { prefix: "Summarize" });
      return NextResponse.json({
        success: true,
        videoId,
        title: title || "YouTube Video",
        summary: storedContent.content,
        cached: true,
      });
    }

    // Get transcript
    logger.info("📝 Fetching transcript", { prefix: "Summarize" });
    const transcript = await getPlainTextTranscript(videoId, language);

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    // Generate summary using AI processor
    logger.info("🤖 Generating summary", { prefix: "Summarize" });
    const now = new Date().toISOString();
    const summary = await generateVideoSummary(
      {
        id: videoId,
        title: title || "YouTube Video",
        url: `https://youtube.com/watch?v=${videoId}`,
        date: now,
        firstSeen: now,
      },
      transcript,
      language
    );

    if (!summary) {
      return NextResponse.json(
        { error: "Failed to generate summary" },
        { status: 500 }
      );
    }

    // Store the AI content
    await storeAIContent(videoId, {
      content: {
        briefSummary: summary.briefSummary,
        keyPoints: summary.keyPoints,
        title: title || "YouTube Video",
      },
      model: "gpt-4o-mini",
    });

    const endTime = performance.now();
    logger.info("✅ Summary generated successfully", {
      prefix: "Summarize",
      data: { duration: `${(endTime - startTime).toFixed(2)}ms` },
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
