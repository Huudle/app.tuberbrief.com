import { NextResponse } from "next/server";
import { YouTubeQueueMessage } from "@/lib/types";
import { supabaseService } from "@/lib/supabase";

// Constants
const QUEUE_NAME = "youtube_data_queue";

// Initialize Supabase client
const supabase = supabaseService(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export async function POST(request: Request) {
  const startTime = performance.now();
  console.log("🔔 Starting YouTube data queue processing");

  try {
    const body = await request.json();
    const { channelId, videoId, title, authorName, published, updated } =
      body as YouTubeQueueMessage;

    console.log("📝 Queue message:", {
      channelId,
      videoId,
      title,
      authorName,
      published: published?.slice(0, 10), // Log only date part
      updated: updated?.slice(0, 10),
    });

    // Send message to queue
    const { data, error } = await supabase.rpc("send", {
      queue_name: QUEUE_NAME,
      message: {
        channelId,
        videoId,
        title,
        authorName,
        published,
        updated,
        timestamp: new Date().toISOString(),
      },
    });

    if (error) {
      console.error("❌ Queue error:", error.message);
      throw error;
    }

    const endTime = performance.now();
    console.log("✅ Message sent to queue successfully");
    console.log(
      `⏱️ Request completed in ${(endTime - startTime).toFixed(2)}ms`
    );

    return NextResponse.json({
      success: true,
      message: "Data queued for processing",
      messageId: data,
    });
  } catch (error) {
    const endTime = performance.now();
    console.error("💥 Queue processing error:", error);
    console.error("Failed after:", (endTime - startTime).toFixed(2), "ms");

    return NextResponse.json(
      {
        error: "Failed to queue data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const startTime = performance.now();
  console.log("🔍 Starting queue message retrieval");

  try {
    // Read message from queue
    const { data, error } = await supabase.rpc("pop", {
      queue_name: QUEUE_NAME,
      msgs_per_batch: 1,
    });

    if (error) {
      console.error("❌ Queue error:", error.message);
      throw error;
    }

    const endTime = performance.now();
    console.log("✅ Queue message retrieved successfully");
    console.log(
      `⏱️ Request completed in ${(endTime - startTime).toFixed(2)}ms`
    );

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No messages in queue",
      });
    }

    const message = data[0] as YouTubeQueueMessage;
    console.log("📦 Retrieved message:", {
      ...message,
      published: message.published?.slice(0, 10),
      updated: message.updated?.slice(0, 10),
    });

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    const endTime = performance.now();
    console.error("💥 Queue retrieval error:", error);
    console.error("Failed after:", (endTime - startTime).toFixed(2), "ms");

    return NextResponse.json(
      {
        error: "Failed to retrieve queue message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
