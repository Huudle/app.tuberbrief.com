import xml2js from "xml2js";
import { PubSubHubbubNotification } from "@/lib/types";
import { logger } from "@/lib/logger";
import { internalFetch } from "@/lib/utils";

export async function GET(request: Request) {
  logger.info("🔔 Received hub verification request", {
    prefix: "YouTube Webhook",
  });
  const { searchParams } = new URL(request.url);

  // Log verification request details
  logger.info("📝 Verification parameters", {
    prefix: "YouTube Webhook",
    data: {
      mode: searchParams.get("hub.mode"),
      topic: searchParams.get("hub.topic"),
      challenge:
        "..." + (searchParams.get("hub.challenge")?.slice(-10) || "none"),
    },
  });

  // Handle subscription verification
  const mode = searchParams.get("hub.mode");
  const topic = searchParams.get("hub.topic");
  const challenge = searchParams.get("hub.challenge");

  if (!mode || !topic || !challenge) {
    logger.error("Missing required verification parameters", {
      prefix: "YouTube Webhook",
    });
    return new Response("Bad Request: Missing Parameters", { status: 400 });
  }

  // Verify the subscription request
  if (mode === "subscribe" || mode === "unsubscribe") {
    logger.info("✅ Verification successful", { prefix: "YouTube Webhook" });
    return new Response(challenge, { status: 200 });
  }

  logger.error("❌ Invalid hub mode", {
    prefix: "YouTube Webhook",
    data: { mode },
  });
  return new Response("Bad Request: Invalid Mode", { status: 400 });
}

export async function POST(request: Request) {
  const startTime = performance.now();
  logger.info("📨 Received content notification", {
    prefix: "YouTube Webhook",
  });

  try {
    // Get the raw body
    const rawBody = await request.text();
    logger.debug("📦 Received payload", {
      prefix: "YouTube Webhook",
      data: { rawBody },
    });

    // if rawBody is like this:
    /* {
      "rawBody": "<?xml version='1.0' encoding='UTF-8'?>\n<feed xmlns:at=\"http://purl.org/atompub/tombstones/1.0\" xmlns=\"http://www.w3.org/2005/Atom\"><at:deleted-entry ref=\"yt:video:POOwHEPk3d4\" when=\"2025-02-14T14:39:49.240698+00:00\">\n  <link href=\"https://www.youtube.com/watch?v=POOwHEPk3d4\"/>\n  <at:by>\n   <name>Arda Basoglu</name>\n   <uri>https://www.youtube.com/channel/UCW5wxEjGHWNyatgZe-PU_tA</uri>\n  </at:by>\n </at:deleted-entry></feed>\n"
    }
    */

    // detect deleted-entry
    if (rawBody.includes("deleted-entry")) {
      logger.info("🔴 Deleted entry detected", {
        prefix: "YouTube Webhook",
        data: { rawBody },
      });
      return new Response("OK", { status: 200 });
    }

    // Parse XML content
    const parser = new xml2js.Parser();
    const result = (await parser.parseStringPromise(
      rawBody
    )) as PubSubHubbubNotification;

    if (!result.feed?.entry?.[0]) {
      throw new Error("Invalid feed format: No entries found");
    }

    const entry = result.feed.entry[0];
    const videoId = entry["yt:videoId"][0];
    const channelId = entry["yt:channelId"][0];
    const title = entry.title[0];
    const authorName = entry.author[0].name[0];
    const published = entry.published[0];
    const updated = entry.updated[0];

    logger.info("📺 Video details", {
      prefix: "YouTube Webhook",
      data: {
        videoId,
        channelId,
        title,
        authorName,
        published,
        updated,
      },
    });

    logger.info("🎯 Queueing video data for processing", {
      prefix: "YouTube Webhook",
    });

    // Use internal fetch instead of direct fetch
    const queueResponse = await internalFetch("/api/youtube/queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        videoId,
        channelId,
        title,
        authorName,
        published,
        updated,
      }),
    });

    if (!queueResponse.ok) {
      const error = await queueResponse.json();
      throw new Error(
        `Queue error: ${error.details || "Failed to queue message"}`
      );
    }

    const endTime = performance.now();
    logger.info("✅ Notification processed successfully", {
      prefix: "YouTube Webhook",
      data: { duration: `${(endTime - startTime).toFixed(2)}ms` },
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    const endTime = performance.now();
    logger.error("💥 Error processing notification", {
      prefix: "YouTube Webhook",
      data: {
        duration: `${(endTime - startTime).toFixed(2)}ms`,
        error: error instanceof Error ? error.message : "Unknown error",
        cause: error instanceof Error ? error.cause : undefined,
      },
    });

    return new Response("Internal Server Error", { status: 500 });
  }
}
