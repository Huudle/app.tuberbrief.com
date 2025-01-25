import xml2js from "xml2js";
import { PubSubHubbubNotification } from "@/lib/types";
import { buildUrl } from "@/lib/utils";

// Helper function to make internal API calls
async function internalFetch(path: string, options: RequestInit) {
  const url = buildUrl(path);
  console.log("🔗 Internal API call to:", url);
  return fetch(url, options);
}

export async function GET(request: Request) {
  console.log("🔔 Received hub verification request");
  const { searchParams } = new URL(request.url);

  // Log verification request details
  console.log("📝 Verification parameters:", {
    mode: searchParams.get("hub.mode"),
    topic: searchParams.get("hub.topic"),
    challenge:
      "..." + (searchParams.get("hub.challenge")?.slice(-10) || "none"),
  });

  // Handle subscription verification
  const mode = searchParams.get("hub.mode");
  const topic = searchParams.get("hub.topic");
  const challenge = searchParams.get("hub.challenge");

  if (!mode || !topic || !challenge) {
    console.error("❌ Missing required verification parameters");
    return new Response("Bad Request: Missing Parameters", { status: 400 });
  }

  // Verify the subscription request
  if (mode === "subscribe" || mode === "unsubscribe") {
    console.log("✅ Verification successful");
    // Return the challenge code to confirm the subscription
    return new Response(challenge, { status: 200 });
  }

  console.error("❌ Invalid hub mode:", mode);
  return new Response("Bad Request: Invalid Mode", { status: 400 });
}

export async function POST(request: Request) {
  const startTime = performance.now();
  console.log("🔔 Received content notification");

  try {
    // Get the raw body
    const rawBody = await request.text();
    console.log("📦 Received payload size:", rawBody.length, "bytes");

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

    console.log("📺 Video details:", {
      videoId,
      channelId,
      title,
      authorName,
      published: published,
      updated: updated,
    });

    console.log("📦 Queueing video data for processing");

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
    console.log(
      `⏱️ Notification processed in ${(endTime - startTime).toFixed(2)}ms`
    );

    // Return 200 to acknowledge receipt
    return new Response("OK", { status: 200 });
  } catch (error) {
    const endTime = performance.now();
    console.error("💥 Error processing notification:", error);
    console.error("Failed after:", (endTime - startTime).toFixed(2), "ms");

    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        cause: error.cause,
      });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}
