import { buildUrl } from "@/lib/utils";

type PubSubMode = "subscribe" | "unsubscribe";

interface PubSubOptions {
  channelId: string;
  mode?: PubSubMode;
  leaseSeconds?: number;
  ngrokUrl?: string;
}

/**
 * Manages PubSubHubbub subscriptions for YouTube channels
 */
export async function managePubSubHubbub({
  channelId,
  mode = "subscribe",
  // leaseSeconds = default,
  // When you subscribe to a topic (e.g., a YouTube channel's feed) using the PubSubHubbub hub, you specify a lease_seconds parameter. YouTube's implementation usually defaults to 30 days (2,592,000 seconds) for the lease duration.
  ngrokUrl,
}: PubSubOptions): Promise<void> {
  // Build callback URL (with ngrok support for local development)
  let callbackUrl = buildUrl("/api/youtube/webhook");
  if (process.env.NODE_ENV === "development" && ngrokUrl) {
    callbackUrl = `${ngrokUrl}/api/youtube/webhook`;
  }

  const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

  // Use APP_URL for the API endpoint
  const apiUrl = buildUrl("/api/youtube/pubsubhubbub");

  const pubsubResponse = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      callbackUrl,
      topicUrl,
      mode,
    }),
  });

  if (!pubsubResponse.ok) {
    const errorText = await pubsubResponse.text();
    throw new Error(`Failed to ${mode} from PubSubHubbub: ${errorText}`);
  }

  const result = await pubsubResponse.json();
  if (!result.success) {
    throw new Error(result.error || `Failed to ${mode} channel updates`);
  }
}
