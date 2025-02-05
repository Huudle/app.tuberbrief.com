import {
  supabaseServicePGMQPublic,
  supabaseServicePublic,
  getStoredAIContent,
  storeAIContent,
} from "@/lib/supabase";
import { YouTubeQueueMessage, PGMQMessage, Video } from "@/lib/types";
import { fetchCaptions } from "@/lib/captions";
import { generateEmailTemplate } from "@/lib/email-template";
import { generateVideoSummary } from "@/lib/ai-processor";
import { managePubSubHubbub } from "@/lib/pubsub";

const QUEUE_NAME = "youtube_data_queue";
const POLLING_INTERVAL = 5000;
export class QueueWorker {
  public isRunning: boolean = false;
  private supabasePGMQ = supabaseServicePGMQPublic(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
  private supabasePublic = supabaseServicePublic;

  async start() {
    this.isRunning = true;
    console.log("🎬 Starting queue worker");

    while (this.isRunning) {
      try {
        await this.processNextMessage();
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      } catch (error) {
        console.error("💥 Queue worker error:", error);
      }
    }
  }

  stop() {
    this.isRunning = false;
    console.log("🛑 Stopping queue worker");
  }

  private async processNextMessage() {
    // Track the popped message for potential re-queueing
    let queueMessage: PGMQMessage<YouTubeQueueMessage> | null = null;
    try {
      // Pop a message from the queue - this both retrieves and removes the message atomically
      console.log("🔍 Popping message from queue");
      const { data: messages, error: popError } = await this.supabasePGMQ.rpc(
        "pop",
        {
          queue_name: QUEUE_NAME,
        }
      );
      if (popError) {
        throw new Error(`Queue pop error: ${popError.message}`);
      }
      if (!messages || messages.length === 0) {
        return; // No messages to process
      }

      // Extract message and prepare for processing
      queueMessage = messages[0] as PGMQMessage<YouTubeQueueMessage>;
      const message = queueMessage.message;
      console.log("📦 Processing message:", {
        msgId: queueMessage.msg_id,
        readCount: queueMessage.read_ct,
        enqueuedAt: queueMessage.enqueued_at,
        videoId: message.videoId,
        channelId: message.channelId,
        authorName: message.authorName,
        title: message.title,
        published: message.published,
      });

      const deleteMessage = async () => {
        await this.supabasePGMQ.rpc("delete", {
          queue_name: QUEUE_NAME,
          msg_id: queueMessage?.msg_id,
        });
      };

      console.log("🔍 Checking if channel is subscribed");
      // If message.channelId is not found in the profile_youtube_channels table, delete the message, unsubscribe the channel and return
      const { data: channelData } = await this.supabasePublic
        .from("profile_youtube_channels")
        .select("profile_id")
        .eq("youtube_channel_id", message.channelId);
      if (channelData?.length === 0) {
        console.log("ℹ️ Skipping processing due to non subscribed channel");
        await deleteMessage();
        // Unsubscribe the channel
        console.log("🔍 Unsubscribing from channel:", message.channelId);
        await managePubSubHubbub({
          channelId: message.channelId,
          mode: "unsubscribe",
        });
        return;
      } else {
        console.log("🔍 Channel is subscribed" + message.channelId);
      }

      // If videoId or channelId is empty, delete the message and return
      if (!message.videoId || !message.channelId) {
        console.log("ℹ️ Skipping processing due to empty videoId or channelId");
        await deleteMessage();
        return;
      }

      console.log("📦 Starting processing at:", new Date().toISOString());

      // Fetch video captions
      const captions = await fetchCaptions(message.videoId, message.title);
      console.log("🔍 Captions:", captions);
      // If captions are empty, delete the message and return
      if (!captions) {
        console.log("ℹ️ Skipping processing due to empty captions");
        await deleteMessage();
        return;
      }

      // Check for existing AI content
      const aiContent = await getStoredAIContent(message.videoId);
      let summary;

      if (!aiContent) {
        // Generate new AI content only if not exists
        const aiSummary = await generateVideoSummary(
          {
            id: message.videoId,
            title: message.title,
            url: `https://youtube.com/watch?v=${message.videoId}`,
          } as Video,
          captions.transcript,
          captions.language
        );

        if (aiSummary) {
          // Store the new AI content
          await storeAIContent(message.videoId, {
            content: {
              briefSummary: aiSummary.briefSummary,
              keyPoints: aiSummary.keyPoints,
            },
            model: "gpt-4o-mini", // Get from AI processor
          });
          summary = aiSummary;
        }
      } else {
        summary = aiContent.content;
      }

      // Generate email content with AI content
      const emailContent = generateEmailTemplate({
        videoTitle: message.title,
        channelName: message.authorName,
        publishedAt: message.published,
        videoId: message.videoId,
        captions,
        summary: summary
          ? {
              briefSummary: summary.briefSummary,
              keyPoints: summary.keyPoints,
            }
          : undefined,
        upgradeCTA: "Want more features? Upgrade your plan!",
        showTranscript: false,
        showUpgradeCTA: false,
      });

      // Get subscribers for this channel
      const { data: subscribers } = await this.supabasePublic
        .from("profile_youtube_channels")
        .select("profile_id")
        .eq("youtube_channel_id", message.channelId);
      if (!subscribers) {
        console.log("ℹ️ No subscribers found for channel");
        return;
      }
      // Log the subscribers
      console.log("👥 Subscribers:", subscribers);
      // Check existing notifications
      const { data: existingNotifications } = await this.supabasePublic
        .from("email_notifications")
        .select("profile_id")
        .eq("video_id", message.videoId)
        .in(
          "profile_id",
          subscribers.map((s) => s.profile_id)
        );
      // Filter out subscribers who already have notifications
      const existingProfileIds = new Set(
        existingNotifications?.map((n) => n.profile_id) || []
      );
      console.log("🔍 Existing profile IDs:", existingProfileIds);
      const newSubscribers = subscribers.filter(
        (sub) => !existingProfileIds.has(sub.profile_id)
      );
      if (newSubscribers.length === 0) {
        console.log("ℹ️ All subscribers already notified");
        return;
      }
      // Create notifications with AI-enhanced content
      const notifications = newSubscribers.map((sub) => ({
        profile_id: sub.profile_id,
        channel_id: message.channelId,
        video_id: message.videoId,
        title: message.title,
        email_content: emailContent.replace(/\n/g, ""),
        status: "pending",
        created_at: new Date().toISOString(),
      }));
      console.log("📧 Creating notifications:", {
        total: subscribers.length,
        new: newSubscribers.length,
        existing: existingProfileIds.size,
      });
      const { error: notificationError } = await this.supabasePublic
        .from("email_notifications")
        .insert(notifications);
      if (notificationError) {
        console.error("❌ Failed to save notifications:", notificationError);
        throw notificationError;
      }
      console.log("✅ Successfully processed video:", message.videoId);
    } catch (error) {
      // Error handling and re-queue mechanism
      console.error("💥 Error processing message:", error);

      // Only attempt to re-queue if we successfully popped a message
      if (queueMessage) {
        const { error: requeueError } = await this.supabasePGMQ.rpc("send", {
          queue_name: QUEUE_NAME,
          message: queueMessage.message,
        });
        if (requeueError) {
          console.error("❌ Failed to re-queue message:", requeueError);
        } else {
          console.log("♻️ Message re-queued successfully");
        }
      }
    }
  }
}
