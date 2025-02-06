import { NextResponse } from "next/server";
import { YouTubeQueueMessage } from "@/lib/types";
import { supabaseServicePGMQPublic } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// Constants
const QUEUE_NAME = "youtube_data_queue";

// 🚨 CRITICAL WARNING!!! DO NOT DELETE THIS COMMENT 🚨
// ISSUE: Queue works initially but then STOPS with the following error:
/*
permission denied for sequence q_youtube_data_queue_msg_id_seq
{
  code: '42501',
  details: null,
  hint: null,
  message: 'permission denied for sequence q_youtube_data_queue_msg_id_seq'
}
*/
// FIX: Run the following command in the Supabase console to resolve it:
// GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pgmq TO service_role;

// Initialize Supabase client
const supabase = supabaseServicePGMQPublic(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export async function POST(request: Request) {
  const startTime = performance.now();
  logger.info("🔔 Starting YouTube data queue processing", { prefix: "Queue" });

  try {
    const body = await request.json();
    const { channelId, videoId, title, authorName, published, updated } =
      body as YouTubeQueueMessage;

    logger.info("📝 Queue message:", {
      prefix: "Queue",
      data: {
        channelId,
        videoId,
        title,
        authorName,
        published,
        updated,
      },
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
      logger.error("❌ Queue error:", {
        prefix: "Queue",
        data: { error: error.message },
      });
      throw error;
    }

    const endTime = performance.now();
    logger.info("✅ Message sent to queue successfully", { prefix: "Queue" });
    logger.info(
      `⏱️ Request completed in ${(endTime - startTime).toFixed(2)}ms`,
      {
        prefix: "Queue",
        data: { duration: `${(endTime - startTime).toFixed(2)}ms` },
      }
    );

    return NextResponse.json({
      success: true,
      message: "Data queued for processing",
      messageId: data,
    });
  } catch (error) {
    const endTime = performance.now();
    logger.error("💥 Queue processing error:", {
      prefix: "Queue",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        duration: `${(endTime - startTime).toFixed(2)}ms`,
      },
    });

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
  logger.info("🔍 Starting queue message retrieval", { prefix: "Queue" });

  try {
    // Read message from queue
    const { data, error } = await supabase.rpc("pop", {
      queue_name: QUEUE_NAME,
      msgs_per_batch: 1,
    });

    if (error) {
      logger.error("❌ Queue error:", {
        prefix: "Queue",
        data: { error: error.message },
      });
      throw error;
    }

    const endTime = performance.now();
    logger.info("✅ Queue message retrieved successfully", { prefix: "Queue" });
    logger.info(
      `⏱️ Request completed in ${(endTime - startTime).toFixed(2)}ms`,
      {
        prefix: "Queue",
        data: { duration: `${(endTime - startTime).toFixed(2)}ms` },
      }
    );

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No messages in queue",
      });
    }

    const message = data[0] as YouTubeQueueMessage;
    logger.info("📦 Retrieved message:", {
      prefix: "Queue",
      data: {
        ...message,
        published: message.published?.slice(0, 10),
        updated: message.updated?.slice(0, 10),
      },
    });

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    const endTime = performance.now();
    logger.error("💥 Queue retrieval error:", {
      prefix: "Queue",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        duration: `${(endTime - startTime).toFixed(2)}ms`,
      },
    });

    return NextResponse.json(
      {
        error: "Failed to retrieve queue message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
